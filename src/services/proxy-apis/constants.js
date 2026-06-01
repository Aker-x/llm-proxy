const PROXY_API_IDS = {
    CHAT_COMPLETIONS: 'chat_completions',
    RESPONSES: 'responses',
    RESPONSES_COMPACT: 'responses_compact',
    MESSAGES: 'messages',
};

const UPSTREAM_API_IDS = [
    PROXY_API_IDS.CHAT_COMPLETIONS,
    PROXY_API_IDS.RESPONSES,
    PROXY_API_IDS.MESSAGES,
];

function normalizeUpstreamApi(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (!normalized) {
        return PROXY_API_IDS.CHAT_COMPLETIONS;
    }

    if ([
        'chat',
        'chat_completion',
        'chat_completions',
        'openai_chat',
        'openai-chat',
    ].includes(normalized)) {
        return PROXY_API_IDS.CHAT_COMPLETIONS;
    }

    if ([
        'response',
        'responses',
        'responses_compact',
        'responses-compact',
        'openai_responses',
        'openai-responses',
    ].includes(normalized)) {
        return PROXY_API_IDS.RESPONSES;
    }

    if ([
        'message',
        'messages',
        'anthropic',
        'anthropic_messages',
        'anthropic-messages',
    ].includes(normalized)) {
        return PROXY_API_IDS.MESSAGES;
    }

    return '';
}

function getApiLabel(apiId) {
    switch (apiId) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return 'OpenAI Chat Completions';
    case PROXY_API_IDS.RESPONSES:
        return 'OpenAI Responses';
    case PROXY_API_IDS.RESPONSES_COMPACT:
        return 'OpenAI Responses Compact';
    case PROXY_API_IDS.MESSAGES:
        return 'Anthropic Messages';
    default:
        return apiId;
    }
}

module.exports = {
    PROXY_API_IDS,
    UPSTREAM_API_IDS,
    normalizeUpstreamApi,
    getApiLabel,
};
