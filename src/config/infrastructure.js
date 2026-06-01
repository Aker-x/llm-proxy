function toPositiveInteger(value, fallbackValue) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallbackValue;
    }

    return Math.floor(numericValue);
}

function toPositiveTimeout(value, fallbackValue) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return fallbackValue;
    }

    return Math.floor(numericValue);
}

function isTruthyFlag(value, fallbackValue = false) {
    if (value === undefined || value === null || value === '') {
        return fallbackValue;
    }

    const normalizedValue = String(value).trim().toLowerCase();
    return normalizedValue === '1'
        || normalizedValue === 'true'
        || normalizedValue === 'yes'
        || normalizedValue === 'on';
}

function getPostgresConfig() {
    return {
        connectionString: String(process.env.POSTGRES_URL || '').trim() || null,
        host: String(process.env.POSTGRES_HOST || '127.0.0.1').trim(),
        port: toPositiveInteger(process.env.POSTGRES_PORT, 5432),
        database: String(process.env.POSTGRES_DB || 'llm_delegate').trim(),
        user: String(process.env.POSTGRES_USER || 'postgres').trim(),
        password: String(process.env.POSTGRES_PASSWORD || '').trim(),
        max: toPositiveInteger(process.env.POSTGRES_POOL_MAX, 20),
        idleTimeoutMillis: toPositiveTimeout(process.env.POSTGRES_IDLE_TIMEOUT_MS, 30000),
        connectionTimeoutMillis: toPositiveTimeout(process.env.POSTGRES_CONNECT_TIMEOUT_MS, 10000),
        ssl: isTruthyFlag(process.env.POSTGRES_SSL, false),
    };
}

function getRedisConfig() {
    return {
        url: String(process.env.REDIS_URL || '').trim() || null,
        host: String(process.env.REDIS_HOST || '127.0.0.1').trim(),
        port: toPositiveInteger(process.env.REDIS_PORT, 6379),
        username: String(process.env.REDIS_USER || '').trim() || undefined,
        password: String(process.env.REDIS_PASSWORD || '').trim() || undefined,
        database: toPositiveInteger(process.env.REDIS_DB, 0),
        keyPrefix: String(process.env.REDIS_KEY_PREFIX || 'llm-delegate:').trim() || 'llm-delegate:',
    };
}

function getModelResolutionCacheConfig() {
    return {
        ttlMs: toPositiveTimeout(process.env.ROUTE_CONFIG_CACHE_TTL_MS, 5000),
    };
}

function getDataRetentionConfig() {
    const intervalHours = toPositiveTimeout(process.env.DATA_RETENTION_INTERVAL_HOURS, 24);

    return {
        enabled: isTruthyFlag(process.env.DATA_RETENTION_ENABLED, true),
        recentRequestsRetentionDays: toPositiveTimeout(process.env.DATA_RETENTION_RECENT_REQUESTS_DAYS, 90),
        statsEventsRetentionDays: toPositiveTimeout(process.env.DATA_RETENTION_STATS_EVENTS_DAYS, 90),
        completedReservationsRetentionDays: toPositiveTimeout(process.env.DATA_RETENTION_COMPLETED_RESERVATIONS_DAYS, 30),
        intervalMs: intervalHours > 0 ? intervalHours * 60 * 60 * 1000 : 0,
        runOnInstanceId: String(process.env.DATA_RETENTION_RUN_ON_INSTANCE || 'app-1').trim(),
    };
}

module.exports = {
    getDataRetentionConfig,
    getPostgresConfig,
    getRedisConfig,
    getModelResolutionCacheConfig,
};
