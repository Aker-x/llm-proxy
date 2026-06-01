const crypto = require('crypto');
const { getProxyApi } = require('./proxy-apis');
const { buildSyntheticStream } = require('./proxy-apis/synthetic-streams');
const { normalizeResponsesStreamCompletion } = require('./proxy-apis/responses-stream-normalizer');
const { getApiLabel, PROXY_API_IDS } = require('./proxy-apis/constants');
const { ensureJsonObjectBody, stripInternalRoutingFields, summarizeText } = require('./proxy-apis/shared');
const { convertRequestBody, convertResponseBody, getBaseApiId } = require('./proxy-apis/converters');
const { estimateAnthropicMessageInputTokens } = require('./messages-token-counter');
const { calculateCost } = require('./cost-calculator');
const { createHttpError } = require('../utils/http-error');
const { sanitizeHeadersForLog } = require('../utils/sanitize');
const { connectRedisClient } = require('../db/redis-client');

function normalizeClientHeaders(headers = {}) {
    const normalizedHeaders = {};

    for (const [key, value] of Object.entries(headers || {})) {
        if (value === undefined || value === null) {
            continue;
        }

        normalizedHeaders[String(key).toLowerCase()] = Array.isArray(value)
            ? value.join(', ')
            : String(value);
    }

    return normalizedHeaders;
}

function toPositiveInteger(value, fallbackValue) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return Math.floor(numericValue);
}

function isNoAvailableModelsError(error) {
    return Number(error?.status || 0) === 400
        && /has no available models/i.test(String(error?.message || ''));
}

function buildExhaustedUpstreamError(externalModelName, lastError) {
    const modelLabel = externalModelName
        ? `External model "${externalModelName}"`
        : 'External model';
    const upstreamReason = String(lastError?.message || 'unknown upstream error').trim();

    return createHttpError(
        502,
        `${modelLabel} upstream request failed and all fallback source models were exhausted: ${upstreamReason}`
    );
}

function inferModelLimits(model, sourceModel = null) {
    const values = [
        model?.externalModelName,
        model?.sourceModelId,
        sourceModel?.id,
        sourceModel?.upstreamModel,
        sourceModel?.name,
        model?.upstreamModel,
        model?.sourceModelName,
        model?.id,
    ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());

    if (values.includes('gpt-5.4')) {
        return {
            maxInputTokens: 1050000,
            maxTokens: 128000,
            inferred: false,
        };
    }

    if (values.some((value) => value.startsWith('claude'))) {
        return {
            maxInputTokens: 200000,
            maxTokens: 64000,
            inferred: true,
        };
    }

    if (values.some((value) => value.startsWith('gpt-5'))) {
        return {
            maxInputTokens: 400000,
            maxTokens: 128000,
            inferred: true,
        };
    }

    if (values.some((value) => value.startsWith('gemini'))) {
        return {
            maxInputTokens: 1000000,
            maxTokens: 65536,
            inferred: true,
        };
    }

    return {
        maxInputTokens: 200000,
        maxTokens: 32768,
        inferred: true,
    };
}

function buildConnectivityTestBody(apiId, upstreamModel) {
    const connectivityPrompt = 'Reply with exactly OK';

    switch (getBaseApiId(apiId)) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return {
            model: upstreamModel,
            messages: [{ role: 'user', content: connectivityPrompt }],
            stream: false,
        };
    case PROXY_API_IDS.RESPONSES:
        return {
            model: upstreamModel,
            input: [{
                type: 'message',
                role: 'user',
                content: [{
                    type: 'input_text',
                    text: connectivityPrompt,
                }],
            }],
            stream: false,
        };
    case PROXY_API_IDS.MESSAGES:
        return {
            model: upstreamModel,
            messages: [{
                role: 'user',
                content: [{ type: 'text', text: connectivityPrompt }],
            }],
            stream: false,
            max_tokens: 10,
        };
    default:
        throw createHttpError(500, `Unsupported connectivity test API: ${apiId}`);
    }
}

function buildConnectivityPreview({ upstreamApiId, parsedResponse, responseText }) {
    if (parsedResponse && typeof parsedResponse === 'object') {
        try {
            const chatCompletionBody = convertResponseBody({
                fromApiId: upstreamApiId,
                toApiId: PROXY_API_IDS.CHAT_COMPLETIONS,
                body: parsedResponse,
            });
            const choice = Array.isArray(chatCompletionBody?.choices)
                ? chatCompletionBody.choices[0]
                : null;
            const message = choice?.message || {};
            const text = typeof message.content === 'string'
                ? message.content
                : '';

            if (text.trim()) {
                return summarizeText(text);
            }

            if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
                const toolNames = message.tool_calls
                    .map((toolCall) => String(toolCall?.function?.name || '').trim())
                    .filter(Boolean);
                if (toolNames.length > 0) {
                    return `tool calls: ${toolNames.join(', ')}`;
                }
                return `tool calls: ${message.tool_calls.length}`;
            }

            return summarizeText(JSON.stringify(parsedResponse));
        } catch {
            return summarizeText(JSON.stringify(parsedResponse));
        }
    }

    return summarizeText(responseText);
}

function isEmptySuccessfulResponse({ parsedResponse, responseText }) {
    if (parsedResponse && typeof parsedResponse === 'object') {
        return false;
    }

    return !String(responseText || '').trim();
}

function applyClientVisibleModelName(payload, clientApiId, clientModelName) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return payload;
    }

    if (!clientModelName) {
        return payload;
    }

    if (
        clientApiId === PROXY_API_IDS.CHAT_COMPLETIONS
        || clientApiId === PROXY_API_IDS.RESPONSES
        || clientApiId === PROXY_API_IDS.MESSAGES
    ) {
        return {
            ...payload,
            model: clientModelName,
        };
    }

    return payload;
}

