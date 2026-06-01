const crypto = require('crypto');
const {
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
    DEFAULT_SESSION_TTL_HOURS,
} = require('../config/constants');
const { getApiLabel, normalizeUpstreamApi } = require('../services/proxy-apis/constants');
const {
    maskApiKey,
    normalizeCurrency,
    normalizeModelId,
    normalizeProviderId,
    normalizeStoredId,
    toNonNegativeNumber,
} = require('../utils/normalizers');

function createEmptyUserWallet() {
    return {
        balanceUsd: 0,
        totalRechargedUsd: 0,
        totalSpentUsd: 0,
        lastRechargedAt: null,
        rechargeOrders: [],
    };
}

function createDefaultPaymentsConfig() {
    return {
        alipay: {
            enabled: true,
            mode: 'manual_qr',
            qrImagePath: '/assets/images/alipay-receive-qr.jpg',
            appId: '',
            privateKey: '',
            privateKeyPath: '',
            alipayPublicKey: '',
            alipayPublicKeyPath: '',
            gateway: 'https://openapi.alipay.com/gateway.do',
            publicBaseUrl: '',
            keyType: 'PKCS8',
            minRechargeUsd: 1,
            minRechargeCny: 10,
            cnyPerUsd: 7,
        },
    };
}

function buildInitialUsers() {
    return [
        {
            username: 'user',
            password: '123456',
            apiKeys: [],
            wallet: createEmptyUserWallet(),
        },
    ];
}

function buildInitialAdmins() {
    return [
        {
            username: DEFAULT_ADMIN_USERNAME,
            password: DEFAULT_ADMIN_PASSWORD,
        },
    ];
}

function normalizeAccount(account) {
    return {
        username: String(account?.username || '').trim(),
        password: String(account?.password || ''),
    };
}

function normalizeUserApiKey(apiKey) {
    return {
        id: String(apiKey?.id || crypto.randomUUID()),
        name: String(apiKey?.name || 'API Key').trim() || 'API Key',
        key: String(apiKey?.key || '').trim(),
        createdAt: String(apiKey?.createdAt || '').trim(),
        lastUsedAt: String(apiKey?.lastUsedAt || '').trim(),
    };
}

function normalizeRechargeOrder(order) {
    const amountUsd = Number(toNonNegativeNumber(order?.amountUsd));
    const amountCny = Number(toNonNegativeNumber(order?.amountCny));
    const cnyPerUsd = Number(toNonNegativeNumber(order?.cnyPerUsd));
    const status = String(order?.status || 'pending').trim().toLowerCase();
    const paymentMethod = String(order?.paymentMethod || 'alipay').trim().toLowerCase();

    return {
        id: String(order?.id || crypto.randomUUID()),
        outTradeNo: String(order?.outTradeNo || '').trim(),
        paymentMethod: paymentMethod || 'alipay',
        status: ['pending', 'paid', 'closed', 'failed'].includes(status) ? status : 'pending',
        amountUsd: Number(amountUsd.toFixed(6)),
        amountCny: Number(amountCny.toFixed(2)),
        cnyPerUsd: Number(cnyPerUsd.toFixed(6)),
        subject: String(order?.subject || '').trim(),
        createdAt: String(order?.createdAt || '').trim(),
        updatedAt: String(order?.updatedAt || order?.createdAt || '').trim(),
        paidAt: order?.paidAt ? String(order.paidAt).trim() : null,
        tradeNo: String(order?.tradeNo || '').trim(),
        buyerLogonId: String(order?.buyerLogonId || '').trim(),
        tradeStatus: String(order?.tradeStatus || '').trim(),
        customerNote: String(order?.customerNote || '').trim(),
        reviewedBy: String(order?.reviewedBy || '').trim(),
        reviewedAt: order?.reviewedAt ? String(order.reviewedAt).trim() : null,
        reviewNote: String(order?.reviewNote || '').trim(),
        failureReason: String(order?.failureReason || '').trim(),
    };
}

