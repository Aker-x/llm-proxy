const { Readable } = require('stream');
const contentType = require('content-type');
const { sanitizeHeadersForLog } = require('../utils/sanitize');

function appendExposeHeaders(res, headerNames = []) {
    const currentValue = String(res.getHeader('Access-Control-Expose-Headers') || '').trim();
    const currentHeaders = currentValue
        ? currentValue.split(',').map((item) => item.trim()).filter(Boolean)
        : [];
    const nextHeaders = Array.from(new Set([
        ...currentHeaders,
        ...headerNames,
    ]));

    if (nextHeaders.length > 0) {
        res.setHeader('Access-Control-Expose-Headers', nextHeaders.join(', '));
    }
}

function applyProxyHeaders(res, proxyHeaders = {}) {
    const headerNames = [];

    for (const [name, value] of Object.entries(proxyHeaders)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }

        res.setHeader(name, String(value));
        headerNames.push(name);
    }

    appendExposeHeaders(res, headerNames);
}

function resolveSafeContentType(value, fallbackValue) {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
        return fallbackValue;
    }

    try {
        return contentType.format(contentType.parse(normalizedValue));
    } catch {
        return fallbackValue;
    }
}

function sendProxyResult(res, result) {
    applyProxyHeaders(res, result.proxyHeaders);

    if (result.type === 'json') {
        return res.status(result.status).json(result.payload);
    }

    if (result.type === 'stream') {
        res.status(result.status);
        res.setHeader('Content-Type', resolveSafeContentType(result.contentType, 'text/event-stream; charset=utf-8'));
        Readable.fromWeb(result.stream).pipe(res);
        return result.completion;
    }

    res.status(result.status);
    res.setHeader('Content-Type', resolveSafeContentType(result.contentType, 'text/plain; charset=utf-8'));
    return res.send(result.payload);
}

function createProxyController({ proxyService }) {
    return {
        async getModels(req, res) {
            res.json(await proxyService.listModels({
                limit: req.query?.limit,
                afterId: String(req.query?.after_id || '').trim(),
                beforeId: String(req.query?.before_id || '').trim(),
            }));
        },

        async getModel(req, res) {
            res.json(await proxyService.getModel(req.params.modelId));
        },

        async countMessageTokens(req, res) {
            res.json(await proxyService.countMessageTokens(req.body));
        },

        async createChatCompletion(req, res) {
            const result = await proxyService.forwardRequest({
                apiId: 'chat_completions',
                body: req.body,
                username: req.currentSession.username,
                requestId: req.requestId,
                clientIp: req.clientIp,
                clientHeaders: sanitizeHeadersForLog(req.headers),
            });
            return sendProxyResult(res, result);
        },

        async createResponse(req, res) {
            const result = await proxyService.forwardRequest({
                apiId: 'responses',
                body: req.body,
                username: req.currentSession.username,
                requestId: req.requestId,
                clientIp: req.clientIp,
                clientHeaders: sanitizeHeadersForLog(req.headers),
            });
            return sendProxyResult(res, result);
        },

        async createResponseCompact(req, res) {
            const result = await proxyService.forwardRequest({
                apiId: 'responses_compact',
                body: req.body,
                username: req.currentSession.username,
                requestId: req.requestId,
                clientIp: req.clientIp,
                clientHeaders: sanitizeHeadersForLog(req.headers),
            });
            return sendProxyResult(res, result);
        },

        async createMessage(req, res) {
            const result = await proxyService.forwardRequest({
                apiId: 'messages',
                body: req.body,
                username: req.currentSession.username,
                requestId: req.requestId,
                clientIp: req.clientIp,
                clientHeaders: sanitizeHeadersForLog(req.headers),
            });
            return sendProxyResult(res, result);
        },
    };
}

module.exports = {
    createProxyController,
};
