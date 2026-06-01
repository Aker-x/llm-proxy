const { createClient } = require('redis');
const { getRedisConfig } = require('../config/infrastructure');

let defaultClient = null;

function buildRedisClientOptions(config = {}) {
    if (config.url) {
        return {
            url: config.url,
        };
    }

    return {
        socket: {
            host: config.host,
            port: config.port,
        },
        username: config.username,
        password: config.password,
        database: config.database,
    };
}

function createRedisClientInstance(overrides = {}) {
    const config = {
        ...getRedisConfig(),
        ...overrides,
    };
    const client = createClient(buildRedisClientOptions(config));

    client.on('error', (error) => {
        console.error(`[redis] Client error: ${error.stack || error.message}`);
    });

    client.keyPrefix = config.keyPrefix;
    return client;
}

async function connectRedisClient(client) {
    if (!client.isOpen) {
        await client.connect();
    }

    return client;
}

function getDefaultRedisClient() {
    if (!defaultClient) {
        defaultClient = createRedisClientInstance();
    }

    return defaultClient;
}

async function closeDefaultRedisClient() {
    if (!defaultClient) {
        return;
    }

    const client = defaultClient;
    defaultClient = null;
    if (client.isOpen) {
        await client.quit();
    }
}

module.exports = {
    closeDefaultRedisClient,
    connectRedisClient,
    createRedisClientInstance,
    getDefaultRedisClient,
};