function normalizeUserWallet(wallet) {
    const normalizedWallet = {
        ...createEmptyUserWallet(),
        ...(wallet && typeof wallet === 'object' ? wallet : {}),
    };

    return {
        balanceUsd: Number(toNonNegativeNumber(normalizedWallet.balanceUsd).toFixed(6)),
        totalRechargedUsd: Number(toNonNegativeNumber(normalizedWallet.totalRechargedUsd).toFixed(6)),
        totalSpentUsd: Number(toNonNegativeNumber(normalizedWallet.totalSpentUsd).toFixed(6)),
        lastRechargedAt: normalizedWallet.lastRechargedAt ? String(normalizedWallet.lastRechargedAt).trim() : null,
        rechargeOrders: Array.isArray(normalizedWallet.rechargeOrders)
            ? normalizedWallet.rechargeOrders
                .map(normalizeRechargeOrder)
                .filter((order) => order.outTradeNo)
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
            : [],
    };
}

function normalizeAlipayPaymentConfig(alipayConfig) {
    const keyType = String(alipayConfig?.keyType || 'PKCS8').trim().toUpperCase();

    return {
        enabled: Boolean(alipayConfig?.enabled),
        mode: String(alipayConfig?.mode || 'manual_qr').trim() || 'manual_qr',
        qrImagePath: String(alipayConfig?.qrImagePath || '/assets/images/alipay-receive-qr.jpg').trim()
            || '/assets/images/alipay-receive-qr.jpg',
        appId: String(alipayConfig?.appId || '').trim(),
        privateKey: String(alipayConfig?.privateKey || ''),
        privateKeyPath: String(alipayConfig?.privateKeyPath || '').trim(),
        alipayPublicKey: String(alipayConfig?.alipayPublicKey || ''),
        alipayPublicKeyPath: String(alipayConfig?.alipayPublicKeyPath || '').trim(),
        gateway: String(alipayConfig?.gateway || 'https://openapi.alipay.com/gateway.do').trim()
            || 'https://openapi.alipay.com/gateway.do',
        publicBaseUrl: String(alipayConfig?.publicBaseUrl || '').trim().replace(/\/+$/, ''),
        keyType: keyType === 'PKCS1' ? 'PKCS1' : 'PKCS8',
        minRechargeUsd: Number(toNonNegativeNumber(alipayConfig?.minRechargeUsd, 1).toFixed(6)) || 1,
        minRechargeCny: Number(toNonNegativeNumber(alipayConfig?.minRechargeCny, 10).toFixed(6)) || 10,
        cnyPerUsd: Number(toNonNegativeNumber(alipayConfig?.cnyPerUsd, 7).toFixed(6)) || 7,
    };
}

function normalizePaymentsConfig(paymentsConfig) {
    return {
        ...createDefaultPaymentsConfig(),
        ...(paymentsConfig && typeof paymentsConfig === 'object' ? paymentsConfig : {}),
        alipay: normalizeAlipayPaymentConfig(paymentsConfig?.alipay),
    };
}

function sanitizeUserApiKey(apiKey) {
    return {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
    };
}

function getPricingNumber(pricing, canonicalKey, legacyKey) {
    return toNonNegativeNumber(
        pricing?.[canonicalKey],
        toNonNegativeNumber(pricing?.[legacyKey])
    );
}

