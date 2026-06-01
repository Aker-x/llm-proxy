const { createHttpError } = require('../../utils/http-error');

function ensureJsonObjectBody(body, { requiredArrayField } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw createHttpError(400, 'Request body must be a JSON object.');
    }

    if (requiredArrayField && !Array.isArray(body[requiredArrayField])) {
        throw createHttpError(400, `Request body must include a ${requiredArrayField} array.`);
    }
}

function stripInternalRoutingFields(body = {}) {
    const sanitizedBody = { ...body };
    delete sanitizedBody.routeId;
    delete sanitizedBody.providerId;
    delete sanitizedBody.modelId;
    return sanitizedBody;
}

function summarizeText(value, maxLength = 400) {
    const normalizedValue = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalizedValue) {
        return '(empty)';
    }

    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }

    return `${normalizedValue.slice(0, maxLength)}...`;
}

function createTargetUrl(apiBaseUrl, endpointPath) {
    const normalizedBaseUrl = new URL(apiBaseUrl);
    return new URL(
        `${normalizedBaseUrl.pathname.replace(/\/$/, '')}/${endpointPath.replace(/^\/+/, '')}`,
        normalizedBaseUrl
    );
}

module.exports = {
    createTargetUrl,
    ensureJsonObjectBody,
    stripInternalRoutingFields,
    summarizeText,
};
