const crypto = require('crypto');
const { sanitizeUserApiKey } = require('../schemas/config-schema');
const { generateApiKeyValue } = require('../utils/api-key');
const { createHttpError } = require('../utils/http-error');

function roundUsd(value) {
    const numericValue = Number(value || 0);
    return Number(numericValue.toFixed(6));
}

function normalizeRole(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    if (!normalizedRole) {
        return 'user';
    }

    if (normalizedRole === 'admin' || normalizedRole === 'user') {
        return normalizedRole;
    }

    throw createHttpError(400, 'Role must be admin or user.');
}

function assertValidUsername(username) {
    if (!username) {
        throw createHttpError(400, 'Username is required.');
    }

    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
        throw createHttpError(400, 'Username must be 3-32 chars and only contain letters, numbers, dot, underscore, or dash.');
    }
}

function assertValidPassword(password) {
    if (String(password || '').length < 6) {
        throw createHttpError(400, 'Password must be at least 6 characters.');
    }
}

function normalizeRateLimitIntervalSeconds(value, fallbackValue = 60) {
    const numericValue = Number(value ?? fallbackValue);
    if (!Number.isFinite(numericValue) || numericValue < 1 || !Number.isInteger(numericValue)) {
        throw createHttpError(400, 'Rate limit interval must be a positive integer number of seconds.');
    }

    const intervalSeconds = numericValue;
    if (intervalSeconds > 86400) {
        throw createHttpError(400, 'Rate limit interval cannot exceed 86400 seconds.');
    }

    return intervalSeconds;
}

function mapUserApiKeyRow(row = {}) {
    return sanitizeUserApiKey({
        id: row.id,
        name: row.name,
        key: row.api_key,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at || '',
    });
}

class AccountService {
    constructor({
        adminRepository,
        userRepository,
        apiKeyRepository,
    }) {
        this.adminRepository = adminRepository;
        this.userRepository = userRepository;
        this.apiKeyRepository = apiKeyRepository;
    }

    async getAdminByUsername(username) {
        return this.adminRepository.getByUsername(String(username || '').trim());
    }

    async getUserByUsername(username) {
        return this.userRepository.getByUsername(String(username || '').trim());
    }

    async getAccountByUsername(username) {
        const normalizedUsername = String(username || '').trim();
        if (!normalizedUsername) {
            return null;
        }

        const admin = await this.getAdminByUsername(normalizedUsername);
        if (admin) {
            return {
                role: 'admin',
                account: admin,
            };
        }

        const user = await this.getUserByUsername(normalizedUsername);
        if (user) {
            return {
                role: 'user',
                account: user,
            };
        }

        return null;
    }

    async listAccounts() {
        const [admins, users, apiKeys] = await Promise.all([
            this.adminRepository.listAll(),
            this.userRepository.listAll(),
            this.apiKeyRepository.listAll(),
        ]);

        const apiKeyCountByUsername = new Map();
        for (const apiKey of apiKeys) {
            apiKeyCountByUsername.set(
                apiKey.username,
                (apiKeyCountByUsername.get(apiKey.username) || 0) + 1
            );
        }

        return [
            ...admins.map((admin) => ({
                username: admin.username,
                role: 'admin',
                apiKeyCount: 0,
                balanceUsd: 0,
                totalRechargedUsd: 0,
                totalSpentUsd: 0,
            })),
            ...users.map((user) => ({
                username: user.username,
                role: 'user',
                apiKeyCount: apiKeyCountByUsername.get(user.username) || 0,
                balanceUsd: roundUsd(user.balance_usd),
                totalRechargedUsd: roundUsd(user.total_recharged_usd),
                totalSpentUsd: roundUsd(user.total_spent_usd),
                subscriptionStatus: String(user.subscription_status || 'inactive'),
                subscriptionPlanId: user.subscription_plan_id || null,
                subscriptionStartedAt: user.subscription_started_at || null,
                subscriptionExpiresAt: user.subscription_expires_at || null,
                upstreamRateLimitEnabled: user.upstream_rate_limit_enabled === true,
                upstreamRateLimitIntervalSeconds: Number(user.upstream_rate_limit_interval_seconds || 60),
                upstreamRateLimitLastRequestAt: user.upstream_rate_limit_last_request_at || null,
            })),
        ].sort((left, right) => {
            if (left.role !== right.role) {
                return left.role === 'admin' ? -1 : 1;
            }

            return String(left.username || '').localeCompare(String(right.username || ''));
        });
    }

    async getAllAccountUsernames() {
        const accounts = await this.listAccounts();
        return accounts.map((account) => account.username);
    }

    async createAccount(payload = {}) {
        const username = String(payload.username || '').trim();
        const password = String(payload.password || '');
        const role = normalizeRole(payload.role);
        const normalizedUsername = username.toLowerCase();

        assertValidUsername(username);
        assertValidPassword(password);

        const [admins, users] = await Promise.all([
            this.adminRepository.listAll(),
            this.userRepository.listAll(),
        ]);
        const accountExists = admins.some((admin) => String(admin.username || '').trim().toLowerCase() === normalizedUsername)
            || users.some((user) => String(user.username || '').trim().toLowerCase() === normalizedUsername);

        if (accountExists) {
            throw createHttpError(409, 'Username already exists.');
        }

        if (role === 'admin') {
            const account = await this.adminRepository.upsert({
                username,
                password,
            });
            return { role, account };
        }

        const account = await this.userRepository.upsert({
            username,
            password,
            balanceUsd: 0,
            totalRechargedUsd: 0,
            totalSpentUsd: 0,
            lastRechargedAt: null,
            subscriptionStatus: 'inactive',
            subscriptionPlanId: null,
            subscriptionStartedAt: null,
            subscriptionExpiresAt: null,
            upstreamRateLimitEnabled: false,
            upstreamRateLimitIntervalSeconds: 60,
            upstreamRateLimitLastRequestAt: null,
        });
        return { role, account };
    }

