const {
    createTargetUrl,
    ensureJsonObjectBody,
    stripInternalRoutingFields,
} = require('./shared');
const { extractChatCompletionMetadata } = require('./usage-parsers');

const chatCompletionsApi = {
    id: 'chat_completions',
    label: 'chat completion',
    prepareRequest({ body, provider, model, requestId }) {
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

        if (sanitizedBody.stream === true) {
            sanitizedBody.stream_options = {
                ...(sanitizedBody.stream_options && typeof sanitizedBody.stream_options === 'object'
                    ? sanitizedBody.stream_options
                    : {}),
                include_usage: sanitizedBody.stream_options?.include_usage !== false,
            };
        }

        return {
            sanitizedBody,
            requestInit: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${provider.apiKey}`,
                },
                body: JSON.stringify(sanitizedBody),
            },
            targetUrl: createTargetUrl(provider.apiBaseUrl, 'chat/completions'),
            requestSummary: {
                stream: sanitizedBody.stream === true,
                messageCount: Array.isArray(sanitizedBody.messages) ? sanitizedBody.messages.length : 0,
            },
        };
    },
    extractResponseMetadata: extractChatCompletionMetadata,
};

module.exports = {
    chatCompletionsApi,
};