class ProxyService {
    constructor({
        statsService,
        modelResolutionService,
        requestAccountingService,
        paymentConfigService,
        userLookup,
        subscriptionService,
        catalogAdminService,
        userRateLimitScheduler = null,
        userRateLimitWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        waitForBootstrapReady = async () => undefined,
        redisClient = null,
    }) {
        this.statsService = statsService;
        this.modelResolutionService = modelResolutionService;
        this.requestAccountingService = requestAccountingService;
        this.paymentConfigService = paymentConfigService;
        this.userLookup = userLookup;
        this.subscriptionService = subscriptionService;
        this.catalogAdminService = catalogAdminService;
        this.userRateLimitScheduler = userRateLimitScheduler;
        this.userRateLimitWait = userRateLimitWait;
        this.waitForBootstrapReady = waitForBootstrapReady;
        this.redisClient = redisClient;
        this.userRequestLocks = new Map();
        this.modelCatalogCreatedAt = new Date().toISOString();
    }

    async ensureBootstrapReady() {
        await this.waitForBootstrapReady();
    }

    async waitForUserRateLimitSlot({ username, requestId }) {
        if (!username || !this.userRateLimitScheduler) {
            return null;
        }

        const result = await this.userRateLimitScheduler(username);
        if (!result?.rateLimitEnabled) {
            return result;
        }

        const intervalSeconds = Math.max(1, Number(result.intervalSeconds || 1));
        const waitMs = Math.max(0, Number(result.waitMs || 0));
        if (waitMs <= 0) {
            return result;
        }

        console.info(
            `[${requestId}] User upstream rate limit queued request `
            + `user=${username} intervalSeconds=${intervalSeconds} waitMs=${Math.ceil(waitMs)}`
        );
        await this.userRateLimitWait(waitMs);
        return result;
    }

    shouldSerializeUserRequest(username) {
        if (this.requestAccountingService) {
            return false;
        }

        return Boolean(username);
    }

    buildUsageSnapshot(usage, pricing) {
        const costInfo = calculateCost(usage, pricing);
        return {
            costInfo,
            usageSnapshot: {
                inputTokens: costInfo.inputTokens,
                outputTokens: costInfo.outputTokens,
                thinkingTokens: costInfo.thinkingTokens,
                cacheReadTokens: costInfo.cacheReadTokens,
                cacheCreationTokens: costInfo.cacheCreationTokens,
                totalCost: costInfo.totalCost,
                currency: costInfo.currency,
            },
        };
    }

    estimateReservedAmountUsd({ body, model, sourceModel = null }) {
        const modelLimits = inferModelLimits(model, sourceModel);
        const requestedOutputTokens = Math.max(
            0,
            Number(
                body?.max_output_tokens
                ?? body?.max_completion_tokens
                ?? body?.max_tokens
                ?? 0
            ) || 0
        );
        const estimatedOutputTokens = Math.min(
            requestedOutputTokens || Math.min(modelLimits.maxTokens, 8192),
            modelLimits.maxTokens
        );

        let estimatedInputTokens = 8192;
        try {
            if (Array.isArray(body?.messages)) {
                estimatedInputTokens = Math.min(
                    estimateAnthropicMessageInputTokens(stripInternalRoutingFields(body)),
                    modelLimits.maxInputTokens
                );
            }
        } catch {
            estimatedInputTokens = Math.min(estimatedInputTokens, modelLimits.maxInputTokens);
        }

        const estimatedCost = calculateCost({
            input_tokens: estimatedInputTokens,
            output_tokens: estimatedOutputTokens,
        }, model.pricing);
        const bufferedReserve = Math.max(
            0.01,
            Number((estimatedCost.totalCost * 1.2).toFixed(6))
        );

        return bufferedReserve;
    }

    getExternalModelNameForAccess({ body, model, externalModel = null }) {
        return String(
            externalModel?.name
            || model?.externalModelName
            || body?.model
            || model?.name
            || ''
        ).trim();
    }

    async resolveAccessContextForRequest({
        username,
        requestId,
        quotaReservationRequestId = requestId,
        body,
        model,
        externalModel = null,
    }) {
        if (!this.subscriptionService) {
            return { mode: 'balance', subscription: null, appliedLimit: null };
        }

        return this.subscriptionService.resolveUsageAccess({
            username,
            requestId: quotaReservationRequestId || requestId,
            externalModelName: this.getExternalModelNameForAccess({ body, model, externalModel }),
        });
    }

    async reserveIfNeeded({
        username,
        requestId,
        body,
        provider,
        model,
        sourceModel = null,
        externalModel = null,
        accessContext = null,
        quotaReservationRequestId = requestId,
    }) {
        const resolvedAccessContext = accessContext || await this.resolveAccessContextForRequest({
            username,
            requestId,
            quotaReservationRequestId,
            body,
            model,
            externalModel,
        });

        if (resolvedAccessContext?.mode === 'blocked') {
            throw createHttpError(
                402,
                `模型“${resolvedAccessContext?.appliedLimit?.externalModelName || String(body?.model || '').trim() || model.name}”今日订阅额度已用完。你已关闭该模型的“额度用完后走余额”，请等待明天额度重置，或到订阅页重新开启。`
            );
        }

        if (resolvedAccessContext?.mode === 'subscription') {
            return {
                username,
                accountingMode: 'subscription',
                accessContext: resolvedAccessContext,
                appliedLimit: resolvedAccessContext.appliedLimit || null,
                quotaReservation: resolvedAccessContext.quotaReservation || null,
            };
        }

        const [billingConfig, user] = await Promise.all([
            this.paymentConfigService.getBillingConfig(),
            username ? this.userLookup(username) : Promise.resolve(null),
        ]);
        if (!billingConfig.rechargeEnabled || !user) {
            return {
                username,
                accountingMode: resolvedAccessContext?.mode || 'balance',
                accessContext: resolvedAccessContext,
            };
        }

        const currentBalanceUsd = Number(user.balance_usd || 0);
        if (currentBalanceUsd <= 0) {
            const quotaExhausted = resolvedAccessContext?.subscription?.active
                && resolvedAccessContext?.appliedLimit?.subscriptionExhausted;
            console.warn(
                `[${requestId}] Balance precheck rejected request `
                + `user=${username} provider=${provider.id} modelId=${model.id} `
                + `sourceModel=${sourceModel?.id || model.sourceModelId || model.id} `
                + `externalModel=${model.externalModelName || model.name} `
                + `currentBalanceUsd=${currentBalanceUsd.toFixed(6)} `
                + `requestedModel=${String(body?.model || '').trim() || 'n/a'}`
            );
            if (quotaExhausted) {
                throw createHttpError(
                    402,
                    `模型“${resolvedAccessContext.appliedLimit.externalModelName || String(body?.model || '').trim() || model.name}”今日订阅额度已用完。你已开启“额度用完后走余额”，但当前余额不足，请充值后继续使用，或等待明天额度重置。`
                );
            }
            throw createHttpError(402, 'Insufficient balance. Please recharge before using the proxy.');
        }

        return {
            username,
            balanceUsd: currentBalanceUsd,
            accountingMode: 'balance',
            accessContext: resolvedAccessContext,
        };
    }

