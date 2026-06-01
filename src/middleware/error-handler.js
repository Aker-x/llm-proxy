const contentType = require('content-type');

function clearInvalidContentTypeHeader(res) {
    const existingContentType = String(res.getHeader('Content-Type') || '').trim();
    if (!existingContentType) {
        return;
    }

    try {
        contentType.parse(existingContentType);
    } catch {
        res.removeHeader('Content-Type');
    }
}

function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    const status = error.status || 500;
    const requestId = req.requestId || String(req.headers['x-request-id'] || '').trim() || 'n/a';
    res.setHeader('X-Proxy-Request-Id', requestId);
    if (status === 429 && Number.isFinite(Number(error.retryAfterSeconds))) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(Number(error.retryAfterSeconds)))));
    }

    if (status >= 500) {
        console.error(
            `[${requestId}] ${req.method} ${req.originalUrl} failed with status=${status}:`,
            error
        );
    } else {
        console.warn(
            `[${requestId}] ${req.method} ${req.originalUrl} rejected with status=${status} `
            + `error="${error.message || 'Unknown error'}"`
        );
    }

    clearInvalidContentTypeHeader(res);
    return res.status(status).json({
        error: error.message || 'Internal server error',
        requestId,
    });
}

module.exports = {
    errorHandler,
};
