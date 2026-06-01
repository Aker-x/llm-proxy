const SENSITIVE_HEADERS = new Set([
    'authorization',
    'x-api-key',
    'x-apikey',
    'cookie',
    'set-cookie',
    'x-real-ip',
    'x-forwarded-for',
]);

function sanitizeHeadersForLog(headers = {}) {
    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
        if (SENSITIVE_HEADERS.has(String(key).toLowerCase())) {
            sanitized[key] = '[redacted]';
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

module.exports = {
    sanitizeHeadersForLog,
};