    shouldSerializeSubscriptionRequest(username, accessContext = null) {
        return Boolean(
            username
            && this.subscriptionService
            && accessContext?.subscription?.active
            && accessContext?.appliedLimit
        );
    }

    isSubscriptionQuotaCharged(accessContext = null) {
        return !(
            accessContext?.mode === 'subscription'
            && accessContext?.appliedLimit?.quotaConsumptionEnabled === false
        );
    }

    buildAccountingPayload({
        requestId,
        username,
        success,
        costInfo,
        provider,
        model,
        latencyMs,
        clientModelName = '',
        subscriptionPlanId = null,
        accountingMode = 'balance',
        subscriptionQuotaCharged = true,
    }) {
        const visibleModelName = String(
            clientModelName
            || model.externalModelName
            || model.name
            || model.id
            || ''
        ).trim();
        const recentRequestModelId = accountingMode === 'subscription'
            ? visibleModelName
            : model.id;

        return {
            requestId,
            username,
            success,
            actualAmountUsd: costInfo.totalCost,
            requestSummary: {
                requestId,
                username: username || '',
                providerId: provider.id,
                providerName: provider.name,
                billingModelId: model.id,
                modelId: recentRequestModelId,
                modelName: visibleModelName || model.name,
                accountingMode,
                subscriptionPlanId: subscriptionPlanId || null,
                subscriptionQuotaCharged: subscriptionQuotaCharged !== false,
                success,
                inputTokens: costInfo.inputTokens,
                outputTokens: costInfo.outputTokens,
                thinkingTokens: costInfo.thinkingTokens,
                cacheReadTokens: costInfo.cacheReadTokens,
                cacheCreationTokens: costInfo.cacheCreationTokens,
                totalCost: costInfo.totalCost,
                currency: costInfo.currency,
                latencyMs,
            },
            statsEvent: {
                requestId,
                username: username || null,
                providerId: provider.id,
                modelId: model.id,
                success,
                inputTokens: costInfo.inputTokens,
                outputTokens: costInfo.outputTokens,
                thinkingTokens: costInfo.thinkingTokens,
                cacheReadTokens: costInfo.cacheReadTokens,
                cacheCreationTokens: costInfo.cacheCreationTokens,
                totalCost: costInfo.totalCost,
                currency: costInfo.currency,
                latencyMs,
            },
        };
    }

    async completeQuotaReservationIfNeeded({
        requestId,
        quotaReservation = null,
        success = false,
    }) {
        if (!quotaReservation?.requestId || !this.subscriptionService) {
            return null;
        }

        try {
            return await this.subscriptionService.completeUsageReservation({
                quotaReservation,
                success,
            });
        } catch (error) {
            console.warn(
                `[${requestId}] Failed to complete subscription quota reservation `
                + `reservationRequestId=${quotaReservation.requestId}: ${error.stack || error.message}`
            );
            return null;
        }
    }

    async settleIfNeeded({
        requestId,
        username,
        success,
        costInfo,
        provider,
        model,
        latencyMs,
        clientModelName = '',
        subscriptionPlanId = null,
        accountingMode = 'balance',
        subscriptionQuotaCharged = true,
        quotaReservation = null,
    }) {
        if (!this.requestAccountingService) {
            await this.completeQuotaReservationIfNeeded({
                requestId,
                quotaReservation,
                success,
            });
            return null;
        }

        const payload = this.buildAccountingPayload({
            requestId,
            username,
            success,
            costInfo,
            provider,
            model,
            latencyMs,
            clientModelName,
            subscriptionPlanId,
            accountingMode,
            subscriptionQuotaCharged,
        });

        let result = null;
        if (accountingMode === 'subscription') {
            result = await this.requestAccountingService.recordUsageOnly(payload);
        } else {
            result = await this.requestAccountingService.settle(payload);
        }

        await this.completeQuotaReservationIfNeeded({
            requestId,
            quotaReservation,
            success,
        });

        return result;
    }

    getUserLockKey(username) {
        return `llm-delegate:user-lock:${username}`;
    }

    async acquireDistributedLock(lockKey, ttlMs = 30000) {
        const token = crypto.randomBytes(16).toString('hex');
        if (this.redisClient) {
            try {
                await connectRedisClient(this.redisClient);
                const acquired = await this.redisClient.set(lockKey, token, {
                    NX: true,
                    PX: ttlMs,
                });
                if (acquired) {
                    return { token, acquired: true };
                }

                return { token: null, acquired: false };
            } catch (error) {
                console.warn(
                    `[proxy] Redis lock acquire failed for "${lockKey}", falling back to in-memory: `
                    + `${error.stack || error.message}`
                );
            }
        }

        // Fallback: in-memory lock
        let release = null;
        const wait = new Promise((r) => { release = r; });
        const existing = this.userRequestLocks.get(lockKey);
        this.userRequestLocks.set(lockKey, { release, wait });
        if (existing) {
            await existing.wait.catch(() => {});
        }

        let released = false;
        const releaseLock = () => {
            if (released) return;
            released = true;
            release();
            if (this.userRequestLocks.get(lockKey)?.wait === wait) {
                this.userRequestLocks.delete(lockKey);
            }
        };

        return { token: null, acquired: true, releaseLock, isInMemory: true };
    }

