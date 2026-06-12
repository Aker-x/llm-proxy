const test = require('node:test');
const assert = require('node:assert/strict');

const { ModelResolutionService } = require('../src/services/model-resolution-service');

function createService() {
    return new ModelResolutionService({
        providerRepository: {
            async listAll() {
                return [{
                    id: 'provider-1',
                    api_base_url: 'https://example.com/v1',
                    api_key: 'test-key',
                }];
            },
        },
        modelRepository: {
            async listAll() {
                return [
                    {
                        id: 'model-mini',
                        provider_id: 'provider-1',
                        upstream_model: 'gpt-5.4-mini',
                        upstream_api: 'responses',
                        enabled: true,
                        connectivity_status: 'failed',
                    },
                    {
                        id: 'model-main',
                        provider_id: 'provider-1',
                        upstream_model: 'gpt-5.4',
                        upstream_api: 'responses',
                        enabled: true,
                        connectivity_status: 'ok',
                    },
                ];
            },
        },
        externalModelRepository: {
            async listAll() {
                return [{
                    name: 'gpt-5.5',
                    strategy: 'priority',
                }];
            },
            async listTargets() {
                return [
                    {
                        external_model_name: 'gpt-5.5',
                        model_id: 'model-mini',
                        priority: 1,
                        enabled: true,
                    },
                    {
                        external_model_name: 'gpt-5.5',
                        model_id: 'model-main',
                        priority: 2,
                        enabled: true,
                    },
                ];
            },
        },
        redisClient: null,
        cacheConfig: { ttlMs: 5000 },
    });
}

test('priority strategy keeps configured order even when the first target is marked failed', async () => {
    const service = createService();

    const context = await service.resolveModelContext({
        modelName: 'gpt-5.5',
    });

    assert.equal(context.sourceModel.id, 'model-mini');
    assert.equal(context.model.upstreamModel, 'gpt-5.4-mini');
});

test('priority strategy skips excluded targets and uses the next configured model', async () => {
    const service = createService();

    const context = await service.resolveModelContext({
        modelName: 'gpt-5.5',
        excludedModelIds: ['model-mini'],
    });

    assert.equal(context.sourceModel.id, 'model-main');
    assert.equal(context.model.upstreamModel, 'gpt-5.4');
});
