const test = require('node:test');
const assert = require('node:assert/strict');

const { SubscriptionService } = require('../src/services/subscription-service');

function createActiveSubscriptionRepository(overrides = {}) {
    const calls = [];
    const repository = {
        calls,
        async releaseStaleDailyUsageReservations() {
            calls.push({ method: 'releaseStaleDailyUsageReservations' });
            return 0;
        },
        async expireStaleSubscriptions() {
            calls.push({ method: 'expireStaleSubscriptions' });
        },
        async getSettings() {
            calls.push({ method: 'getSettings' });
            return {
                enabled: true,
                quota_consumption_enabled: true,
                updated_at: '2026-05-22T00:00:00.000Z',
            };
        },
        async getUserSubscription(username) {
            calls.push({ method: 'getUserSubscription', username });
            return {
                username,
                subscription_status: 'active',
                subscription_plan_id: 'plan-pro',
                subscription_plan_name: 'Pro',
                subscription_plan_description: '',
                subscription_monthly_price_cny: 500,
                subscription_started_at: '2026-05-01T00:00:00.000Z',
                subscription_expires_at: '2099-01-01T00:00:00.000Z',
            };
        },
        async getPlanLimitByExternalModelName(planId, externalModelName) {
            calls.push({ method: 'getPlanLimitByExternalModelName', planId, externalModelName });
            return {
                plan_id: planId,
                external_model_name: externalModelName,
                daily_request_limit: 2,
            };
        },
        async getUserModelPreference({ username, planId, externalModelName }) {
            calls.push({ method: 'getUserModelPreference', username, planId, externalModelName });
            return null;
        },
        async getDailyUsageCountForPlanExternalModel(payload) {
            calls.push({ method: 'getDailyUsageCountForPlanExternalModel', payload });
            return 0;
        },
        async reserveDailyUsage(payload) {
            calls.push({ method: 'reserveDailyUsage', payload });
            return {
                reserved: true,
                requestId: payload.requestId,
                username: payload.username,
                planId: payload.planId,
                externalModelName: payload.externalModelName,
                dailyRequestLimit: payload.dailyRequestLimit,
                requestsToday: 0,
                inflightCount: 1,
                remainingToday: 1,
                quotaDate: '2026-05-22',
            };
        },
        async completeDailyUsageReservation(payload) {
            calls.push({ method: 'completeDailyUsageReservation', payload });
            return {
                request_id: payload.requestId,
                status: payload.consume ? 'consumed' : 'released',
            };
        },
        ...overrides,
    };
    return repository;
}

test('resolveUsageAccess reserves subscription quota with a short admission operation', async () => {
    const repository = createActiveSubscriptionRepository();
    const service = new SubscriptionService({
        subscriptionRepository: repository,
        userLookup: async () => null,
    });

    const result = await service.resolveUsageAccess({
        username: 'alice',
        externalModelName: 'gpt-5.5',
        requestId: '11111111-1111-4111-8111-111111111111',
    });

    assert.equal(result.mode, 'subscription');
    assert.equal(result.quotaReservation.requestId, '11111111-1111-4111-8111-111111111111');
    assert.equal(result.appliedLimit.inflightToday, 1);
    assert.equal(result.appliedLimit.remainingToday, 1);
    assert.equal(
        repository.calls.some((call) => call.method === 'getDailyUsageCountForPlanExternalModel'),
        false
    );

    await service.completeUsageReservation({
        quotaReservation: result.quotaReservation,
        success: true,
    });
    assert.deepEqual(repository.calls.at(-1), {
        method: 'completeDailyUsageReservation',
        payload: {
            requestId: '11111111-1111-4111-8111-111111111111',
            consume: true,
        },
    });
});

test('resolveUsageAccess falls back to balance when reserved quota is already full', async () => {
    const repository = createActiveSubscriptionRepository({
        async reserveDailyUsage(payload) {
            this.calls.push({ method: 'reserveDailyUsage', payload });
            return {
                reserved: false,
                requestId: payload.requestId,
                requestsToday: 2,
                inflightCount: 0,
                remainingToday: 0,
            };
        },
    });
    const service = new SubscriptionService({
        subscriptionRepository: repository,
        userLookup: async () => null,
    });

    const result = await service.resolveUsageAccess({
        username: 'alice',
        externalModelName: 'gpt-5.5',
        requestId: '22222222-2222-4222-8222-222222222222',
    });

    assert.equal(result.mode, 'balance');
    assert.equal(result.appliedLimit.subscriptionExhausted, true);
    assert.equal(result.appliedLimit.requestsToday, 2);
});

test('resolveUsageAccess blocks exhausted quota when balance fallback is disabled', async () => {
    const repository = createActiveSubscriptionRepository({
        async getUserModelPreference({ username, planId, externalModelName }) {
            this.calls.push({ method: 'getUserModelPreference', username, planId, externalModelName });
            return { allow_balance_fallback: false };
        },
        async reserveDailyUsage(payload) {
            this.calls.push({ method: 'reserveDailyUsage', payload });
            return {
                reserved: false,
                requestId: payload.requestId,
                requestsToday: 2,
                inflightCount: 0,
                remainingToday: 0,
            };
        },
    });
    const service = new SubscriptionService({
        subscriptionRepository: repository,
        userLookup: async () => null,
    });

    const result = await service.resolveUsageAccess({
        username: 'alice',
        externalModelName: 'gpt-5.5',
        requestId: '33333333-3333-4333-8333-333333333333',
    });

    assert.equal(result.mode, 'blocked');
    assert.equal(result.appliedLimit.allowBalanceFallback, false);
});

test('resolveUsageAccess does not reserve quota while quota consumption is paused', async () => {
    const repository = createActiveSubscriptionRepository({
        async getSettings() {
            this.calls.push({ method: 'getSettings' });
            return {
                enabled: true,
                quota_consumption_enabled: false,
                updated_at: '2026-05-22T00:00:00.000Z',
            };
        },
    });
    const service = new SubscriptionService({
        subscriptionRepository: repository,
        userLookup: async () => null,
    });

    const result = await service.resolveUsageAccess({
        username: 'alice',
        externalModelName: 'gpt-5.5',
        requestId: '44444444-4444-4444-8444-444444444444',
    });

    assert.equal(result.mode, 'subscription');
    assert.equal(result.quotaReservation, undefined);
    assert.equal(result.appliedLimit.quotaConsumptionEnabled, false);
    assert.equal(result.appliedLimit.remainingToday, null);
    assert.equal(
        repository.calls.some((call) => call.method === 'reserveDailyUsage'),
        false
    );
});