    async releaseDistributedLock(lockKey, token, isInMemory = false, releaseLock = null) {
        if (isInMemory) {
            if (releaseLock) releaseLock();
            return;
        }

        if (!this.redisClient || !token) return;

        try {
            await connectRedisClient(this.redisClient);
            // Lua script: delete only if token matches (prevents releasing someone else's lock)
            await this.redisClient.eval(
                'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
                { keys: [lockKey], arguments: [token] }
            );
        } catch (error) {
            console.warn(
                `[proxy] Redis lock release failed for "${lockKey}": ${error.stack || error.message}`
            );
        }
    }

    async runSerializedUserRequest(username, requestId, task, { force = false } = {}) {
        if (!force && !this.shouldSerializeUserRequest(username)) {
            return task();
        }

        const lockKey = this.getUserLockKey(username);
        const lockTtlMs = 60000;

        let attempts = 0;
        const maxAttempts = 200; // ~20s max wait before giving up

        while (attempts < maxAttempts) {
            const { token, acquired, releaseLock, isInMemory } = await this.acquireDistributedLock(lockKey, lockTtlMs);

            if (acquired) {
                let released = false;
                const release = () => {
                    if (released) return;
                    released = true;
                    this.releaseDistributedLock(lockKey, token, isInMemory, releaseLock);
                };

                try {
                    const result = await task();
                    if (result?.type === 'stream' && result.completion) {
                        result.completion = Promise.resolve(result.completion).finally(() => release());
                        return result;
                    }
                    release();
                    return result;
                } catch (error) {
                    release();
                    throw error;
                }
            }

            attempts++;
            // Wait ~100ms before retrying (via in-memory wait on any instance)
            await new Promise((r) => setTimeout(r, 100));
        }

        console.warn(
            `[${requestId}] Could not acquire distributed lock for user=${username} after ${maxAttempts} attempts`
        );
        return task();
    }

    buildProxyHeaders({ provider, model, clientApiId, upstreamApiId, costInfo }) {
        const headers = {
            'X-Proxy-Provider-Id': provider.id,
            'X-Proxy-Provider-Name': provider.name,
            'X-Proxy-Model-Id': model.id,
            'X-Proxy-Model-Name': model.name,
            'X-Proxy-Source-Model-Id': model.sourceModelId || model.id,
            'X-Proxy-External-Model-Name': model.externalModelName || model.name,
            'X-Proxy-Proxy-Model': model.externalModelName || model.name,
            'X-Proxy-Client-Api': clientApiId,
            'X-Proxy-Client-Api-Label': getApiLabel(clientApiId),
            'X-Proxy-Upstream-Api': upstreamApiId,
            'X-Proxy-Upstream-Api-Label': getApiLabel(upstreamApiId),
        };

        if (costInfo) {
            headers['X-Proxy-Cost-Currency'] = String(costInfo.currency || 'USD');
            headers['X-Proxy-Estimated-Cost'] = String(costInfo.totalCost ?? 0);
        }

        return headers;
    }

    async buildAnthropicModel(externalModelEntry) {
        await this.ensureBootstrapReady();
        const externalModel = externalModelEntry?.externalModel || null;
        const sourceModel = externalModelEntry?.sourceModel || null;
        const targets = Array.isArray(externalModelEntry?.targets) ? externalModelEntry.targets : [];
        if (!externalModel || !sourceModel) {
            return null;
        }

        const { maxInputTokens, maxTokens, inferred } = inferModelLimits({
            ...sourceModel,
            externalModelName: externalModel.name,
            sourceModelId: sourceModel.id,
            sourceModelName: sourceModel.name,
        }, sourceModel);
        return {
            type: 'model',
            id: externalModel.name,
            created_at: this.modelCatalogCreatedAt,
            max_input_tokens: maxInputTokens,
            max_tokens: maxTokens,
            proxy_model_id: sourceModel.id,
            proxy_target_model_ids: targets.map((target) => target.modelId),
            proxy_provider_id: sourceModel.providerId,
            proxy_upstream_model: sourceModel.upstreamModel,
            proxy_upstream_api: sourceModel.upstreamApi,
            proxy_strategy: externalModel.strategy,
            proxy_limits_inferred: inferred,
        };
    }

