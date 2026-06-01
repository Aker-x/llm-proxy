const crypto = require('crypto');

const API_KEY_HASH_PREFIX = 'sha256:';

function generateApiKeyValue() {
    return `lpk_${crypto.randomBytes(24).toString('hex')}`;
}

function hashApiKey(apiKey) {
    const normalized = String(apiKey || '').trim();
    if (!normalized) {
        return '';
    }
    return API_KEY_HASH_PREFIX + crypto.createHash('sha256').update(normalized).digest('hex');
}

function maskStoredApiKey(record) {
    const key = String(record?.key || '').trim();
    if (!key) {
        return '';
    }

    if (key.length <= 12) {
        return `${key.slice(0, 4)}...`;
    }

    return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

module.exports = {
    generateApiKeyValue,
    hashApiKey,
    maskStoredApiKey,
};
