const { getModelResolutionCacheConfig } = require('../config/infrastructure');
const { connectRedisClient } = require('../db/redis-client');
const { createHttpError } = require('../utils/http-error');

class ModelResolutionService {
    constructor({
        providerRepository,
        modelRepository,
        externalModelRepository,
        redisClient = null,
        cacheConfig = getModelResolutionCacheConfig(),
    }) {
        this.providerRepository = providerRepository;
        this.modelRepository = modelRepository;
        this.externalModelRepository = externalModelRepository;
        this.redisClient = redisClient;
        this.cacheTtlMs = Number(cacheConfig.ttlMs || 5000);
        this.cache = null;
        this.externalModelCursor = new Map();
    }

    normalizeProvider(provider = {}) {
        return {
            id: provider.id,
            name: provider.id,
            apiBaseUrl: provider.api_base_url,
            apiKey: provider.api_key,
        };
    }

    normalizeSourceModel(model = {}) {
        return {
            id: model.id,
            providerId: model.provider_id,
            upstreamModel: model.upstream_model,
            upstreamApi: model.upstream_api,
            name: model.upstream_model || model.id,
            enabled: model.enabled !== false,
            connectivityStatus: {
                status: model.connectivity_status || 'unknown',
                testedAt: model.connectivity_tested_at || '',
                message: model.connectivity_message || '',
                statusCode: Number(model.connectivity_status_code || 0),
                latencyMs: Number(model.connectivity_latency_ms || 0),
            },
        };
    }

    normalizeExternalModel(externalModel = {}) {
        const outputPerMillionTokens = Number(externalModel.output_per_million_tokens || 0);
        return {
            name: String(externalModel.name || '').trim(),
            strategy: String(externalModel.strategy || 'round_robin').trim() || 'round_robin',
            pricing: {
                currency: externalModel.pricing_currency || 'USD',
                inputPerMillionTokens: Number(externalModel.input_per_million_tokens || 0),
                outputPerMillionTokens,
                cachedInputPerMillionTokens: Number(externalModel.cached_input_per_million_tokens || 0),
                cacheCreationPerMillionTokens: Number(externalModel.cache_creation_per_million_tokens || 0),
                thinkingPerMillionTokens: Number(
                    externalModel.thinking_per_million_tokens
                    || outputPerMillionTokens
                ),
                imagePerUnit: Number(externalModel.image_per_unit || 0),
                requestFlatFee: Number(externalModel.request_flat_fee || 0),
                priceMultiplier: Number(externalModel.price_multiplier || 1.5),
            },
            updatedAt: externalModel.updated_at || externalModel.updatedAt || null,
        };
    }

    normalizeExternalModelTarget(target = {}) {
        return {
            externalModelName: String(target.external_model_name || target.externalModelName || '').trim(),
            modelId: String(target.model_id || target.modelId || '').trim(),
            priority: Number.isFinite(Number(target.priority)) ? Number(target.priority) : 100,
            weight: Number.isFinite(Number(target.weight)) ? Number(target.weight) : 1,
            enabled: target.enabled !== false,
            updatedAt: target.updated_at || target.updatedAt || null,
        };
    }

    getSnapshotCacheKey() {
        return `${this.redisClient?.keyPrefix || ''}snapshot-cache`;
    }

    isCacheFresh() {
        return Boolean(
            this.cache
            && (Date.now() - this.cache.loadedAt) < this.cacheTtlMs
        );
    }

    async loadSnapshotFromRedis() {
        if (!this.redisClient) return null;

        try {
            await connectRedisClient(this.redisClient);
            const raw = await this.redisClient.get(this.getSnapshotCacheKey());
            if (!raw) return null;

            const data = JSON.parse(raw);
            return {
                loadedAt: data.loadedAt,
                providers: data.providers,
                models: data.models,
                externalModels: data.externalModels,
                externalModelTargets: data.externalModelTargets,
                providersById: new Map(data.providers.map((p) => [p.id, p])),
                modelsById: new Map(data.models.map((m) => [m.id, m])),
                externalModelsByName: new Map(data.externalModels.map((e) => [e.name, e])),
                targetsByExternalModelName: (() => {
                    const map = new Map();
                    for (const t of data.externalModelTargets) {
                        const list = map.get(t.externalModelName) || [];
                        list.push(t);
                        map.set(t.externalModelName, list);
                    }
                    return map;
                })(),
            };
        } catch (error) {
            console.warn(
                `[model-resolution] Failed to load snapshot from Redis: ${error.stack || error.message}`
            );
            return null;
        }
    }

