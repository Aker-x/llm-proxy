const {
    createTargetUrl,
    ensureJsonObjectBody,
    stripInternalRoutingFields,
} = require('./shared');
const { extractResponsesMetadata } = require('./usage-parsers');

function normalizeBuiltinResponseToolType(toolType) {
    switch (String(toolType || '').trim()) {
    case 'web_search_preview':
    case 'web_search_preview_2025_03_11':
        return 'web_search';
    default:
        return '';
    }
}

function normalizeResponsesBuiltinTools(body = {}) {
    if (Array.isArray(body.tools)) {
        body.tools = body.tools.map((tool) => {
            if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
                return tool;
            }

            const normalizedType = normalizeBuiltinResponseToolType(tool.type);
            return normalizedType ? { ...tool, type: normalizedType } : tool;
        });
    }

    if (!body.tool_choice || typeof body.tool_choice !== 'object' || Array.isArray(body.tool_choice)) {
        return body;
    }

    const normalizedChoiceType = normalizeBuiltinResponseToolType(body.tool_choice.type);
    if (normalizedChoiceType) {
        body.tool_choice = {
            ...body.tool_choice,
            type: normalizedChoiceType,
        };
    }

    if (Array.isArray(body.tool_choice.tools)) {
        body.tool_choice = {
            ...body.tool_choice,
            tools: body.tool_choice.tools.map((tool) => {
                if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
                    return tool;
                }

                const normalizedType = normalizeBuiltinResponseToolType(tool.type);
                return normalizedType ? { ...tool, type: normalizedType } : tool;
            }),
        };
    }

    return body;
}

const responsesApi = {
    id: 'responses',
    label: 'response',
    prepareRequest({ body, provider, model, requestId, endpointPath = 'responses' }) {
        ensureJsonObjectBody(body);

        const sanitizedBody = stripInternalRoutingFields(body);
        sanitizedBody.model = model.upstreamModel;
        normalizeResponsesBuiltinTools(sanitizedBody);

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
                },
                body: JSON.stringify(sanitizedBody),
            },
            targetUrl: createTargetUrl(provider.apiBaseUrl, endpointPath),
            requestSummary: {
                stream: sanitizedBody.stream === true,
                endpointPath,
                inputType: Array.isArray(sanitizedBody.input) ? 'array' : typeof sanitizedBody.input,
            },
        };
    },
    extractResponseMetadata: extractResponsesMetadata,
};

module.exports = {
    normalizeResponsesBuiltinTools,
    responsesApi,
};
