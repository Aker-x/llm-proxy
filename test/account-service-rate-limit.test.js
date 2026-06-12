const test = require('node:test');
const assert = require('node:assert/strict');

const { AccountService } = require('../src/services/account-service');
const { UpstreamRateLimitService } = require('../src/services/upstream-rate-limit-service');

function createAccountService({ users, globalRateLimitSettings }) {
    return new AccountService({
        adminRepository: {
            async listAll() {
                return [];
            },
            async getByUsername() {
                return null;
            },
        },
        userRepository: {
            async listAll() {
                return users;
            },
            async getByUsername() {
                return null;
            },
            async upsert() {
                return null;
            },
        },
        apiKeyRepository: {
            async listAll() {
                return [];
            },
        },
        rateLimitSettingsRepository: {
            async getById() {
                return globalRateLimitSettings;
            },
        },
    });
}

test('listAccounts applies the global rate-limit default when a user has no override', async () => {
    const accountService = createAccountService({
        users: [{
            username: 'alice',
            password: 'secret',
            balance_usd: 1,
            total_recharged_usd: 2,
            total_spent_usd: 0,
            subscription_status: 'inactive',
            subscription_plan_id: null,
            subscription_started_at: null,
            subscription_expires_at: null,
            upstream_rate_limit_enabled: false,
            upstream_rate_limit_requests_per_minute: 60,
            upstream_rate_limit_interval_seconds: 60,
            upstream_rate_limit_last_request_at: null,
        }],
        globalRateLimitSettings: {
            enabled: true,
            requests_per_minute: 30,
        },
    });

    const accounts = await accountService.listAccounts();
    const user = accounts.find((item) => item.username === 'alice');

    assert.equal(user.upstreamRateLimitEnabled, true);
    assert.equal(user.upstreamRateLimitRequestsPerMinute, 30);
    assert.equal(user.upstreamRateLimitSource, 'global');
});

test('listAccounts keeps a user override ahead of the global default', async () => {
    const accountService = createAccountService({
        users: [{
            username: 'bob',
            password: 'secret',
            balance_usd: 1,
            total_recharged_usd: 2,
            total_spent_usd: 0,
            subscription_status: 'inactive',
            subscription_plan_id: null,
            subscription_started_at: null,
            subscription_expires_at: null,
            upstream_rate_limit_enabled: true,
            upstream_rate_limit_requests_per_minute: 12,
            upstream_rate_limit_interval_seconds: 5,
            upstream_rate_limit_last_request_at: null,
        }],
        globalRateLimitSettings: {
            enabled: true,
            requests_per_minute: 30,
        },
    });

    const accounts = await accountService.listAccounts();
    const user = accounts.find((item) => item.username === 'bob');

    assert.equal(user.upstreamRateLimitEnabled, true);
    assert.equal(user.upstreamRateLimitRequestsPerMinute, 12);
    assert.equal(user.upstreamRateLimitSource, 'custom');
});

test('upstream rate-limit settings service saves the default global limit', async () => {
    const savedRows = [];
    const service = new UpstreamRateLimitService({
        rateLimitSettingsRepository: {
            async getById() {
                return {
                    enabled: true,
                    requests_per_minute: 60,
                    updated_at: '2026-06-12T00:00:00.000Z',
                };
            },
            async upsertDefault(config) {
                savedRows.push(config);
                return {
                    id: 'default',
                    enabled: config.enabled,
                    requests_per_minute: config.requestsPerMinute,
                    updated_at: '2026-06-12T00:01:00.000Z',
                };
            },
        },
    });

    const result = await service.updateAdminSettings({
        enabled: true,
        requestsPerMinute: 45,
    });

    assert.deepEqual(savedRows, [{ enabled: true, requestsPerMinute: 45 }]);
    assert.equal(result.enabled, true);
    assert.equal(result.requestsPerMinute, 45);
});
