const { createBaseScopedStats, createEmptyUserSummary } = require('../schemas/stats-schema');

function toNumber(value, fallbackValue = 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}

function mapScopedRow(row = {}, extraFields = {}) {
    return {
        ...createBaseScopedStats(),
        requests: toNumber(row.requests),
        successRequests: toNumber(row.success_requests),
        failedRequests: toNumber(row.failed_requests),
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
        thinkingTokens: toNumber(row.thinking_tokens),
        cacheReadTokens: toNumber(row.cache_read_tokens),
        cacheCreationTokens: toNumber(row.cache_creation_tokens),
        totalCost: Number(toNumber(row.total_cost).toFixed(6)),
        lastUsedAt: row.last_used_at || null,
        ...extraFields,
    };
}

function mapRecentRequest(row = {}) {
    return {
        timestamp: row.created_at,
        username: row.username,
        providerId: row.provider_id,
        providerName: row.provider_name,
        modelId: row.model_id,
        modelName: row.model_name,
        success: Boolean(row.success),
        inputTokens: toNumber(row.input_tokens),
        outputTokens: toNumber(row.output_tokens),
        thinkingTokens: toNumber(row.thinking_tokens),
        cacheReadTokens: toNumber(row.cache_read_tokens),
        cacheCreationTokens: toNumber(row.cache_creation_tokens),
        totalCost: Number(toNumber(row.total_cost).toFixed(6)),
        currency: row.currency || 'USD',
        latencyMs: toNumber(row.latency_ms),
    };
}

function createEmptyUserModelUsage(username) {
    return {
        ...createEmptyUserSummary(username),
        models: [],
    };
}

function isAfter(left, right) {
    if (!left) {
        return false;
    }
    if (!right) {
        return true;
    }

    return new Date(left).getTime() > new Date(right).getTime();
}

function addScopedStats(target, source) {
    target.requests += source.requests;
    target.successRequests += source.successRequests;
    target.failedRequests += source.failedRequests;
    target.inputTokens += source.inputTokens;
    target.outputTokens += source.outputTokens;
    target.thinkingTokens += source.thinkingTokens;
    target.cacheReadTokens += source.cacheReadTokens;
    target.cacheCreationTokens += source.cacheCreationTokens;
    target.totalCost = Number((target.totalCost + source.totalCost).toFixed(6));
    target.currency = source.currency || target.currency || 'USD';
    if (isAfter(source.lastUsedAt, target.lastUsedAt)) {
        target.lastUsedAt = source.lastUsedAt;
    }
}

function buildUserModelUsage(rows = [], usernames = []) {
    const usageByUsername = new Map();

    for (const username of usernames.filter(Boolean)) {
        usageByUsername.set(username, createEmptyUserModelUsage(username));
    }

    for (const row of rows) {
        const username = row.username || '';
        if (!username) {
            continue;
        }
        if (!usageByUsername.has(username)) {
            usageByUsername.set(username, createEmptyUserModelUsage(username));
        }

        const modelStats = mapScopedRow(row, {
            modelId: row.model_id,
            modelName: row.model_name,
            currency: row.currency || 'USD',
        });
        const userStats = usageByUsername.get(username);

        userStats.models.push(modelStats);
        addScopedStats(userStats, modelStats);
    }

    return Array.from(usageByUsername.values())
        .map((item) => ({
            ...item,
            models: item.models.sort((a, b) => {
                if ((b.totalCost || 0) !== (a.totalCost || 0)) {
                    return (b.totalCost || 0) - (a.totalCost || 0);
                }
                if ((b.requests || 0) !== (a.requests || 0)) {
                    return (b.requests || 0) - (a.requests || 0);
                }
                return String(a.modelName || a.modelId || '').localeCompare(String(b.modelName || b.modelId || ''));
            }),
        }))
        .sort((a, b) => {
            if ((b.totalCost || 0) !== (a.totalCost || 0)) {
                return (b.totalCost || 0) - (a.totalCost || 0);
            }
            if ((b.requests || 0) !== (a.requests || 0)) {
                return (b.requests || 0) - (a.requests || 0);
            }
            return String(a.username || '').localeCompare(String(b.username || ''));
        });
}

class PgStatsService {
    constructor({ usageStatsRepository }) {
        this.usageStatsRepository = usageStatsRepository;
    }