    async saveSnapshotToRedis(snapshot) {
        if (!this.redisClient) return;

        try {
            await connectRedisClient(this.redisClient);
            const ttlSec = Math.max(1, Math.ceil(this.cacheTtlMs / 1000));
            // Strip non-serializable Maps; store only plain arrays
            const payload = {
                loadedAt: snapshot.loadedAt,
                providers: snapshot.providers,
                models: snapshot.models,
                externalModels: snapshot.externalModels,
                externalModelTargets: snapshot.externalModelTargets,
            };
            await this.redisClient.set(this.getSnapshotCacheKey(), JSON.stringify(payload), {
                EX: ttlSec,
            });
        } catch (error) {
            console.warn(
                `[model-resolution] Failed to save snapshot to Redis: ${error.stack || error.message}`
            );
        }
    }

    buildResolvedContext(sourceModel, snapshot, externalModel = null) {
        const provider = snapshot.providersById.get(sourceModel.providerId);
        if (!provider) {
            throw createHttpError(400, `Provider "${sourceModel.providerId}" not found for model "${sourceModel.id}".`);
        }

        return {
            provider,
            model: {
                id: externalModel?.name || sourceModel.id,
                name: externalModel?.name || sourceModel.id,
                displayName: externalModel?.name || sourceModel.name,
                externalModelName: externalModel?.name || null,
                sourceModelId: sourceModel.id,
                sourceModelName: sourceModel.name,
                upstreamModel: sourceModel.upstreamModel,
                upstreamApi: sourceModel.upstreamApi,
                pricing: externalModel?.pricing || null,
                connectivityStatus: sourceModel.connectivityStatus,
            },
            sourceModel,
            externalModel,
        };
    }

    sortTargets(targets = []) {
        return [...targets].sort((a, b) => {
            const priorityDiff = Number(a.priority || 0) - Number(b.priority || 0);
            if (priorityDiff !== 0) {
                return priorityDiff;
            }

            return String(a.modelId || '').localeCompare(String(b.modelId || ''));
        });
    }

    getActiveTargets(snapshot, externalModelName, excludedModelIds = []) {
        const excludedSet = new Set((excludedModelIds || []).filter(Boolean));
        const targets = this.sortTargets(snapshot.targetsByExternalModelName.get(externalModelName) || []);
        return targets.filter((target) => (
            target.enabled !== false
            && snapshot.modelsById.has(target.modelId)
            && snapshot.modelsById.get(target.modelId)?.enabled !== false
            && !excludedSet.has(target.modelId)
        ));
    }

    getHealthyTargets(snapshot, externalModelName, excludedModelIds = []) {
        const activeTargets = this.getActiveTargets(snapshot, externalModelName, excludedModelIds);
        const healthyTargets = activeTargets.filter((target) => {
            const model = snapshot.modelsById.get(target.modelId);
            return model && model.connectivityStatus?.status !== 'failed';
        });

        return healthyTargets.length ? healthyTargets : activeTargets;
    }

    getExternalModelCursorKey(externalModelName) {
        const normalizedName = String(externalModelName || '').trim();
        return `${this.redisClient?.keyPrefix || ''}external-model-cursor:${normalizedName}`;
    }

    async getNextRoundRobinIndex(externalModelName, candidateCount) {
        if (!Number.isInteger(candidateCount) || candidateCount <= 0) {
            return 0;
        }

        if (this.redisClient) {
            try {
                await connectRedisClient(this.redisClient);
                const cursorKey = this.getExternalModelCursorKey(externalModelName);
                const nextCursor = await this.redisClient.incr(cursorKey);
                await this.redisClient.expire(cursorKey, 60 * 60 * 24 * 30);
                return (Number(nextCursor || 1) - 1) % candidateCount;
            } catch (error) {
                console.warn(
                    `[model-resolution] Failed to use redis round-robin cursor for "${externalModelName}": `
                    + `${error.stack || error.message}`
                );
            }
        }

        const cursor = this.externalModelCursor.get(externalModelName) || 0;
        this.externalModelCursor.set(externalModelName, (cursor + 1) % candidateCount);
        return cursor % candidateCount;
    }

    async selectTarget(externalModel, snapshot, excludedModelIds = []) {
        const candidates = externalModel.strategy === 'failover' || externalModel.strategy === 'priority'
            ? this.getActiveTargets(snapshot, externalModel.name, excludedModelIds)
            : this.getHealthyTargets(snapshot, externalModel.name, excludedModelIds);
        if (!candidates.length) {
            throw createHttpError(400, `External model "${externalModel.name}" has no available models.`);
        }

        if (externalModel.strategy === 'failover' || externalModel.strategy === 'priority') {
            return candidates[0];
        }

        const index = await this.getNextRoundRobinIndex(externalModel.name, candidates.length);
        return candidates[index];
    }

