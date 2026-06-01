function normalizeProviderId(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeStoredId(value) {
    return String(value || '').trim();
}

function normalizeModelId(value) {
    return String(value || '').trim();
}

function normalizeCurrency(value) {
    return String(value || 'USD').trim().toUpperCase() || 'USD';
}

function toNonNegativeNumber(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return parsed;
}

function maskApiKey(apiKey) {
    if (!apiKey) {
        return '';
    }

    if (apiKey.length <= 8) {
        return '*'.repeat(apiKey.length);
    }

    return `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

module.exports = {
    maskApiKey,
    normalizeCurrency,
    normalizeModelId,
    normalizeProviderId,
    normalizeStoredId,
    toNonNegativeNumber,
};