    async getRecentRequests(limit = 50) {
        const recentRequestRows = await this.usageStatsRepository.getRecentRequests(null, limit);
        return recentRequestRows.map(mapRecentRequest);
    }

    async getAdminStats(usernames = []) {
        const [totalsRow, userRows, providerRows, recentRequestRows, userModelRows, todayUserModelRows] = await Promise.all([
            this.usageStatsRepository.getTotals(),
            this.usageStatsRepository.getUsers(),
            this.usageStatsRepository.getProviders(),
            this.usageStatsRepository.getRecentRequests(null, 50),
            this.usageStatsRepository.getUserModelUsage({ period: 'all' }),
            this.usageStatsRepository.getUserModelUsage({ period: 'today' }),
        ]);

        const usersByUsername = new Map(userRows.map((row) => ([
            row.username,
            {
                ...createEmptyUserSummary(row.username),
                ...mapScopedRow(row, {
                    username: row.username,
                    currency: row.currency || 'USD',
                }),
            },
        ])));

        const allUsernames = Array.from(new Set([
            ...usernames,
            ...Array.from(usersByUsername.keys()),
        ].filter(Boolean)));

        const userModelUsage = buildUserModelUsage(userModelRows, allUsernames);
        const todayUserModelUsage = buildUserModelUsage(todayUserModelRows, allUsernames);

        return {
            summary: {
                ...createBaseScopedStats(),
                requests: toNumber(totalsRow?.requests),
                successRequests: toNumber(totalsRow?.success_requests),
                failedRequests: toNumber(totalsRow?.failed_requests),
                inputTokens: toNumber(totalsRow?.input_tokens),
                outputTokens: toNumber(totalsRow?.output_tokens),
                thinkingTokens: toNumber(totalsRow?.thinking_tokens),
                cacheReadTokens: toNumber(totalsRow?.cache_read_tokens),
                cacheCreationTokens: toNumber(totalsRow?.cache_creation_tokens),
                totalCost: Number(toNumber(totalsRow?.total_cost).toFixed(6)),
                imageUnits: 0,
                currency: totalsRow?.currency || 'USD',
                lastUpdatedAt: totalsRow?.last_updated_at || null,
            },
            users: allUsernames
                .map((username) => usersByUsername.get(username) || createEmptyUserSummary(username))
                .sort((a, b) => {
                    if ((b.totalCost || 0) !== (a.totalCost || 0)) {
                        return (b.totalCost || 0) - (a.totalCost || 0);
                    }

                    return String(a.username || '').localeCompare(String(b.username || ''));
                }),
            providers: providerRows.map((row) => mapScopedRow(row, {
                providerId: row.provider_id,
                providerName: row.provider_name,
            })),
            userModelUsage,
            todayUserModelUsage,
            recentRequests: recentRequestRows.map(mapRecentRequest),
        };
    }

    async getUserStats(username) {
        const [userRows, recentRequestRows] = await Promise.all([
            this.usageStatsRepository.getUsers(),
            this.usageStatsRepository.getRecentRequests(username, 20),
        ]);

        const userRow = userRows.find((row) => row.username === username) || null;
        return {
            summary: userRow
                ? {
                    ...createEmptyUserSummary(username),
                    ...mapScopedRow(userRow, {
                        username,
                        currency: userRow.currency || 'USD',
                    }),
                }
                : createEmptyUserSummary(username),
            recentRequests: recentRequestRows.map(mapRecentRequest),
        };
    }

    async deleteUserStats(username) {
        await this.usageStatsRepository.deleteUserStats(username);
    }

    async resetUserCost(username) {
        await this.usageStatsRepository.deleteUserStats(username);
        return createEmptyUserSummary(username);
    }

    async resetAllUserCosts(usernames = []) {
        await this.usageStatsRepository.deleteAllStats();
        return usernames.map((username) => createEmptyUserSummary(username));
    }

    async resetAllUsageStats() {
        await this.usageStatsRepository.deleteAllStats();
        return {
            totals: {
                ...createBaseScopedStats(),
                currency: 'USD',
                lastUpdatedAt: null,
            },
            byProvider: {},
            byUser: {},
            recentRequests: [],
        };
    }
}

module.exports = {
    PgStatsService,
};
