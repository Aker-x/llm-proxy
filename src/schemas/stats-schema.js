function createBaseScopedStats() {
    return {
        requests: 0,
        successRequests: 0,
        failedRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        imageUnits: 0,
        totalCost: 0,
        lastUsedAt: null,
    };
}

function createInitialStats() {
    return {
        totals: {
            requests: 0,
            successRequests: 0,
            failedRequests: 0,
            inputTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            imageUnits: 0,
            totalCost: 0,
            currency: 'USD',
            lastUpdatedAt: null,
        },
        byProvider: {},
        byUser: {},
        recentRequests: [],
    };
}

function normalizeStatsMapEntries(statsMap, createExtraFields) {
    return Object.fromEntries(
        Object.entries(statsMap || {}).map(([key, value]) => ([
            key,
            {
                ...createBaseScopedStats(),
                ...createExtraFields(value || {}),
                ...(value || {}),
            },
        ]))
    );
}

function normalizeStats(savedStats) {
    const initialStats = createInitialStats();

    return {
        ...initialStats,
        ...savedStats,
        totals: {
            ...initialStats.totals,
            ...(savedStats.totals || {}),
        },
        byProvider: normalizeStatsMapEntries(savedStats.byProvider, (value) => ({
            providerId: value.providerId || '',
            providerName: value.providerName || '',
        })),
        byUser: normalizeStatsMapEntries(savedStats.byUser, (value) => ({
            username: value.username || '',
            currency: value.currency || 'USD',
        })),
        recentRequests: Array.isArray(savedStats.recentRequests) ? savedStats.recentRequests : [],
    };
}

function createEmptyUserSummary(username) {
    return {
        username,
        requests: 0,
        successRequests: 0,
        failedRequests: 0,
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        imageUnits: 0,
        totalCost: 0,
        currency: 'USD',
        lastUsedAt: null,
    };
}

module.exports = {
    createBaseScopedStats,
    createEmptyUserSummary,
    createInitialStats,
    normalizeStats,
};