    async resolveRequestContext(body = {}, excludedModelIds = []) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw createHttpError(400, 'Request body must be a JSON object.');
        }

        await this.ensureBootstrapReady();
        const { provider, model, sourceModel, externalModel } = await this.modelResolutionService.resolveModelContext({
            modelName: body.model,
            excludedModelIds,
        });
        return { provider, model, sourceModel, externalModel };
    }

    async listModels({ limit, afterId, beforeId } = {}) {
        await this.ensureBootstrapReady();
        const modelEntries = await this.modelResolutionService.getModelCatalogEntries();
        const builtModels = await Promise.all(modelEntries
            .filter((entry) => entry.sourceModel)
            .map((entry) => this.buildAnthropicModel(entry)));
        const allModels = builtModels
            .filter(Boolean)
            .sort((left, right) => String(left.id).localeCompare(String(right.id)));

        let filteredModels = allModels;
        if (afterId) {
            const afterIndex = filteredModels.findIndex((item) => item.id === afterId);
            if (afterIndex >= 0) {
                filteredModels = filteredModels.slice(afterIndex + 1);
            }
        }
        if (beforeId) {
            const beforeIndex = filteredModels.findIndex((item) => item.id === beforeId);
            if (beforeIndex >= 0) {
                filteredModels = filteredModels.slice(0, beforeIndex);
            }
        }

        const pageSize = toPositiveInteger(limit, filteredModels.length || allModels.length || 20);
        const data = filteredModels.slice(0, pageSize);

        return {
            data,
            first_id: data[0]?.id || null,
            has_more: filteredModels.length > data.length,
            last_id: data[data.length - 1]?.id || null,
        };
    }

    async getModel(modelId) {
        await this.ensureBootstrapReady();
        const modelEntries = await this.modelResolutionService.getModelCatalogEntries();
        const modelEntry = modelEntries.find((entry) => entry.externalModel?.name === modelId) || null;
        const model = await this.buildAnthropicModel(modelEntry);
        if (!model) {
            throw createHttpError(404, `Model "${modelId}" not found.`);
        }

        return model;
    }

    async countMessageTokens(body = {}) {
        ensureJsonObjectBody(body, { requiredArrayField: 'messages' });
        await this.resolveRequestContext(body);

        const sanitizedBody = stripInternalRoutingFields(body);
        return {
            input_tokens: estimateAnthropicMessageInputTokens(sanitizedBody),
        };
    }

    resolveUpstreamApiId(clientApiId, model) {
        if (clientApiId === PROXY_API_IDS.RESPONSES_COMPACT) {
            return model?.upstreamApi === PROXY_API_IDS.RESPONSES
                ? PROXY_API_IDS.RESPONSES_COMPACT
                : (model?.upstreamApi || PROXY_API_IDS.CHAT_COMPLETIONS);
        }

        return model?.upstreamApi || clientApiId || PROXY_API_IDS.CHAT_COMPLETIONS;
    }

    recordFailedStats({ username, provider, model, latencyMs }) {
        if (this.requestAccountingService) {
            return {
                totalCost: 0,
                inputTokens: 0,
                outputTokens: 0,
                thinkingTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
                currency: 'USD',
                latencyMs,
                username,
                providerId: provider?.id,
                modelId: model?.id,
            };
        }

        this.statsService.recordRequestStats({
            username,
            provider,
            model,
            success: false,
            usage: null,
            latencyMs,
        });
    }

    async resolveDirectModelContext(modelId, options = {}) {
        await this.ensureBootstrapReady();
        return this.modelResolutionService.getDirectModelContext(modelId, options);
    }

    async processResponseText({
        clientApiId,
        clientModelName,
        upstreamApiId,
        upstreamApi,
        proxyResponse,
        responseText,
        requestBody,
        username,
        provider,
        model,
        sourceModel,
        latencyMs,
        requestId,
        subscriptionPlanId = null,
        accountingMode = 'balance',
        subscriptionQuotaCharged = true,
        quotaReservation = null,
    }) {
        const responseContentType = proxyResponse.headers.get('content-type') || 'application/json; charset=utf-8';
        const trimmedResponseText = String(responseText || '').trim();
        const looksLikeHtml = responseContentType.includes('text/html')
            || /^<!doctype html/i.test(trimmedResponseText)
            || /^<html[\s>]/i.test(trimmedResponseText);

        if (proxyResponse.ok && looksLikeHtml) {
            const costInfo = this.recordFailedStats({
                username,
                provider,
                model,
                latencyMs,
            });
            await this.settleIfNeeded({
                requestId,
                username,
                success: false,
                costInfo,
                provider,
                model,
                latencyMs,
                clientModelName,
                subscriptionPlanId,
                accountingMode,
                subscriptionQuotaCharged,
                quotaReservation,
            });

            console.warn(
                `[${requestId}] Upstream returned unexpected HTML `
                + `provider=${provider.id} modelId=${model.id} clientApi=${clientApiId} upstreamApi=${upstreamApiId} `
                + `contentType="${responseContentType}" body=${summarizeText(trimmedResponseText)}`
            );

            return {
                status: 502,
                type: 'json',
                payload: {
                    error: 'Upstream returned HTML instead of the expected API response.',
                    requestId,
                },
                proxyHeaders: this.buildProxyHeaders({
                    provider,
                    model,
                    clientApiId,
                    upstreamApiId,
                    costInfo: null,
                }),
            };
        }

        const { parsedResponse, usage, usageSource } = upstreamApi.extractResponseMetadata(responseText);
        const needsResponseConversion = getBaseApiId(clientApiId) !== getBaseApiId(upstreamApiId);
        const requestedStream = Boolean(requestBody?.stream);
        const emptySuccessfulResponse = proxyResponse.ok && isEmptySuccessfulResponse({
            parsedResponse,
            responseText,
        });

        if (emptySuccessfulResponse) {
            const costInfo = this.recordFailedStats({
                username,
                provider,
                model,
                latencyMs,
            });
            await this.settleIfNeeded({
                requestId,
                username,
                success: false,
                costInfo,
                provider,
                model,
                latencyMs,
                clientModelName,
                subscriptionPlanId,
                accountingMode,
                subscriptionQuotaCharged,
                quotaReservation,
            });

            console.warn(
                `[${requestId}] Upstream returned an empty successful response `
                + `provider=${provider.id} modelId=${model.id} clientApi=${clientApiId} upstreamApi=${upstreamApiId} `
                + `contentType="${responseContentType}"`
            );

            return {
                status: 502,
                type: 'json',
                payload: {
                    error: 'Upstream returned an empty response instead of a model completion.',
                    requestId,
                },
                proxyHeaders: this.buildProxyHeaders({
                    provider,
                    model,
                    clientApiId,
                    upstreamApiId,
                    costInfo: null,
                }),
            };
        }

        if (proxyResponse.ok) {
            const { costInfo } = this.buildUsageSnapshot(usage, model.pricing);

            if (!this.requestAccountingService) {
                this.statsService.recordRequestStats({
                    username,
                    provider,
                    model,
                    success: true,
                    usage,
                    latencyMs,
                });
                await this.completeQuotaReservationIfNeeded({
                    requestId,
                    quotaReservation,
                    success: true,
                });
            } else {
                await this.settleIfNeeded({
                    requestId,
                    username,
                    success: true,
                    costInfo,
                    provider,
                    model,
                    latencyMs,
                    clientModelName,
                    subscriptionPlanId,
                    accountingMode,
                    subscriptionQuotaCharged,
                    quotaReservation,
                });
            }

            if (!usage) {
                console.warn(
                    `[${requestId}] No usage returned for ${provider.id}/${model.id}; `
                    + 'recorded zero-token stats for this successful request.'
                );
            } else if (usageSource === 'sse') {
                console.info(`[${requestId}] Captured streamed usage for ${provider.id}/${model.id}.`);
            }

            if (parsedResponse && typeof parsedResponse === 'object') {
                const clientPayload = needsResponseConversion
                    ? convertResponseBody({
                        fromApiId: upstreamApiId,
                        toApiId: clientApiId,
                        body: parsedResponse,
                        requestBody,
                    })
                    : parsedResponse;
                const clientPayloadWithModel = applyClientVisibleModelName(
                    clientPayload,
                    clientApiId,
                    clientModelName
                );

                if (requestedStream && needsResponseConversion) {
                    return {
                        status: proxyResponse.status,
                        type: 'raw',
                        contentType: 'text/event-stream; charset=utf-8',
                        payload: buildSyntheticStream({
                            apiId: clientApiId,
                            body: clientPayloadWithModel,
                        }),
                        proxyHeaders: this.buildProxyHeaders({
                            provider,
                            model,
                            clientApiId,
                            upstreamApiId,
                            costInfo,
                        }),
                    };
                }

                return {
                    status: proxyResponse.status,
                    type: 'json',
                    payload: clientPayloadWithModel,
                    proxyHeaders: this.buildProxyHeaders({
                        provider,
                        model,
                        clientApiId,
                        upstreamApiId,
                        costInfo,
                    }),
                };
            }

            return {
                status: proxyResponse.status,
                type: 'raw',
                contentType: responseContentType,
                payload: responseText,
                proxyHeaders: this.buildProxyHeaders({
                    provider,
                    model,
                    clientApiId,
                    upstreamApiId,
                    costInfo,
                }),
            };
        }

        const costInfo = this.recordFailedStats({
            username,
            provider,
            model,
            latencyMs,
        });
        await this.settleIfNeeded({
            requestId,
            username,
            success: false,
            costInfo,
            provider,
            model,
            latencyMs,
            clientModelName,
            subscriptionPlanId,
            accountingMode,
            subscriptionQuotaCharged,
            quotaReservation,
        });

        console.warn(
            `[${requestId}] Upstream request failed `
            + `status=${proxyResponse.status} provider=${provider.id} modelId=${model.id} `
            + `clientApi=${clientApiId} upstreamApi=${upstreamApiId} `
            + `contentType="${responseContentType || 'unknown'}" `
            + `body=${summarizeText(responseText)}`
        );

        return {
            status: proxyResponse.status,
            type: 'raw',
            contentType: responseContentType,
            payload: responseText,
            proxyHeaders: this.buildProxyHeaders({
                provider,
                model,
                clientApiId,
                upstreamApiId,
                costInfo: null,
            }),
        };
    }

    async forwardRequest({
        apiId,
        body,
        username,
        requestId = 'n/a',
        clientIp = 'unknown',
        clientHeaders = {},
    }) {
        const clientApi = getProxyApi(apiId);
        if (!clientApi) {
            throw createHttpError(500, `Unsupported proxy API: ${apiId}`);
        }

        const executeRequest = async () => {
            const requestStartedAt = Date.now();
            const normalizedClientHeaders = normalizeClientHeaders(clientHeaders);
            const attemptedSourceModelIds = [];
            let upstreamRateLimitChecked = false;
            let lastError = null;

            while (true) {
                let requestContext;
                try {
                    requestContext = await this.resolveRequestContext(body, attemptedSourceModelIds);
                } catch (error) {
                    if (lastError && attemptedSourceModelIds.length && isNoAvailableModelsError(error)) {
                        const externalModelName = String(body?.model || '').trim();
                        console.error(
                            `[${requestId}] Upstream request failed after exhausting fallback source models `
                            + `externalModel=${externalModelName || 'unknown'} `
                            + `attemptedSourceModels=${attemptedSourceModelIds.join(',') || 'none'} `
                            + `lastError=${lastError.stack || lastError.message}`
                        );
                        throw buildExhaustedUpstreamError(externalModelName, lastError);
                    }

                    throw error;
                }

                const { provider, model, sourceModel, externalModel } = requestContext;
                const upstreamApiId = this.resolveUpstreamApiId(apiId, model);
                const upstreamApi = getProxyApi(upstreamApiId);
                const executeResolvedRequest = async () => {
                    if (!upstreamApi) {
                        throw createHttpError(500, `Unsupported upstream proxy API: ${upstreamApiId}`);
                    }

                    const preparedBody = convertRequestBody({
                        fromApiId: apiId,
                        toApiId: upstreamApiId,
                        body,
                    });

                    if (
                        apiId === PROXY_API_IDS.MESSAGES
                        && getBaseApiId(upstreamApiId) === PROXY_API_IDS.RESPONSES
                        && (body.temperature !== undefined || body.top_p !== undefined)
                        && preparedBody.temperature === undefined
                        && preparedBody.top_p === undefined
                    ) {
                        console.info(
                            `[${requestId}] Dropped Anthropic sampling parameters before forwarding to Responses `
                            + `to avoid GPT-5 reasoning incompatibility `
                            + `provider=${provider.id} modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId}`
                        );
                    }

                    const preparedRequest = upstreamApi.prepareRequest({
                        body: preparedBody,
                        provider,
                        model,
                        requestId,
                        clientHeaders: normalizedClientHeaders,
                    });

                    if (!upstreamRateLimitChecked) {
                        upstreamRateLimitChecked = true;
                        await this.waitForUserRateLimitSlot({ username, requestId });
                    }

                    const quotaReservationRequestId = crypto.randomUUID();
                    const usageAccess = await this.reserveIfNeeded({
                        username,
                        requestId,
                        body,
                        provider,
                        model,
                        sourceModel,
                        externalModel,
                        quotaReservationRequestId,
                    });
                    const resolvedAccessContext = usageAccess?.accessContext || {
                        mode: usageAccess?.accountingMode || 'balance',
                        subscription: null,
                        appliedLimit: null,
                    };
                    const quotaReservation = usageAccess?.quotaReservation
                        || resolvedAccessContext?.quotaReservation
                        || null;
                    const subscriptionQuotaCharged = this.isSubscriptionQuotaCharged(resolvedAccessContext);

                    console.info(
                        `[${requestId}] Forwarding proxy request `
                        + `user=${username || 'anonymous'} ip=${clientIp} sourceModel=${sourceModel?.id || model.sourceModelId || model.id} `
                        + `externalModel=${externalModel?.name || model.externalModelName || model.name} `
                        + `provider=${provider.id} modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId} `
                        + `upstreamModel="${model.upstreamModel}" target=${preparedRequest.targetUrl.origin}${preparedRequest.targetUrl.pathname} `
                        + `details=${JSON.stringify(preparedRequest.requestSummary || {})}`
                    );

                    try {
                        const proxyResponse = await fetch(preparedRequest.targetUrl, preparedRequest.requestInit);
                        const latencyMs = Date.now() - requestStartedAt;
                        const contentType = proxyResponse.headers.get('content-type') || 'application/json; charset=utf-8';
                        const contentLength = String(proxyResponse.headers.get('content-length') || '').trim();
                        const shouldPassthroughStream = contentType.includes('text/event-stream')
                            && contentLength !== '0'
                            && proxyResponse.body
                            && typeof proxyResponse.body.tee === 'function'
                            && getBaseApiId(apiId) === getBaseApiId(upstreamApiId);

                        console.info(
                            `[${requestId}] Upstream response `
                            + `status=${proxyResponse.status} ok=${proxyResponse.ok} provider=${provider.id} `
                            + `modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId} latencyMs=${latencyMs}`
                        );

                        if (shouldPassthroughStream) {
                            const [clientStream, analysisStream] = proxyResponse.body.tee();
                            const shouldNormalizeResponsesStream = getBaseApiId(apiId) === PROXY_API_IDS.RESPONSES
                                && getBaseApiId(upstreamApiId) === PROXY_API_IDS.RESPONSES;
                            const responseStream = shouldNormalizeResponsesStream
                                ? normalizeResponsesStreamCompletion(clientStream, {
                                    onInjected: () => {
                                        console.info(
                                            `[${requestId}] Injected missing Responses stream completion event `
                                            + `provider=${provider.id} modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId}`
                                        );
                                    },
                                })
                                : clientStream;
                            const completion = new Response(analysisStream)
                                .text()
                                .then((responseText) => this.processResponseText({
                                        clientApiId: apiId,
                                        clientModelName: String(body?.model || model.externalModelName || model.name || '').trim(),
                                        upstreamApiId,
                                        upstreamApi,
                                        proxyResponse,
                                        responseText,
                                        requestBody: body,
                                        username,
                                        provider,
                                        model,
                                        sourceModel,
                                        latencyMs,
                                        requestId,
                                        subscriptionPlanId: resolvedAccessContext?.subscription?.planId || null,
                                        accountingMode: resolvedAccessContext?.mode || 'balance',
                                        subscriptionQuotaCharged,
                                        quotaReservation,
                                    }))
                                .catch((error) => {
                                    const failedCostInfo = this.recordFailedStats({
                                        username,
                                        provider,
                                        model,
                                        latencyMs,
                                    });
                                    return this.settleIfNeeded({
                                        requestId,
                                        username,
                                        success: false,
                                        costInfo: failedCostInfo,
                                        provider,
                                        model,
                                        latencyMs,
                                        clientModelName: String(body?.model || model.externalModelName || model.name || '').trim(),
                                        subscriptionPlanId: resolvedAccessContext?.subscription?.planId || null,
                                        accountingMode: resolvedAccessContext?.mode || 'balance',
                                        subscriptionQuotaCharged,
                                        quotaReservation,
                                    }).finally(() => {
                                        console.error(
                                            `[${requestId}] Problem while processing streamed response `
                                            + `provider=${provider.id} modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId}: `
                                            + `${error.stack || error.message}`
                                        );
                                    });
                                });

                            return {
                                status: proxyResponse.status,
                                type: 'stream',
                                contentType,
                                stream: responseStream,
                                completion,
                                proxyHeaders: this.buildProxyHeaders({
                                    provider,
                                    model,
                                    clientApiId: apiId,
                                    upstreamApiId,
                                    costInfo: null,
                                }),
                            };
                        }

                        const responseText = await proxyResponse.text();
                        return this.processResponseText({
                            clientApiId: apiId,
                            clientModelName: String(body?.model || model.externalModelName || model.name || '').trim(),
                            upstreamApiId,
                            upstreamApi,
                            proxyResponse,
                            responseText,
                            requestBody: body,
                            username,
                            provider,
                            model,
                            sourceModel,
                            latencyMs,
                            requestId,
                            subscriptionPlanId: resolvedAccessContext?.subscription?.planId || null,
                            accountingMode: resolvedAccessContext?.mode || 'balance',
                            subscriptionQuotaCharged,
                            quotaReservation,
                        });
                    } catch (error) {
                        const latencyMs = Date.now() - requestStartedAt;
                        const canRetryExternalModel = externalModel
                            && sourceModel?.id
                            && !attemptedSourceModelIds.includes(sourceModel.id);

                        if (canRetryExternalModel) {
                            await this.completeQuotaReservationIfNeeded({
                                requestId,
                                quotaReservation,
                                success: false,
                            });
                            attemptedSourceModelIds.push(sourceModel.id);
                            lastError = error;
                            console.warn(
                                `[${requestId}] Upstream request failed, retrying another source model `
                                + `externalModel=${externalModel.name} failedSourceModel=${sourceModel.id} provider=${provider.id} `
                                + `modelId=${model.id} error=${error.message}`
                            );
                            return null;
                        }

                        const failedCostInfo = this.recordFailedStats({
                            username,
                            provider,
                            model,
                            latencyMs,
                        });
                        await this.settleIfNeeded({
                            requestId,
                            username,
                            success: false,
                            costInfo: failedCostInfo,
                            provider,
                            model,
                            latencyMs,
                            clientModelName: String(body?.model || model.externalModelName || model.name || '').trim(),
                            subscriptionPlanId: resolvedAccessContext?.subscription?.planId || null,
                            accountingMode: resolvedAccessContext?.mode || 'balance',
                            subscriptionQuotaCharged,
                            quotaReservation,
                        });

                        console.error(
                            `[${requestId}] Problem with request `
                            + `provider=${provider.id} modelId=${model.id} clientApi=${apiId} upstreamApi=${upstreamApiId}: `
                            + `${(lastError || error).stack || (lastError || error).message}`
                        );
                        throw createHttpError(500, `Problem with request: ${(lastError || error).message}`);
                    }
                };

                const result = await executeResolvedRequest();

                if (result === null) {
                    continue;
                }

                return result;
            }
        };

        if (this.requestAccountingService) {
            return executeRequest();
        }

        return this.runSerializedUserRequest(username, requestId, executeRequest);
    }

    async testModelConnectivity({
        modelId,
        requestId = 'n/a',
        clientHeaders = {},
    }) {
        const normalizedClientHeaders = normalizeClientHeaders(clientHeaders);
        const { provider, model } = await this.resolveDirectModelContext(modelId, { allowDisabled: true });
        const upstreamApiId = model.upstreamApi || PROXY_API_IDS.CHAT_COMPLETIONS;
        const upstreamApi = getProxyApi(upstreamApiId);

        if (!upstreamApi) {
            throw createHttpError(500, `Unsupported upstream proxy API: ${upstreamApiId}`);
        }

        const testBody = buildConnectivityTestBody(upstreamApiId, model.upstreamModel);
        const effectiveClientHeaders = {
            ...normalizedClientHeaders,
            'user-agent': upstreamApiId === PROXY_API_IDS.MESSAGES
                ? 'Claude-Code/1.0'
                : (normalizedClientHeaders['user-agent'] || 'LLM-Proxy-Admin-Test/1.0'),
        };

        const preparedRequest = upstreamApi.prepareRequest({
            body: testBody,
            provider,
            model,
            requestId,
            clientHeaders: effectiveClientHeaders,
        });

        console.info(
            `[${requestId}] Testing model connectivity `
            + `provider=${provider.id} modelId=${model.id} upstreamApi=${upstreamApiId} `
            + `upstreamModel="${model.upstreamModel}" target=${preparedRequest.targetUrl.origin}${preparedRequest.targetUrl.pathname} `
            + `details=${JSON.stringify(preparedRequest.requestSummary || {})}`
        );

        const requestStartedAt = Date.now();

        try {
            const proxyResponse = await fetch(preparedRequest.targetUrl, preparedRequest.requestInit);
            const latencyMs = Date.now() - requestStartedAt;
            const responseText = await proxyResponse.text();
            const contentType = proxyResponse.headers.get('content-type') || 'application/json; charset=utf-8';
            const trimmedResponseText = String(responseText || '').trim();
            const looksLikeHtml = contentType.includes('text/html')
                || /^<!doctype html/i.test(trimmedResponseText)
                || /^<html[\s>]/i.test(trimmedResponseText);
            const { parsedResponse, usage } = looksLikeHtml
                ? { parsedResponse: null, usage: null }
                : upstreamApi.extractResponseMetadata(responseText);
            const emptySuccessfulResponse = proxyResponse.ok && !looksLikeHtml && isEmptySuccessfulResponse({
                parsedResponse,
                responseText,
            });
            const preview = buildConnectivityPreview({
                upstreamApiId,
                parsedResponse,
                responseText,
            });

            console.info(
                `[${requestId}] Connectivity test response `
                + `status=${proxyResponse.status} ok=${proxyResponse.ok} provider=${provider.id} `
                + `modelId=${model.id} upstreamApi=${upstreamApiId} latencyMs=${latencyMs}`
            );

            await this.catalogAdminService.updateModelConnectivityStatus(model.id, {
                status: proxyResponse.ok && !looksLikeHtml && !emptySuccessfulResponse ? 'ok' : 'failed',
                testedAt: new Date().toISOString(),
                message: looksLikeHtml
                    ? 'Upstream returned HTML instead of an API response.'
                    : (emptySuccessfulResponse
                        ? 'Upstream returned an empty response instead of a model completion.'
                        : preview),
                statusCode: proxyResponse.status,
                latencyMs,
            });

            return {
                ok: proxyResponse.ok && !looksLikeHtml && !emptySuccessfulResponse,
                modelId: model.id,
                providerId: provider.id,
                upstreamApi: upstreamApiId,
                upstreamModel: model.upstreamModel,
                status: proxyResponse.status,
                latencyMs,
                contentType,
                usage,
                preview,
                requestSummary: preparedRequest.requestSummary || {},
                message: looksLikeHtml
                    ? 'Upstream returned HTML instead of an API response.'
                    : (emptySuccessfulResponse
                        ? 'Upstream returned an empty response instead of a model completion.'
                        : (proxyResponse.ok ? 'Connectivity test succeeded.' : preview)),
            };
        } catch (error) {
            const latencyMs = Date.now() - requestStartedAt;
            const errorMessage = String(error?.message || 'Connectivity test failed.').trim()
                || 'Connectivity test failed.';
            await this.catalogAdminService.updateModelConnectivityStatus(model.id, {
                status: 'failed',
                testedAt: new Date().toISOString(),
                message: errorMessage,
                statusCode: 0,
                latencyMs,
            });

            console.error(
                `[${requestId}] Connectivity test failed `
                + `provider=${provider.id} modelId=${model.id} upstreamApi=${upstreamApiId}: `
                + `${error.stack || errorMessage}`
            );
            return {
                ok: false,
                modelId: model.id,
                providerId: provider.id,
                upstreamApi: upstreamApiId,
                upstreamModel: model.upstreamModel,
                status: 0,
                latencyMs,
                contentType: '',
                usage: null,
                preview: errorMessage,
                requestSummary: preparedRequest.requestSummary || {},
                message: `Connectivity test failed: ${errorMessage}`,
            };
        }
    }
}

module.exports = {
    ProxyService,
};