    async createUser(payload = {}) {
        const result = await this.createAccount({
            ...payload,
            role: 'user',
        });
        return result.account;
    }

    async updateAccountPassword(username, payload = {}) {
        const current = await this.getAccountByUsername(username);
        if (!current) {
            throw createHttpError(404, 'Account not found.');
        }

        const password = String(payload.password || '');
        assertValidPassword(password);

        if (current.role === 'admin') {
            const account = await this.adminRepository.upsert({
                username: current.account.username,
                password,
            });
            return { role: 'admin', account };
        }

        const account = await this.userRepository.upsert({
            username: current.account.username,
            password,
            balanceUsd: current.account.balance_usd,
            totalRechargedUsd: current.account.total_recharged_usd,
            totalSpentUsd: current.account.total_spent_usd,
            lastRechargedAt: current.account.last_recharged_at,
            subscriptionStatus: current.account.subscription_status || 'inactive',
            subscriptionPlanId: current.account.subscription_plan_id || null,
            subscriptionStartedAt: current.account.subscription_started_at || null,
            subscriptionExpiresAt: current.account.subscription_expires_at || null,
            upstreamRateLimitEnabled: current.account.upstream_rate_limit_enabled === true,
            upstreamRateLimitIntervalSeconds: Number(current.account.upstream_rate_limit_interval_seconds || 60),
            upstreamRateLimitLastRequestAt: current.account.upstream_rate_limit_last_request_at || null,
        });
        return { role: 'user', account };
    }

    async updateUserRateLimit(username, payload = {}) {
        const current = await this.getAccountByUsername(username);
        if (!current) {
            throw createHttpError(404, 'Account not found.');
        }

        if (current.role !== 'user') {
            throw createHttpError(400, 'Rate limiting can only be configured for user accounts.');
        }

        const enabled = payload.enabled === true
            || String(payload.enabled || '').trim().toLowerCase() === 'true';
        const rawIntervalSeconds = !enabled && Number(payload.intervalSeconds || 0) <= 0
            ? current.account.upstream_rate_limit_interval_seconds || 60
            : payload.intervalSeconds;
        const intervalSeconds = normalizeRateLimitIntervalSeconds(
            rawIntervalSeconds,
            current.account.upstream_rate_limit_interval_seconds || 60
        );

        const account = await this.userRepository.updateRateLimitSettings(
            current.account.username,
            {
                enabled,
                intervalSeconds,
            }
        );

        return { role: 'user', account };
    }

    async updateUserOwnPassword(username, payload = {}) {
        const user = await this.getUserByUsername(String(username || '').trim());
        if (!user) {
            throw createHttpError(404, 'User not found.');
        }

        const currentPassword = String(payload.currentPassword || '');
        if (!currentPassword) {
            throw createHttpError(400, 'Current password is required.');
        }

        if (currentPassword !== user.password) {
            throw createHttpError(403, 'Current password is incorrect.');
        }

        return this.updateAccountPassword(user.username, {
            password: payload.password,
        });
    }

    async deleteAccount(username) {
        const current = await this.getAccountByUsername(username);
        if (!current) {
            throw createHttpError(404, 'Account not found.');
        }

        if (current.role === 'admin') {
            const adminCount = await this.adminRepository.count();
            if (adminCount <= 1) {
                throw createHttpError(400, 'At least one admin account must remain.');
            }

            await this.adminRepository.deleteByUsername(current.account.username);
            return current;
        }

        await this.apiKeyRepository.deleteByUsername(current.account.username);
        await this.userRepository.deleteByUsername(current.account.username);
        return current;
    }

    async listUserApiKeys(username) {
        const user = await this.getUserByUsername(username);
        if (!user) {
            throw createHttpError(404, 'User not found.');
        }

        const rows = await this.apiKeyRepository.listByUsername(user.username);
        return rows.map(mapUserApiKeyRow);
    }

    async createUserApiKey(username, payload = {}) {
        const user = await this.getUserByUsername(username);
        if (!user) {
            throw createHttpError(404, 'User not found.');
        }

        const existingApiKeys = await this.apiKeyRepository.listByUsername(user.username);
        const secret = generateApiKeyValue();
        const apiKeyRecord = await this.apiKeyRepository.upsert({
            id: crypto.randomUUID(),
            username: user.username,
            name: String(payload.name || '').trim() || `API Key ${existingApiKeys.length + 1}`,
            apiKey: secret,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
        });

        return {
            apiKey: mapUserApiKeyRow(apiKeyRecord),
            secret,
        };
    }

    async deleteUserApiKey(username, keyId) {
        const rows = await this.apiKeyRepository.listByUsername(String(username || '').trim());
        const apiKey = rows.find((item) => item.id === keyId);
        if (!apiKey) {
            throw createHttpError(404, 'API key not found.');
        }

        await this.apiKeyRepository.deleteById(apiKey.id);
    }
}

module.exports = {
    AccountService,
};