function getDefaultPricing(pricing = {}) {
    const inputPerMillionTokens = getPricingNumber(pricing, 'inputPerMillionTokens', 'inputPer1kTokens');
    const outputPerMillionTokens = getPricingNumber(pricing, 'outputPerMillionTokens', 'outputPer1kTokens');
    const cachedInputPerMillionTokens = getPricingNumber(pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens');
    const cacheCreationPerMillionTokens = getPricingNumber(pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens');
    const thinkingPerMillionTokens = getPricingNumber(pricing, 'thinkingPerMillionTokens', null);

    return {
        currency: normalizeCurrency(pricing.currency),
        inputPerMillionTokens,
        outputPerMillionTokens,
        cachedInputPerMillionTokens,
        cacheCreationPerMillionTokens,
        thinkingPerMillionTokens: thinkingPerMillionTokens || outputPerMillionTokens,
        inputPer1kTokens: inputPerMillionTokens,
        outputPer1kTokens: outputPerMillionTokens,
        cachedInputPer1kTokens: cachedInputPerMillionTokens,
        cacheCreationPer1kTokens: cacheCreationPerMillionTokens,
        imagePerUnit: toNonNegativeNumber(pricing.imagePerUnit),
        requestFlatFee: toNonNegativeNumber(pricing.requestFlatFee),
        priceMultiplier: toNonNegativeNumber(pricing.priceMultiplier, 1),
    };
}

function normalizeConnectivityStatus(status = {}) {
    const normalizedStatus = String(status?.status || '').trim().toLowerCase();
    const allowedStatus = ['unknown', 'ok', 'failed'].includes(normalizedStatus)
        ? normalizedStatus
        : 'unknown';
    let testedAt = '';
    if (status?.testedAt instanceof Date) {
        testedAt = Number.isNaN(status.testedAt.getTime()) ? '' : status.testedAt.toISOString();
    } else {
        const rawTestedAt = String(status?.testedAt || '').trim();
        if (rawTestedAt) {
            const parsedTestedAt = new Date(rawTestedAt);
            testedAt = Number.isNaN(parsedTestedAt.getTime())
                ? ''
                : parsedTestedAt.toISOString();
        }
    }
    const message = String(status?.message || '').trim();
    const statusCode = Number(status?.statusCode);
    const latencyMs = Number(status?.latencyMs);

    return {
        status: allowedStatus,
        testedAt: testedAt || '',
        message,
        statusCode: Number.isFinite(statusCode) ? statusCode : 0,
        latencyMs: Number.isFinite(latencyMs) ? latencyMs : 0,
    };
}

function normalizeProviderConfig(provider) {
    const providerId = normalizeStoredId(provider.id || provider.name);

    return {
        id: providerId,
        apiBaseUrl: String(provider.apiBaseUrl || '').trim(),
        apiKey: String(provider.apiKey || ''),
    };
}

function findModelByReference(models = [], reference, options = {}) {
    const modelId = normalizeModelId(reference);
    const normalizedReferenceId = normalizeProviderId(reference);
    const normalizedProviderIdFilter = normalizeStoredId(options.providerId);
    const upstreamModel = normalizeModelId(options.upstreamModel);
    const normalizedUpstreamApi = normalizeUpstreamApi(options.upstreamApi || options.apiFormat);

    if (!modelId && !upstreamModel) {
        return null;
    }

    const directMatches = models.filter((item) => (
        item.id === modelId
        || normalizeProviderId(item.id) === normalizedReferenceId
    ));
    if (directMatches.length === 1) {
        return directMatches[0];
    }

    const providerScopedMatches = models.filter((item) => {
        const sameUpstreamModel = (
            normalizeModelId(item.upstreamModel) === modelId
            || normalizeProviderId(item.upstreamModel) === normalizedReferenceId
            || (upstreamModel && normalizeModelId(item.upstreamModel) === upstreamModel)
        );

        if (!sameUpstreamModel) {
            return false;
        }

        if (!normalizedProviderIdFilter) {
            return !normalizedUpstreamApi || normalizeUpstreamApi(item.upstreamApi) === normalizedUpstreamApi;
        }

        return normalizeProviderId(item.providerId) === normalizeProviderId(normalizedProviderIdFilter)
            && (!normalizedUpstreamApi || normalizeUpstreamApi(item.upstreamApi) === normalizedUpstreamApi);
    });
    if (providerScopedMatches.length === 1) {
        return providerScopedMatches[0];
    }

    return directMatches[0] || null;
}

function findProviderByReference(providers = [], reference) {
    const providerId = normalizeStoredId(reference);
    if (!providerId) {
        return null;
    }

    return providers.find((item) => item.id === providerId)
        || providers.find((item) => normalizeProviderId(item.id) === normalizeProviderId(providerId))
        || null;
}

function buildGeneratedModelId(providerId, upstreamApi, modelId) {
    const normalizedProviderKey = normalizeStoredId(providerId);
    const normalizedApiKey = normalizeProviderId(
        normalizeUpstreamApi(upstreamApi) || upstreamApi
    );
    const normalizedModelKey = normalizeProviderId(modelId);

    return [normalizedProviderKey, normalizedApiKey, normalizedModelKey]
        .filter(Boolean)
        .join('--');
}

function normalizeModelConfig(model, providers = []) {
    const provider = findProviderByReference(providers, model.providerId);
    const upstreamModel = normalizeModelId(
        model.upstreamModel || model.id || model.name || model.displayName || model.modelName || ''
    );
    const modelId = normalizeModelId(upstreamModel);

    if (!modelId || !provider) {
        return null;
    }

    const upstreamApi = normalizeUpstreamApi(model.upstreamApi || model.upstreamApiFormat || model.apiFormat);
    if (!upstreamModel) {
        return null;
    }

    return {
        id: buildGeneratedModelId(provider.id, upstreamApi, modelId),
        providerId: provider.id,
        upstreamModel,
        upstreamApi,
        enabled: model.enabled !== false,
        connectivityStatus: normalizeConnectivityStatus(model.connectivityStatus),
    };
}

function normalizeExternalModelTargets(payload = {}, models = [], externalModelName = '') {
    const modelIds = new Set(models.map((model) => model.id));
    const targetItems = Array.isArray(payload.targets) && payload.targets.length
        ? payload.targets
        : (Array.isArray(payload.modelIds)
            ? payload.modelIds.map((modelId, index) => ({
                modelId,
                priority: (index + 1) * 100,
                weight: 1,
                enabled: true,
            }))
            : []);

    return targetItems
        .map((target, index) => ({
            externalModelName,
            modelId: normalizeStoredId(target.modelId || target.id || target),
            priority: Number.isFinite(Number(target.priority)) ? Number(target.priority) : ((index + 1) * 100),
            weight: Number.isFinite(Number(target.weight)) ? Number(target.weight) : 1,
            enabled: target.enabled !== false,
        }))
        .filter((target) => target.modelId && modelIds.has(target.modelId));
}

function normalizeExternalModelConfig(externalModel, models = []) {
    const name = String(
        externalModel.name || externalModel.externalModelName || externalModel.modelName || ''
    ).trim();
    const strategy = String(externalModel.strategy || 'round_robin').trim() || 'round_robin';

    if (!name) {
        return null;
    }

    const targets = normalizeExternalModelTargets(externalModel, models, name);
    const pricing = externalModel.pricing && typeof externalModel.pricing === 'object'
        ? getDefaultPricing(externalModel.pricing)
        : getDefaultPricing();

    return {
        name,
        strategy,
        pricing,
        updatedAt: externalModel.updatedAt || null,
        targets,
    };
}

function validateProviderPayload(payload, { requireApiKey } = {}) {
    const id = normalizeStoredId(payload.id || payload.name);
    if (!id) {
        return 'Provider id is required.';
    }

    if (!payload.apiBaseUrl || !String(payload.apiBaseUrl).trim()) {
        return 'Provider apiBaseUrl is required.';
    }

    try {
        new URL(String(payload.apiBaseUrl).trim());
    } catch {
        return 'Provider apiBaseUrl must be a valid URL.';
    }

    if (requireApiKey && !String(payload.apiKey || '').trim()) {
        return 'Provider apiKey is required.';
    }

    return null;
}

function validateModelPayload(payload, { providers = [] } = {}) {
    const upstreamModel = normalizeModelId(
        payload.upstreamModel || payload.id || payload.name || payload.displayName || payload.modelName || ''
    );
    const modelId = normalizeModelId(upstreamModel);
    if (!modelId) {
        return 'Model id is required.';
    }

    const provider = findProviderByReference(providers, payload.providerId);
    if (!provider) {
        return 'Provider is required.';
    }

    if (!upstreamModel) {
        return 'Upstream model is required.';
    }

    if (!normalizeUpstreamApi(payload.upstreamApi || payload.upstreamApiFormat || payload.apiFormat)) {
        return 'Upstream API is required.';
    }

    return null;
}

function validateExternalModelPayload(payload, { models = [] } = {}) {
    const name = String(payload.name || payload.externalModelName || payload.modelName || '').trim();
    if (!name) {
        return 'External model name is required.';
    }

    const strategy = String(payload.strategy || 'round_robin').trim() || 'round_robin';
    if (!['round_robin', 'failover', 'priority'].includes(strategy)) {
        return 'External model strategy is invalid.';
    }

    const targets = normalizeExternalModelTargets(payload, models, name);
    if (!targets.length) {
        return 'At least one model is required.';
    }

    const seenModelIds = new Set();
    for (const target of targets) {
        if (seenModelIds.has(target.modelId)) {
            return 'External model targets must be unique.';
        }
        seenModelIds.add(target.modelId);

        if (!Number.isFinite(target.priority)) {
            return 'Target priority must be a number.';
        }

        if (!Number.isFinite(target.weight) || target.weight < 0) {
            return 'Target weight must be a non-negative number.';
        }
    }

    if (payload.pricing !== undefined && payload.pricing !== null) {
        const pricing = getDefaultPricing(payload.pricing);
        const values = Object.values(pricing).filter((value) => typeof value === 'number');
        if (values.some((value) => value < 0 || !Number.isFinite(value))) {
            return 'External model pricing fields must be non-negative numbers.';
        }
    }

    return null;
}

function normalizeConfig(rawConfig, port) {
    const sourceConfig = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const legacyAdmin = sourceConfig.admin || {};
    const admins = Array.isArray(sourceConfig.admins)
        ? sourceConfig.admins
            .filter((admin) => admin && typeof admin === 'object')
            .map(normalizeAccount)
            .filter((admin) => admin.username && admin.password)
        : (legacyAdmin.username || legacyAdmin.password
            ? [normalizeAccount({
                username: legacyAdmin.username || DEFAULT_ADMIN_USERNAME,
                password: legacyAdmin.password || DEFAULT_ADMIN_PASSWORD,
            })].filter((admin) => admin.username && admin.password)
            : buildInitialAdmins());
    const users = Array.isArray(sourceConfig.users)
        ? sourceConfig.users
            .filter((user) => user && typeof user === 'object')
            .map((user) => ({
                username: String(user.username || '').trim(),
                password: String(user.password || ''),
                apiKeys: Array.isArray(user.apiKeys)
                    ? user.apiKeys
                        .map(normalizeUserApiKey)
                        .filter((apiKey) => apiKey.key)
                    : [],
                wallet: normalizeUserWallet(user.wallet),
            }))
            .filter((user) => user.username && user.password)
        : buildInitialUsers();
    const providers = Array.isArray(sourceConfig.providers)
        ? sourceConfig.providers.map(normalizeProviderConfig).filter((provider) => provider.id)
        : [];
    const normalizedModels = (Array.isArray(sourceConfig.models) ? sourceConfig.models : [])
        .map((model) => normalizeModelConfig(model, providers))
        .filter(Boolean);
    const normalizedExternalModels = Array.isArray(sourceConfig.externalModels)
        ? sourceConfig.externalModels
            .map((externalModel) => normalizeExternalModelConfig(externalModel, normalizedModels))
            .filter(Boolean)
        : [];

    return {
        server: {
            port: Number(sourceConfig.server?.port || port),
            sessionTtlHours: toNonNegativeNumber(sourceConfig.server?.sessionTtlHours, DEFAULT_SESSION_TTL_HOURS),
        },
        admins: admins.length ? admins : buildInitialAdmins(),
        users,
        payments: normalizePaymentsConfig(sourceConfig.payments),
        providers,
        models: normalizedModels,
        externalModels: normalizedExternalModels,
    };
}

function sanitizeAdminProvider(provider) {
    const { apiKey, ...rest } = provider;
    return {
        ...rest,
        apiKey,
        apiKeyMasked: maskApiKey(apiKey),
    };
}

function sanitizeAdminModel(model, providers = []) {
    const provider = providers.find((item) => item.id === model.providerId);
    const { pricing, ...rest } = model;

    return {
        ...rest,
        providerName: provider?.id || model.providerId,
        upstreamApi: normalizeUpstreamApi(model.upstreamApi),
        upstreamApiLabel: getApiLabel(normalizeUpstreamApi(model.upstreamApi)),
        enabled: model.enabled !== false,
        connectivityStatus: normalizeConnectivityStatus(model.connectivityStatus),
    };
}

function sanitizeAdminExternalModel(externalModel, targets = [], models = [], providers = []) {
    const externalModelTargets = targets
        .filter((target) => target.externalModelName === externalModel.name)
        .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0));

    return {
        name: externalModel.name,
        externalModelName: externalModel.name,
        strategy: externalModel.strategy || 'round_robin',
        pricing: getDefaultPricing(externalModel.pricing),
        updatedAt: externalModel.updatedAt || null,
        targets: externalModelTargets.map((target) => {
            const model = models.find((item) => item.id === target.modelId) || { id: target.modelId, providerId: '' };
            const modelDetails = sanitizeAdminModel(model, providers);
            return {
                ...target,
                modelId: model.id,
                model,
                modelDetails,
            };
        }),
        modelIds: externalModelTargets.map((target) => target.modelId),
    };
}

module.exports = {
    buildInitialAdmins,
    buildInitialUsers,
    buildGeneratedModelId,
    createDefaultPaymentsConfig,
    createEmptyUserWallet,
    getDefaultPricing,
    normalizeConnectivityStatus,
    normalizeConfig,
    normalizeExternalModelConfig,
    normalizeModelConfig,
    normalizeProviderConfig,
    sanitizeAdminExternalModel,
    sanitizeAdminModel,
    sanitizeAdminProvider,
    sanitizeUserApiKey,
    validateExternalModelPayload,
    validateModelPayload,
    validateProviderPayload,
};