    async loadSnapshot({ force = false } = {}) {
        if (!force && this.isCacheFresh()) {
            return this.cache;
        }

        // Try Redis first to avoid hitting DB
        if (!force) {
            const fromRedis = await this.loadSnapshotFromRedis();
            if (fromRedis) {
                this.cache = fromRedis;
                return this.cache;
            }
        }

        const [providerRows, modelRows, externalModelRows, externalModelTargetRows] = await Promise.all([
            this.providerRepository.listAll(),
            this.modelRepository.listAll(),
            this.externalModelRepository.listAll(),
            this.externalModelRepository.listTargets(),
        ]);

        const providers = providerRows.map((provider) => this.normalizeProvider(provider));
        const models = modelRows.map((model) => this.normalizeSourceModel(model));
        const externalModels = externalModelRows.map((externalModel) => this.normalizeExternalModel(externalModel));
        const externalModelTargets = externalModelTargetRows.map((target) => this.normalizeExternalModelTarget(target));
        const targetsByExternalModelName = new Map();

        for (const target of externalModelTargets) {
            const targetList = targetsByExternalModelName.get(target.externalModelName) || [];
            targetList.push(target);
            targetsByExternalModelName.set(target.externalModelName, targetList);
        }

        this.cache = {
            loadedAt: Date.now(),
            providers,
            models,
            externalModels,
            externalModelTargets,
            providersById: new Map(providers.map((provider) => [provider.id, provider])),
            modelsById: new Map(models.map((model) => [model.id, model])),
            externalModelsByName: new Map(externalModels.map((externalModel) => [externalModel.name, externalModel])),
            targetsByExternalModelName,
        };

        // Persist to Redis for other instances to share
        await this.saveSnapshotToRedis(this.cache);

        return this.cache;
    }

    async resolveModelContext({ modelName, excludedModelIds = [] } = {}) {
        const snapshot = await this.loadSnapshot();
        const requestedModelName = String(modelName || '').trim();
        if (!requestedModelName) {
            throw createHttpError(400, 'Configured model not found.');
        }

        const externalModel = snapshot.externalModelsByName.get(requestedModelName);
        if (externalModel) {
            const selectedTarget = await this.selectTarget(externalModel, snapshot, excludedModelIds);
            const sourceModel = snapshot.modelsById.get(selectedTarget.modelId);
            if (!sourceModel) {
                throw createHttpError(400, `Model "${selectedTarget.modelId}" not found for external model "${externalModel.name}".`);
            }

            return this.buildResolvedContext(sourceModel, snapshot, externalModel);
        }

        const directModel = snapshot.modelsById.get(requestedModelName);
        if (directModel) {
            throw createHttpError(
                400,
                `Direct access to source model "${requestedModelName}" is disabled. Use an external model instead.`
            );
        }

        throw createHttpError(400, 'Configured model not found.');
    }

    async getDirectModelContext(modelId, { allowDisabled = false } = {}) {
        const snapshot = await this.loadSnapshot();
        const model = snapshot.modelsById.get(modelId);

        if (!model) {
            throw createHttpError(404, `Model "${modelId}" not found.`);
        }

        if (!allowDisabled && model.enabled === false) {
            throw createHttpError(400, `Model "${modelId}" is disabled.`);
        }

        return this.buildResolvedContext(model, snapshot, null);
    }

    async getModelCatalogEntries() {
        const snapshot = await this.loadSnapshot();
        return snapshot.externalModels
            .map((externalModel) => {
                const targets = this.getHealthyTargets(snapshot, externalModel.name);
                const primaryTarget = targets[0] || null;
                const sourceModel = primaryTarget ? snapshot.modelsById.get(primaryTarget.modelId) : null;

                return {
                    externalModel,
                    sourceModel,
                    targets,
                };
            })
            .filter((entry) => entry.sourceModel);
    }

    async invalidateCache() {
        this.cache = null;
        if (!this.redisClient) return;

        try {
            await connectRedisClient(this.redisClient);
            await this.redisClient.del(this.getSnapshotCacheKey());
        } catch (error) {
            console.warn(
                `[model-resolution] Failed to invalidate Redis snapshot cache: ${error.stack || error.message}`
            );
        }
    }

    // Sync invalidation for callers that don't await
    invalidateCacheSync() {
        this.cache = null;
    }
}

module.exports = {
    ModelResolutionService,
};
