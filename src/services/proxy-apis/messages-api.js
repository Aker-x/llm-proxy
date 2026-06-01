const {
    createTargetUrl,
    ensureJsonObjectBody,
    stripInternalRoutingFields,
} = require('./shared');
const { extractMessagesMetadata } = require('./usage-parsers');

const ANTHROPIC_VERSION = '2023-06-01';
const CLAUDE_CODE_BETA = 'claude-code-20250219';

function buildAnthropicBetaHeader(clientHeaders = {}) {
    const rawValue = String(clientHeaders['anthropic-beta'] || '').trim();
    if (!rawValue) {
        return CLAUDE_CODE_BETA;
    }

    if (rawValue.split(',').map((item) => item.trim()).includes(CLAUDE_CODE_BETA)) {
        return rawValue;
    }

    return `${CLAUDE_CODE_BETA}, ${rawValue}`;
}

function getClientUserAgent(clientHeaders = {}) {
    return String(clientHeaders['user-agent'] || '').trim();
}

const messagesApi = {
    id: 'messages',
    label: 'message',
    prepareRequest({ body, provider, model, requestId, clientHeaders = {} }) {
        ensureJsonObjectBody(body, { requiredArrayField: 'messages' });

        const sanitizedBody = stripInternalRoutingFields(body);
        sanitizedBody.model = model.upstreamModel;

        const requestedModel = String(body.model || '').trim();
        if (requestedModel && requestedModel !== model.upstreamModel && requestedModel !== model.name) {
            console.warn(
                `[${requestId}] Client model hint "${requestedModel}" `
                + `resolved to configured upstream model "${model.upstreamModel}" `
                + `provider=${provider.id} modelId=${model.id}`
            );
        }

        return {
            sanitizedBody,
            requestInit: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${provider.apiKey}`,
                    'x-api-key': provider.apiKey,
                    'anthropic-version': String(clientHeaders['anthropic-version'] || ANTHROPIC_VERSION),
                    'anthropic-beta': buildAnthropicBetaHeader(clientHeaders),
                    ...(getClientUserAgent(clientHeaders)
                        ? { 'User-Agent': getClientUserAgent(clientHeaders) }
                        : {}),
                },
                body: JSON.stringify(sanitizedBody),
            },
            targetUrl: createTargetUrl(provider.apiBaseUrl, 'messages'),
            requestSummary: {
                stream: sanitizedBody.stream === true,
                anthropicVersion: String(clientHeaders['anthropic-version'] || ANTHROPIC_VERSION),
                forwardedUserAgent: getClientUserAgent(clientHeaders) || null,
                messageCount: Array.isArray(sanitizedBody.messages) ? sanitizedBody.messages.length : 0,
            },
        };
    },
    extractResponseMetadata: extractMessagesMetadata,
};

module.exports = {
    messagesApi,
};
