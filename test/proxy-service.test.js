const test = require('node:test');
const assert = require('node:assert/strict');

const { ProxyService } = require('../src/services/proxy-service');

test('forwardRequest uses a fresh subscription quota reservation id for each upstream retry', async () => {
    const originalFetch = global.fetch;
    const quotaReservationIds = [];
    const completedReservations = [];
    let fetchCalls = 0;
    let resolveCalls = 0;

    const provider = {
        id: 'provider-1',
        name: 'Provider 1',
        apiBaseUrl: 'https://upstream.example/v1',
        apiKey: 'test-key',
    };

    const makeContext = (suffix) => ({
        provider,
        model: {
            id: `model-${suffix}`,
            name: 'gpt-test',
            externalModelName: 'gpt-test',
            upstreamModel: 'gpt-test-upstream',
            upstreamApi: 'chat_completions',
            pricing: {},
        },
        sourceModel: {
            id: `source-${suffix}`,
            upstreamModel: 'gpt-test-upstream',
            upstreamApi: 'chat_completions',
        },
        externalModel: {
            name: 'gpt-test',
        },
    });

    global.fetch = async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
            throw new Error('temporary upstream failure');
        }

        return new Response(JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: 'ok' },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    try {
        const service = new ProxyService({
            statsService: null,
            paymentConfigService: {
                async getBillingConfig() {
                    return { rechargeEnabled: true };
                },
            },
            userLookup: async () => ({ username: 'alice', balance_usd: 10 }),
            subscriptionService: {
                async resolveUsageAccess({ requestId }) {
                    quotaReservationIds.push(requestId);
                    return {
                        mode: 'subscription',
                        subscription: { active: true, planId: 'plan-pro' },
                        quotaReservation: { requestId },
                        appliedLimit: {
                            externalModelName: 'gpt-test',
                            quotaConsumptionEnabled: true,
                        },
                    };
                },
                async completeUsageReservation({ quotaReservation, success }) {
                    completedReservations.push({
                        requestId: quotaReservation.requestId,
                        success,
                    });
                },
            },
            requestAccountingService: {
                async recordUsageOnly() {
                    return { recorded: true };
                },
            },
            modelResolutionService: {
                async resolveModelContext() {
                    resolveCalls += 1;
                    return makeContext(resolveCalls);
                },
            },
            catalogAdminService: null,
            waitForBootstrapReady: async () => undefined,
        });

        const result = await service.forwardRequest({
            apiId: 'chat_completions',
            requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            username: 'alice',
            body: {
                model: 'gpt-test',
                messages: [{ role: 'user', content: 'hello' }],
            },
        });

        assert.equal(result.status, 200);
        assert.equal(fetchCalls, 2);
        assert.equal(quotaReservationIds.length, 2);
        assert.notEqual(quotaReservationIds[0], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        assert.notEqual(quotaReservationIds[1], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        assert.notEqual(quotaReservationIds[0], quotaReservationIds[1]);
        assert.deepEqual(completedReservations, [
            { requestId: quotaReservationIds[0], success: false },
            { requestId: quotaReservationIds[1], success: true },
        ]);
    } finally {
        global.fetch = originalFetch;
    }
});

test('forwardRequest reports upstream exhaustion instead of no available models after retry failure', async () => {
    const originalFetch = global.fetch;
    let resolveCalls = 0;

    const provider = {
        id: 'provider-1',
        name: 'Provider 1',
        apiBaseUrl: 'https://upstream.example/v1',
        apiKey: 'test-key',
    };

    global.fetch = async () => {
        throw new Error('fetch failed');
    };

    try {
        const service = new ProxyService({
            statsService: null,
            paymentConfigService: {
                async getBillingConfig() {
                    return { rechargeEnabled: true };
                },
            },
            userLookup: async () => ({ username: 'alice', balance_usd: 10 }),
            subscriptionService: {
                async resolveUsageAccess({ requestId }) {
                    return {
                        mode: 'subscription',
                        subscription: { active: true, planId: 'plan-pro' },
                        quotaReservation: { requestId },
                        appliedLimit: {
                            externalModelName: 'gpt-test',
                            quotaConsumptionEnabled: true,
                        },
                    };
                },
                async completeUsageReservation() {},
            },
            requestAccountingService: {
                async recordUsageOnly() {
                    return { recorded: true };
                },
            },
            modelResolutionService: {
                async resolveModelContext() {
                    resolveCalls += 1;
                    if (resolveCalls > 1) {
                        const error = new Error('External model "gpt-test" has no available models.');
                        error.status = 400;
                        throw error;
                    }

                    return {
                        provider,
                        model: {
                            id: 'model-1',
                            name: 'gpt-test',
                            externalModelName: 'gpt-test',
                            upstreamModel: 'gpt-test-upstream',
                            upstreamApi: 'chat_completions',
                            pricing: {},
                        },
                        sourceModel: {
                            id: 'source-1',
                            upstreamModel: 'gpt-test-upstream',
                            upstreamApi: 'chat_completions',
                        },
                        externalModel: {
                            name: 'gpt-test',
                        },
                    };
                },
            },
            catalogAdminService: null,
            waitForBootstrapReady: async () => undefined,
        });

        await assert.rejects(
            () => service.forwardRequest({
                apiId: 'chat_completions',
                requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                username: 'alice',
                body: {
                    model: 'gpt-test',
                    messages: [{ role: 'user', content: 'hello' }],
                },
            }),
            (error) => {
                assert.equal(error.status, 502);
                assert.match(error.message, /upstream request failed/i);
                assert.match(error.message, /all fallback source models were exhausted/i);
                assert.match(error.message, /fetch failed/i);
                assert.doesNotMatch(error.message, /^External model "gpt-test" has no available models\.$/);
                return true;
            }
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test('forwardRequest retries the next source model after upstream quota exhaustion response', async () => {
    const originalFetch = global.fetch;
    const completedReservations = [];
    const recordedRequestIds = [];
    let fetchCalls = 0;
    let resolveCalls = 0;

    const provider = {
        id: 'provider-1',
        name: 'Provider 1',
        apiBaseUrl: 'https://upstream.example/v1',
        apiKey: 'test-key',
    };

    const makeContext = (suffix) => ({
        provider,
        model: {
            id: `model-${suffix}`,
            name: 'gpt-test',
            externalModelName: 'gpt-test',
            upstreamModel: `gpt-test-upstream-${suffix}`,
            upstreamApi: 'chat_completions',
            pricing: {},
        },
        sourceModel: {
            id: `source-${suffix}`,
            upstreamModel: `gpt-test-upstream-${suffix}`,
            upstreamApi: 'chat_completions',
        },
        externalModel: {
            name: 'gpt-test',
        },
    });

    global.fetch = async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
            return new Response(JSON.stringify({
                error: {
                    code: 'usage_limit_reached',
                    message: 'Model quota exhausted for today.',
                },
            }), {
                status: 402,
                headers: { 'content-type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: 'ok' },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    try {
        const service = new ProxyService({
            statsService: null,
            paymentConfigService: {
                async getBillingConfig() {
                    return { rechargeEnabled: true };
                },
            },
            userLookup: async () => ({ username: 'alice', balance_usd: 10 }),
            subscriptionService: {
                async resolveUsageAccess({ requestId }) {
                    return {
                        mode: 'subscription',
                        subscription: { active: true, planId: 'plan-pro' },
                        quotaReservation: { requestId },
                        appliedLimit: {
                            externalModelName: 'gpt-test',
                            quotaConsumptionEnabled: true,
                        },
                    };
                },
                async completeUsageReservation({ quotaReservation, success }) {
                    completedReservations.push({
                        requestId: quotaReservation.requestId,
                        success,
                    });
                },
            },
            requestAccountingService: {
                async recordUsageOnly({ requestSummary }) {
                    recordedRequestIds.push(requestSummary.requestId);
                    return { recorded: true };
                },
            },
            modelResolutionService: {
                async resolveModelContext(_payload) {
                    resolveCalls += 1;
                    return makeContext(resolveCalls);
                },
            },
            catalogAdminService: null,
            waitForBootstrapReady: async () => undefined,
        });

        const result = await service.forwardRequest({
            apiId: 'chat_completions',
            requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            username: 'alice',
            body: {
                model: 'gpt-test',
                messages: [{ role: 'user', content: 'hello' }],
            },
        });

        assert.equal(result.status, 200);
        assert.equal(fetchCalls, 2);
        assert.equal(resolveCalls, 2);
        assert.equal(recordedRequestIds.length, 1);
        assert.deepEqual(completedReservations.map((item) => item.success), [false, true]);
    } finally {
        global.fetch = originalFetch;
    }
});

test('forwardRequest waits for a queued upstream rate limit slot before fetch', async () => {
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    let rateLimitCalls = 0;
    const waits = [];
    let waitedForSlot = false;

    global.fetch = async () => {
        fetchCalls += 1;
        assert.equal(waitedForSlot, true);
        return new Response(JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            choices: [{
                index: 0,
                message: { role: 'assistant', content: 'ok' },
                finish_reason: 'stop',
            }],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };

    try {
        const service = new ProxyService({
            statsService: {
                recordRequestStats() {},
            },
            paymentConfigService: {
                async getBillingConfig() {
                    return { rechargeEnabled: true };
                },
            },
            userLookup: async () => ({ username: 'alice', balance_usd: 10 }),
            subscriptionService: null,
            requestAccountingService: null,
            modelResolutionService: {
                async resolveModelContext() {
                    return {
                        provider: {
                            id: 'provider-1',
                            name: 'Provider 1',
                            apiBaseUrl: 'https://upstream.example/v1',
                            apiKey: 'test-key',
                        },
                        model: {
                            id: 'model-1',
                            name: 'gpt-test',
                            externalModelName: 'gpt-test',
                            upstreamModel: 'gpt-test-upstream',
                            upstreamApi: 'chat_completions',
                            pricing: {},
                        },
                        sourceModel: null,
                        externalModel: null,
                    };
                },
            },
            catalogAdminService: null,
            userRateLimitScheduler: async (username) => {
                rateLimitCalls += 1;
                assert.equal(username, 'alice');
                return {
                    rateLimitEnabled: true,
                    intervalSeconds: 30,
                    waitMs: 12,
                };
            },
            userRateLimitWait: async (milliseconds) => {
                waits.push(milliseconds);
                waitedForSlot = true;
            },
            waitForBootstrapReady: async () => undefined,
        });

        const result = await service.forwardRequest({
            apiId: 'chat_completions',
            requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            username: 'alice',
            body: {
                model: 'gpt-test',
                messages: [{ role: 'user', content: 'hello' }],
            },
        });

        assert.equal(result.status, 200);
        assert.equal(rateLimitCalls, 1);
        assert.deepEqual(waits, [12]);
        assert.equal(fetchCalls, 1);
    } finally {
        global.fetch = originalFetch;
    }
});
