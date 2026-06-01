const { Pool } = require('pg');
const { getPostgresConfig } = require('../config/infrastructure');

let defaultPool = null;

function buildPoolOptions(config = {}) {
    if (config.connectionString) {
        return {
            connectionString: config.connectionString,
            max: config.max,
            idleTimeoutMillis: config.idleTimeoutMillis,
            connectionTimeoutMillis: config.connectionTimeoutMillis,
            ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        };
    }

    return {
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        max: config.max,
        idleTimeoutMillis: config.idleTimeoutMillis,
        connectionTimeoutMillis: config.connectionTimeoutMillis,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    };
}

function createPgPool(overrides = {}) {
    const config = {
        ...getPostgresConfig(),
        ...overrides,
    };
    const pool = new Pool(buildPoolOptions(config));

    pool.on('error', (error) => {
        console.error(`[pg] Unexpected pool error: ${error.stack || error.message}`);
    });

    return pool;
}

function getDefaultPgPool() {
    if (!defaultPool) {
        defaultPool = createPgPool();
    }

    return defaultPool;
}

async function closeDefaultPgPool() {
    if (!defaultPool) {
        return;
    }

    const pool = defaultPool;
    defaultPool = null;
    await pool.end();
}

module.exports = {
    closeDefaultPgPool,
    createPgPool,
    getDefaultPgPool,
};
