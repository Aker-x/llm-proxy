const { createHttpError } = require('../../utils/http-error');
const { toNonNegativeNumber } = require('../../utils/normalizers');
const { PROXY_API_IDS } = require('./constants');

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getBaseApiId(apiId) {
    return apiId === PROXY_API_IDS.RESPONSES_COMPACT ? PROXY_API_IDS.RESPONSES : apiId;
}

function stringifyValue(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null || value === undefined) {
        return '';
    }

    if (Array.isArray(value)) {
        return value.map((item) => stringifyValue(item)).filter(Boolean).join('\n');
    }

    if (isPlainObject(value)) {
        if (typeof value.text === 'string') {
            return value.text;
        }

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    return String(value);
}

function parseMaybeJson(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function normalizeReasoningConfig(value) {
    if (typeof value === 'string' && value.trim()) {
        return { effort: value.trim() };
    }

    if (isPlainObject(value)) {
        return cloneValue(value);
    }

    return undefined;
}

function getReasoningEffort(reasoning) {
    return String(reasoning?.effort || '').trim().toLowerCase();
}

function isSystemLikeRole(role) {
    const normalizedRole = String(role || '').trim().toLowerCase();
    return normalizedRole === 'system' || normalizedRole === 'developer';
}

function isResponsesToolCallType(itemType) {
    const normalizedType = String(itemType || '').trim();
    return normalizedType === 'function_call' || normalizedType === 'custom_tool_call';
}

function isResponsesToolCallOutputType(itemType) {
    const normalizedType = String(itemType || '').trim();
    return normalizedType === 'function_call_output' || normalizedType === 'custom_tool_call_output';
}

function isGptFiveModel(modelName) {
    return /^gpt-5(?:[.-]|$)/.test(String(modelName || '').trim().toLowerCase());
}

function shouldStripSamplingControlsForResponses(normalized) {
    if (normalized.sourceApiId !== PROXY_API_IDS.MESSAGES) {
        return false;
    }

    if (!isGptFiveModel(normalized.model)) {
        return false;
    }

    if (normalized.temperature === undefined && normalized.topP === undefined) {
        return false;
    }

    return getReasoningEffort(normalized.reasoning) !== 'none';
}

function ensureConvertibleResponseTool(tool) {
    const type = String(tool?.type || 'function').trim();
    if (type === 'function' || (!tool?.type && tool?.name)) {
        return true;
    }

    return false;
}

function ensureAnthropicImageSource(imageUrl) {
    const value = String(imageUrl || '').trim();
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        throw createHttpError(
            400,
            'Anthropic Messages conversion requires base64 data URLs for images.'
        );
    }

    return {
        type: 'base64',
        media_type: match[1],
        data: match[2],
    };
}

function toTextBlocks(value) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => toTextBlocks(item));
    }

    const text = stringifyValue(value).trim();
    return text ? [{ type: 'text', text }] : [];
}

function mapOpenAiContentParts(parts = []) {
    return parts.flatMap((part) => {
        if (typeof part === 'string') {
            return toTextBlocks(part);
        }

        if (!isPlainObject(part)) {
            return toTextBlocks(part);
        }

        const partType = String(part.type || '').trim();
        if (partType === 'text' || partType === 'input_text' || partType === 'output_text') {
            return toTextBlocks(part.text);
        }

        if (partType === 'image_url') {
            const url = typeof part.image_url === 'string'
                ? part.image_url
                : part.image_url?.url;
            return url ? [{ type: 'image', imageUrl: url }] : [];
        }

        if (partType === 'input_image') {
            return part.image_url ? [{ type: 'image', imageUrl: part.image_url }] : [];
        }

        if (partType === 'refusal') {
            return toTextBlocks(part.refusal);
        }

        return [];
    });
}

function mapAnthropicContentBlocks(blocks = []) {
    return blocks.flatMap((block) => {
        if (typeof block === 'string') {
            return toTextBlocks(block);
        }

        if (!isPlainObject(block)) {
            return toTextBlocks(block);
        }

        const blockType = String(block.type || '').trim();
        if (blockType === 'text') {
            return toTextBlocks(block.text);
        }

        if (blockType === 'image') {
            const source = block.source || {};
            if (source.type === 'base64' && source.media_type && source.data) {
                return [{
                    type: 'image',
                    imageUrl: `data:${source.media_type};base64,${source.data}`,
                }];
            }
            return [];
        }

        if (blockType === 'tool_use') {
            return [{
                type: 'tool_use',
                id: String(block.id || ''),
                name: String(block.name || ''),
                input: cloneValue(block.input) ?? {},
                extraContent: cloneValue(block.extra_content),
            }];
        }

        if (blockType === 'tool_result') {
            return [{
                type: 'tool_result',
                toolUseId: String(block.tool_use_id || ''),
                content: cloneValue(block.content),
            }];
        }

        if (blockType === 'thinking' || blockType === 'redacted_thinking') {
            const thinkingText = stringifyValue(block.thinking || block.text || block.data);
            return thinkingText ? [{ type: 'thinking', text: thinkingText }] : [];
        }

        return [];
    });
}

function mapResponsesContentBlocks(parts = [], role = 'user') {
    return parts.flatMap((part) => {
        if (!isPlainObject(part)) {
            return toTextBlocks(part);
        }

        const partType = String(part.type || '').trim();
        if (partType === 'input_text' || partType === 'output_text' || partType === 'text') {
            return toTextBlocks(part.text);
        }

        if (partType === 'refusal') {
            return toTextBlocks(part.refusal);
        }

        if (partType === 'input_image') {
            return part.image_url ? [{ type: 'image', imageUrl: part.image_url }] : [];
        }

        if (partType === 'image_url') {
            const url = typeof part.image_url === 'string'
                ? part.image_url
                : part.image_url?.url;
            return url ? [{ type: 'image', imageUrl: url }] : [];
        }

        if (partType === 'summary_text') {
            return role === 'assistant' ? [{ type: 'thinking', text: stringifyValue(part.text) }] : [];
        }

        return [];
    });
}

function normalizeResponseTools(tools = []) {
    return tools.map((tool) => {
        if (!ensureConvertibleResponseTool(tool)) {
            return null;
        }

        return {
            name: String(tool?.name || ''),
            description: String(tool?.description || ''),
            inputSchema: cloneValue(tool?.parameters) || {},
        };
    }).filter((tool) => tool?.name);
}

function normalizeResponsesToolCallInput(item = {}) {
    const rawInput = item.arguments ?? item.input;
    const parsedInput = parseMaybeJson(rawInput);
    return parsedInput === undefined ? {} : parsedInput;
}

function normalizeResponsesToolCallArguments(block = {}) {
    if (block.callType === 'custom_tool_call' && !isPlainObject(block.input)) {
        return { input: cloneValue(block.input) ?? '' };
    }

    return cloneValue(block.input) ?? {};
}

function normalizeAnthropicToolUseInput(block = {}) {
    if (isPlainObject(block.input)) {
        return cloneValue(block.input);
    }

    if (block.input === undefined) {
        return {};
    }

    return {
        input: cloneValue(block.input),
    };
}

function applyResponsesRequestMetadata(response, requestBody) {
    if (!isPlainObject(response) || !isPlainObject(requestBody)) {
        return response;
    }

    if (requestBody.max_tool_calls !== undefined) {
        const maxToolCalls = toNonNegativeNumber(requestBody.max_tool_calls);
        if (maxToolCalls > 0) {
            response.max_tool_calls = maxToolCalls;
        }
    }

    const previousResponseId = String(requestBody.previous_response_id || '').trim();
    if (previousResponseId) {
        response.previous_response_id = previousResponseId;
    }

    const promptCacheKey = String(requestBody.prompt_cache_key || '').trim();
    if (promptCacheKey) {
        response.prompt_cache_key = promptCacheKey;
    }

    return response;
}

function normalizeSystemBlocks(value) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => mapAnthropicContentBlocks([item]));
    }

    return toTextBlocks(value);
}

function normalizeRequestFromChat(body) {
    const normalized = {
        sourceApiId: PROXY_API_IDS.CHAT_COMPLETIONS,
        model: body.model,
        systemBlocks: [],
        messages: [],
        tools: Array.isArray(body.tools)
            ? body.tools.map((tool) => ({
                name: String(tool?.function?.name || ''),
                description: String(tool?.function?.description || ''),
                inputSchema: cloneValue(tool?.function?.parameters) || {},
            })).filter((tool) => tool.name)
            : [],
        toolChoice: cloneValue(body.tool_choice),
        maxTokens: body.max_tokens ?? body.max_completion_tokens,
        stream: body.stream === true,
        reasoning: normalizeReasoningConfig(body.reasoning ?? body.reasoning_effort),
        temperature: body.temperature,
        topP: body.top_p,
        stopSequences: Array.isArray(body.stop) ? cloneValue(body.stop) : (body.stop ? [body.stop] : []),
        parallelToolCalls: body.parallel_tool_calls,
    };

    for (const message of Array.isArray(body.messages) ? body.messages : []) {
        const role = String(message?.role || 'user').trim();
        if (isSystemLikeRole(role)) {
            normalized.systemBlocks.push(...mapOpenAiContentParts(
                Array.isArray(message.content) ? message.content : [message.content]
            ));
            continue;
        }

        if (role === 'tool') {
            normalized.messages.push({
                role: 'user',
                content: [{
                    type: 'tool_result',
                    toolUseId: String(message.tool_call_id || ''),
                    content: cloneValue(message.content),
                }],
            });
            continue;
        }

        const content = Array.isArray(message.content)
            ? mapOpenAiContentParts(message.content)
            : toTextBlocks(message.content);
            const toolUses = Array.isArray(message.tool_calls)
            ? message.tool_calls.map((toolCall) => ({
                type: 'tool_use',
                id: String(toolCall.id || ''),
                name: String(toolCall.function?.name || ''),
                input: parseMaybeJson(toolCall.function?.arguments) ?? {},
                extraContent: cloneValue(toolCall.extra_content),
            }))
            : [];

        normalized.messages.push({
            role: role === 'assistant' ? 'assistant' : 'user',
            content: [...content, ...toolUses],
        });
    }

    return normalized;
}

function normalizeRequestFromMessages(body) {
    const normalized = {
        sourceApiId: PROXY_API_IDS.MESSAGES,
        model: body.model,
        systemBlocks: normalizeSystemBlocks(body.system),
        messages: [],
        tools: Array.isArray(body.tools)
            ? body.tools.map((tool) => ({
                name: String(tool?.name || ''),
                description: String(tool?.description || ''),
                inputSchema: cloneValue(tool?.input_schema) || {},
            })).filter((tool) => tool.name)
            : [],
        toolChoice: cloneValue(body.tool_choice),
        maxTokens: body.max_tokens,
        stream: body.stream === true,
        reasoning: normalizeReasoningConfig(body.reasoning),
        temperature: body.temperature,
        topP: body.top_p,
        stopSequences: Array.isArray(body.stop_sequences) ? cloneValue(body.stop_sequences) : [],
        parallelToolCalls: undefined,
    };

    for (const message of Array.isArray(body.messages) ? body.messages : []) {
        normalized.messages.push({
            role: String(message?.role || 'user').trim() === 'assistant' ? 'assistant' : 'user',
            content: Array.isArray(message?.content)
                ? mapAnthropicContentBlocks(message.content)
                : toTextBlocks(message?.content),
        });
    }

    return normalized;
}

function normalizeRequestFromResponses(body) {
    const normalized = {
        sourceApiId: PROXY_API_IDS.RESPONSES,
        model: body.model,
        systemBlocks: toTextBlocks(body.instructions),
        messages: [],
        tools: Array.isArray(body.tools) ? normalizeResponseTools(body.tools) : [],
        toolChoice: cloneValue(body.tool_choice),
        maxTokens: body.max_output_tokens ?? body.max_completion_tokens,
        stream: body.stream === true,
        reasoning: normalizeReasoningConfig(body.reasoning),
        temperature: body.temperature,
        topP: body.top_p,
        stopSequences: [],
        parallelToolCalls: body.parallel_tool_calls,
    };

    const inputItems = typeof body.input === 'string'
        ? [{ role: 'user', content: [{ type: 'input_text', text: body.input }] }]
        : Array.isArray(body.input)
            ? body.input
            : (isPlainObject(body.input) ? [body.input] : []);

    for (const item of inputItems) {
        if (!isPlainObject(item)) {
            normalized.messages.push({
                role: 'user',
                content: toTextBlocks(item),
            });
            continue;
        }

        const itemType = String(item.type || '').trim();
        const role = String(item.role || 'user').trim();

        if (isResponsesToolCallType(itemType)) {
            normalized.messages.push({
                role: 'assistant',
                content: [{
                    type: 'tool_use',
                    id: String(item.call_id || ''),
                    name: String(item.name || ''),
                    input: normalizeResponsesToolCallInput(item),
                    callType: itemType,
                }],
            });
            continue;
        }

        if (isResponsesToolCallOutputType(itemType)) {
            normalized.messages.push({
                role: 'user',
                content: [{
                    type: 'tool_result',
                    toolUseId: String(item.call_id || ''),
                    content: cloneValue(item.output),
                    outputType: itemType,
                }],
            });
            continue;
        }

        if (
            (itemType === 'message' || !itemType)
            && isSystemLikeRole(role)
        ) {
            const content = Array.isArray(item.content)
                ? mapResponsesContentBlocks(item.content, role)
                : toTextBlocks(item.content);
            normalized.systemBlocks.push(...content.filter((block) => block.type === 'text'));
            continue;
        }

        if (itemType === 'reasoning') {
            const summaryText = Array.isArray(item.summary)
                ? item.summary
                    .map((summaryItem) => summaryItem?.text)
                    .filter(Boolean)
                    .join('')
                : stringifyValue(item.summary);

            if (summaryText) {
                normalized.messages.push({
                    role: 'assistant',
                    content: [{ type: 'thinking', text: summaryText }],
                });
            }
            continue;
        }

        const content = Array.isArray(item.content)
            ? mapResponsesContentBlocks(item.content, role)
            : toTextBlocks(item.content);
        normalized.messages.push({
            role: String(role).trim() === 'assistant' ? 'assistant' : 'user',
            content,
        });
    }

    return normalized;
}

function normalizeRequestBody(apiId, body) {
    switch (getBaseApiId(apiId)) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return normalizeRequestFromChat(body);
    case PROXY_API_IDS.RESPONSES:
        return normalizeRequestFromResponses(body);
    case PROXY_API_IDS.MESSAGES:
        return normalizeRequestFromMessages(body);
    default:
        throw createHttpError(500, `Unsupported request conversion source: ${apiId}`);
    }
}

function buildTextOnlyMessage(role, blocks = []) {
    const text = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    return text ? { role, content: text } : null;
}

function buildChatRequest(normalized) {
    const body = {
        model: normalized.model,
        messages: [],
    };

    const systemMessage = buildTextOnlyMessage('system', normalized.systemBlocks);
    if (systemMessage) {
        body.messages.push(systemMessage);
    }

    for (const message of normalized.messages) {
        if (message.role === 'assistant') {
            const content = message.content.filter((block) => block.type === 'text');
            const toolCalls = message.content
                .filter((block) => block.type === 'tool_use')
                .map((block, index) => ({
                    id: block.id || `call_${Date.now()}_${index}`,
                    type: 'function',
                    function: {
                        name: String(block.name || ''),
                        arguments: JSON.stringify(normalizeResponsesToolCallArguments(block)),
                    },
                    ...(block.extraContent ? { extra_content: cloneValue(block.extraContent) } : {}),
                }));

            body.messages.push({
                role: 'assistant',
                content: content.map((block) => block.text).join('\n') || null,
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            });
            continue;
        }

        const userBlocks = message.content.filter((block) => block.type === 'text' || block.type === 'image');
        const toolResults = message.content.filter((block) => block.type === 'tool_result');

        if (userBlocks.length > 0) {
            const hasImages = userBlocks.some((block) => block.type === 'image');
            body.messages.push({
                role: 'user',
                content: hasImages
                    ? userBlocks.map((block) => (
                        block.type === 'image'
                            ? { type: 'image_url', image_url: { url: block.imageUrl } }
                            : { type: 'text', text: block.text }
                    ))
                    : userBlocks.map((block) => block.text).join('\n'),
            });
        }

        for (const block of toolResults) {
            body.messages.push({
                role: 'tool',
                tool_call_id: String(block.toolUseId || ''),
                content: stringifyValue(block.content),
            });
        }
    }

    if (normalized.tools.length > 0) {
        body.tools = normalized.tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || '',
                parameters: cloneValue(tool.inputSchema) || {},
            },
        }));
    }

    const toolChoice = normalized.toolChoice;
    if (toolChoice !== undefined) {
        if (toolChoice === 'required') {
            body.tool_choice = 'required';
        } else if (toolChoice === 'auto' || toolChoice === 'none') {
            body.tool_choice = toolChoice;
        } else if (typeof toolChoice === 'string') {
            body.tool_choice = toolChoice;
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'any') {
            body.tool_choice = 'required';
        } else if (
            isPlainObject(toolChoice)
            && (toolChoice.type === 'auto' || toolChoice.type === 'none')
        ) {
            body.tool_choice = toolChoice.type;
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'function') {
            body.tool_choice = cloneValue(toolChoice);
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'tool') {
            body.tool_choice = {
                type: 'function',
                function: {
                    name: String(toolChoice.name || ''),
                },
            };
        }
    }

    if (normalized.maxTokens !== undefined) {
        body.max_tokens = normalized.maxTokens;
    }
    if (normalized.temperature !== undefined) {
        body.temperature = normalized.temperature;
    }
    if (normalized.topP !== undefined) {
        body.top_p = normalized.topP;
    }
    if (normalized.stopSequences?.length) {
        body.stop = normalized.stopSequences.length === 1
            ? normalized.stopSequences[0]
            : cloneValue(normalized.stopSequences);
    }
    if (normalized.parallelToolCalls !== undefined) {
        body.parallel_tool_calls = normalized.parallelToolCalls;
    }
    if (normalized.stream) {
        body.stream = true;
        body.stream_options = { include_usage: true };
    }

    return body;
}

function buildAnthropicSystem(normalized) {
    const blocks = normalized.systemBlocks
        .filter((block) => block.type === 'text')
        .map((block) => ({ type: 'text', text: block.text }));

    if (blocks.length === 0) {
        return undefined;
    }

    return blocks.length === 1 ? blocks[0].text : blocks;
}

function toAnthropicToolResultContentParts(value) {
    if (Array.isArray(value)) {
        return value.flatMap((item) => toAnthropicToolResultContentParts(item));
    }

    if (value === null || value === undefined) {
        return [];
    }

    if (typeof value === 'string') {
        return value.trim() ? [{ type: 'text', text: value }] : [];
    }

    if (!isPlainObject(value)) {
        return [{ type: 'text', text: String(value) }];
    }

    const partType = String(value.type || '').trim();
    if (partType === 'text' || partType === 'input_text' || partType === 'output_text') {
        const text = stringifyValue(value.text).trim();
        return text ? [{ type: 'text', text }] : [];
    }

    if (partType === 'image_url') {
        const url = typeof value.image_url === 'string'
            ? value.image_url
            : value.image_url?.url;
        return url ? [{ type: 'image', source: ensureAnthropicImageSource(url) }] : [];
    }

    if (partType === 'input_image') {
        return value.image_url
            ? [{ type: 'image', source: ensureAnthropicImageSource(value.image_url) }]
            : [];
    }

    if (partType === 'image' && isPlainObject(value.source)) {
        if (value.source.type === 'base64' && value.source.media_type && value.source.data) {
            return [{
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: String(value.source.media_type),
                    data: String(value.source.data),
                },
            }];
        }
    }

    if (typeof value.text === 'string') {
        const text = value.text.trim();
        return text ? [{ type: 'text', text }] : [];
    }

    return [{ type: 'text', text: stringifyValue(value) }];
}

function buildAnthropicToolResultContent(value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    const parts = toAnthropicToolResultContentParts(value);
    if (parts.length === 0) {
        return stringifyValue(value);
    }

    return parts.length === 1 && parts[0].type === 'text'
        ? parts[0].text
        : parts;
}

function buildMessagesRequest(normalized) {
    const body = {
        model: normalized.model,
        messages: [],
        max_tokens: normalized.maxTokens ?? 4096,
    };

    const system = buildAnthropicSystem(normalized);
    if (system !== undefined) {
        body.system = system;
    }

    for (const message of normalized.messages) {
        const content = [];
        for (const block of message.content) {
            if (block.type === 'text') {
                content.push({ type: 'text', text: block.text });
            } else if (block.type === 'image') {
                content.push({
                    type: 'image',
                    source: ensureAnthropicImageSource(block.imageUrl),
                });
            } else if (block.type === 'tool_use') {
                content.push({
                    type: 'tool_use',
                    id: String(block.id || ''),
                    name: String(block.name || ''),
                    input: normalizeAnthropicToolUseInput(block),
                    ...(block.extraContent ? { extra_content: cloneValue(block.extraContent) } : {}),
                });
            } else if (block.type === 'tool_result' && message.role === 'user') {
                content.push({
                    type: 'tool_result',
                    tool_use_id: String(block.toolUseId || ''),
                    content: buildAnthropicToolResultContent(block.content),
                });
            } else if (block.type === 'thinking') {
                content.push({
                    type: 'thinking',
                    thinking: block.text,
                });
            }
        }

        if (content.length > 0) {
            body.messages.push({
                role: message.role === 'assistant' ? 'assistant' : 'user',
                content,
            });
        }
    }

    if (normalized.tools.length > 0) {
        body.tools = normalized.tools.map((tool) => ({
            name: tool.name,
            description: tool.description || '',
            input_schema: cloneValue(tool.inputSchema) || {},
        }));
    }

    const toolChoice = normalized.toolChoice;
    if (toolChoice !== undefined) {
        if (toolChoice === 'required') {
            body.tool_choice = { type: 'any' };
        } else if (toolChoice === 'none' || toolChoice === 'auto') {
            body.tool_choice = { type: toolChoice };
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'function') {
            body.tool_choice = {
                type: 'tool',
                name: String(toolChoice.function?.name || ''),
            };
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'tool') {
            body.tool_choice = {
                type: 'tool',
                name: String(toolChoice.name || ''),
            };
        } else if (typeof toolChoice === 'string') {
            body.tool_choice = { type: toolChoice };
        }
    }

    if (normalized.temperature !== undefined) {
        body.temperature = normalized.temperature;
    }
    if (normalized.topP !== undefined) {
        body.top_p = normalized.topP;
    }
    if (normalized.stopSequences?.length) {
        body.stop_sequences = cloneValue(normalized.stopSequences);
    }
    if (normalized.stream) {
        body.stream = true;
    }

    return body;
}

function buildResponsesRequest(normalized) {
    const body = {
        model: normalized.model,
        input: [],
    };
    const stripSamplingControls = shouldStripSamplingControlsForResponses(normalized);

    const instructions = normalized.systemBlocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n');
    if (instructions) {
        body.instructions = instructions;
    }

    for (const message of normalized.messages) {
        const content = [];

        for (const block of message.content) {
            if (block.type === 'text') {
                content.push({
                    type: message.role === 'assistant' ? 'output_text' : 'input_text',
                    text: block.text,
                });
                continue;
            }

            if (block.type === 'image') {
                content.push({
                    type: 'input_image',
                    image_url: block.imageUrl,
                });
                continue;
            }

            if (block.type === 'tool_use') {
                if (content.length > 0) {
                    body.input.push({
                        type: 'message',
                        role: message.role,
                        content: content.splice(0, content.length),
                    });
                }

                if (block.callType === 'custom_tool_call') {
                    body.input.push({
                        type: 'custom_tool_call',
                        call_id: String(block.id || ''),
                        name: String(block.name || ''),
                        input: cloneValue(block.input) ?? '',
                    });
                } else {
                    body.input.push({
                        type: 'function_call',
                        call_id: String(block.id || ''),
                        name: String(block.name || ''),
                        arguments: JSON.stringify(block.input ?? {}),
                    });
                }
                continue;
            }

            if (block.type === 'tool_result') {
                if (content.length > 0) {
                    body.input.push({
                        type: 'message',
                        role: message.role,
                        content: content.splice(0, content.length),
                    });
                }

                body.input.push({
                    type: block.outputType === 'custom_tool_call_output'
                        ? 'custom_tool_call_output'
                        : 'function_call_output',
                    call_id: String(block.toolUseId || ''),
                    output: stringifyValue(block.content),
                });
            }
        }

        if (content.length > 0) {
            body.input.push({
                type: 'message',
                role: message.role,
                content,
            });
        }
    }

    if (normalized.tools.length > 0) {
        body.tools = normalized.tools.map((tool) => ({
            type: 'function',
            name: tool.name,
            description: tool.description || '',
            parameters: cloneValue(tool.inputSchema) || {},
        }));
    }

    const toolChoice = normalized.toolChoice;
    if (toolChoice !== undefined) {
        if (typeof toolChoice === 'string') {
            body.tool_choice = toolChoice === 'required' ? 'required' : toolChoice;
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'tool') {
            body.tool_choice = {
                type: 'function',
                name: String(toolChoice.name || ''),
            };
        } else if (isPlainObject(toolChoice) && toolChoice.type === 'function') {
            body.tool_choice = {
                type: 'function',
                name: String(toolChoice.function?.name || toolChoice.name || ''),
            };
        }
    }

    if (normalized.reasoning !== undefined) {
        body.reasoning = cloneValue(normalized.reasoning);
    }

    if (normalized.maxTokens !== undefined) {
        body.max_output_tokens = normalized.maxTokens;
    }
    if (!stripSamplingControls && normalized.temperature !== undefined) {
        body.temperature = normalized.temperature;
    }
    if (!stripSamplingControls && normalized.topP !== undefined) {
        body.top_p = normalized.topP;
    }
    if (normalized.parallelToolCalls !== undefined) {
        body.parallel_tool_calls = normalized.parallelToolCalls;
    }
    if (normalized.stream) {
        body.stream = true;
    }

    return body;
}

function convertRequestBody({ fromApiId, toApiId, body }) {
    const sourceApiId = getBaseApiId(fromApiId);
    const targetApiId = getBaseApiId(toApiId);

    if (sourceApiId === targetApiId) {
        return cloneValue(body);
    }

    const normalized = normalizeRequestBody(sourceApiId, body);

    switch (targetApiId) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return buildChatRequest(normalized);
    case PROXY_API_IDS.RESPONSES:
        return buildResponsesRequest(normalized);
    case PROXY_API_IDS.MESSAGES:
        return buildMessagesRequest(normalized);
    default:
        throw createHttpError(500, `Unsupported request conversion target: ${toApiId}`);
    }
}

function extractThinkingTokens(usage = {}) {
    return toNonNegativeNumber(
        // Claude Messages API: usage.details.thinking_tokens
        usage?.details?.thinking_tokens
        // Claude alternative path
        ?? usage?.output_tokens_details?.thinking_tokens
        // OpenAI o-series: usage.completion_tokens_details.reasoning_tokens
        ?? usage?.completion_tokens_details?.reasoning_tokens
        // OpenAI alternative reasoning path
        ?? usage?.output_tokens_details?.reasoning_tokens
        // Generic / flat field
        ?? usage?.reasoning_tokens
        // Anthropic extended usage
        ?? usage?.thinking_tokens
    );
}

function normalizeUsage(usage = {}) {
    const thinkingTokens = extractThinkingTokens(usage);
    return {
        input_tokens: Number(
            usage?.input_tokens
            ?? usage?.prompt_tokens
            ?? 0
        ) || 0,
        output_tokens: Number(
            usage?.output_tokens
            ?? usage?.completion_tokens
            ?? 0
        ) || 0,
        thinking_tokens: thinkingTokens,
        cache_read_input_tokens: Number(
            usage?.cache_read_input_tokens
            ?? usage?.cache_read_tokens
            ?? usage?.input_tokens_details?.cached_tokens
            ?? usage?.prompt_tokens_details?.cached_tokens
            ?? 0
        ) || 0,
        cache_creation_input_tokens: Number(
            usage?.cache_creation_input_tokens
            ?? usage?.cache_creation_tokens
            ?? usage?.input_tokens_details?.cache_write_tokens
            ?? usage?.prompt_tokens_details?.cache_write_tokens
            ?? 0
        ) || 0,
    };
}

function normalizeResponseFromChat(body) {
    const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
    const message = choice?.message || {};
    const contentBlocks = [];
    const reasoningContent = String(message?.reasoning_content || '').trim();

    if (reasoningContent) {
        contentBlocks.push({ type: 'thinking', text: reasoningContent });
    }

    if (Array.isArray(message.content)) {
        contentBlocks.push(...mapOpenAiContentParts(message.content));
    } else if (message.content !== null && message.content !== undefined) {
        contentBlocks.push(...toTextBlocks(message.content));
    }

    if (Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
            contentBlocks.push({
                type: 'tool_use',
                id: String(toolCall.id || ''),
                name: String(toolCall.function?.name || ''),
                input: parseMaybeJson(toolCall.function?.arguments) ?? {},
                extraContent: cloneValue(toolCall.extra_content),
            });
        }
    }

    let finishReason = 'stop';
    if (choice?.finish_reason === 'tool_calls') {
        finishReason = 'tool_use';
    } else if (choice?.finish_reason === 'length') {
        finishReason = 'max_tokens';
    } else if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
    }

    return {
        id: String(body?.id || ''),
        model: String(body?.model || ''),
        content: contentBlocks,
        finishReason,
        usage: normalizeUsage(body?.usage),
        contextManagement: body?.context_management ?? null,
    };
}

function normalizeResponseFromMessages(body) {
    const content = Array.isArray(body?.content)
        ? mapAnthropicContentBlocks(body.content)
        : toTextBlocks(body?.content);

    return {
        id: String(body?.id || ''),
        model: String(body?.model || ''),
        content,
        finishReason: body?.stop_reason || 'end_turn',
        usage: normalizeUsage(body?.usage),
        contextManagement: body?.context_management ?? null,
    };
}

function normalizeResponseFromResponses(body) {
    const content = [];
    let hasToolUse = false;

    for (const item of Array.isArray(body?.output) ? body.output : []) {
        const itemType = String(item?.type || '').trim();
        if (itemType === 'message') {
            content.push(...mapResponsesContentBlocks(item.content, 'assistant').filter((block) => block.type === 'text'));
            continue;
        }

        if (isResponsesToolCallType(itemType)) {
            hasToolUse = true;
            content.push({
                type: 'tool_use',
                id: String(item.call_id || ''),
                name: String(item.name || ''),
                input: normalizeResponsesToolCallInput(item),
                callType: itemType,
            });
            continue;
        }

        if (itemType === 'reasoning') {
            const summaryText = Array.isArray(item.summary)
                ? item.summary.map((summaryItem) => summaryItem?.text).filter(Boolean).join('')
                : '';
            if (summaryText) {
                content.push({ type: 'thinking', text: summaryText });
            }
        }
    }

    let finishReason = 'stop';
    if (body?.status === 'incomplete') {
        finishReason = 'max_tokens';
    } else if (hasToolUse) {
        finishReason = 'tool_use';
    }

    return {
        id: String(body?.id || ''),
        model: String(body?.model || ''),
        content,
        finishReason,
        usage: normalizeUsage(body?.usage),
        contextManagement: body?.context_management ?? null,
    };
}

function normalizeResponseBody(apiId, body) {
    switch (getBaseApiId(apiId)) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return normalizeResponseFromChat(body);
    case PROXY_API_IDS.RESPONSES:
        return normalizeResponseFromResponses(body);
    case PROXY_API_IDS.MESSAGES:
        return normalizeResponseFromMessages(body);
    default:
        throw createHttpError(500, `Unsupported response conversion source: ${apiId}`);
    }
}

function buildChatUsage(usage) {
    const normalized = normalizeUsage(usage);
    return {
        prompt_tokens: normalized.input_tokens,
        completion_tokens: normalized.output_tokens,
        total_tokens: normalized.input_tokens + normalized.output_tokens,
        prompt_tokens_details: {
            cached_tokens: normalized.cache_read_input_tokens,
            cache_write_tokens: normalized.cache_creation_input_tokens,
        },
    };
}

function buildResponsesUsage(usage) {
    const normalized = normalizeUsage(usage);
    return {
        input_tokens: normalized.input_tokens,
        output_tokens: normalized.output_tokens,
        total_tokens: normalized.input_tokens + normalized.output_tokens,
        cache_read_input_tokens: normalized.cache_read_input_tokens,
        cache_creation_input_tokens: normalized.cache_creation_input_tokens,
        input_tokens_details: {
            cached_tokens: normalized.cache_read_input_tokens,
            cache_write_tokens: normalized.cache_creation_input_tokens,
        },
    };
}

function buildMessagesUsage(usage) {
    const normalized = normalizeUsage(usage);
    const result = {
        input_tokens: normalized.input_tokens,
        output_tokens: normalized.output_tokens,
        cache_read_input_tokens: normalized.cache_read_input_tokens,
        cache_creation_input_tokens: normalized.cache_creation_input_tokens,
    };
    if (normalized.thinking_tokens > 0) {
        result.details = { thinking_tokens: normalized.thinking_tokens };
    }
    return result;
}

function buildChatResponse(normalized) {
    const text = normalized.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    const reasoningContent = normalized.content
        .filter((block) => block.type === 'thinking')
        .map((block) => block.text)
        .filter(Boolean)
        .join('\n\n');
    const toolCalls = normalized.content
        .filter((block) => block.type === 'tool_use')
        .map((block, index) => ({
            id: block.id || `call_${Date.now()}_${index}`,
            type: 'function',
            function: {
                name: String(block.name || ''),
                arguments: JSON.stringify(normalizeResponsesToolCallArguments(block)),
            },
            ...(block.extraContent ? { extra_content: cloneValue(block.extraContent) } : {}),
        }));
    const finishReason = normalized.finishReason === 'tool_use'
        ? 'tool_calls'
        : normalized.finishReason === 'max_tokens'
            ? 'length'
            : 'stop';

    return {
        id: normalized.id || `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: normalized.model,
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: text || null,
                ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
            },
            finish_reason: finishReason,
        }],
        usage: buildChatUsage(normalized.usage),
    };
}

function buildMessagesResponse(normalized) {
    const content = normalized.content.flatMap((block) => {
        if (block.type === 'text') {
            return [{ type: 'text', text: block.text }];
        }
        if (block.type === 'tool_use') {
            return [{
                type: 'tool_use',
                id: String(block.id || ''),
                name: String(block.name || ''),
                input: cloneValue(block.input) ?? {},
                ...(block.extraContent ? { extra_content: cloneValue(block.extraContent) } : {}),
            }];
        }
        if (block.type === 'thinking') {
            return [{ type: 'thinking', thinking: block.text }];
        }
        return [];
    });

    return {
        id: normalized.id || `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: normalized.model,
        content,
        stop_reason: normalized.finishReason === 'tool_use'
            ? 'tool_use'
            : normalized.finishReason === 'max_tokens'
                ? 'max_tokens'
                : 'end_turn',
        stop_sequence: null,
        usage: buildMessagesUsage(normalized.usage),
        context_management: normalized.contextManagement ?? null,
    };
}

function buildResponsesResponse(normalized, requestBody) {
    const output = [];
    const messageContent = [];

    for (const block of normalized.content) {
        if (block.type === 'thinking') {
            output.push({
                type: 'reasoning',
                summary: [{ type: 'summary_text', text: block.text }],
            });
            continue;
        }

        if (block.type === 'text') {
            messageContent.push({ type: 'output_text', text: block.text });
            continue;
        }

        if (block.type === 'tool_use') {
            if (block.callType === 'custom_tool_call') {
                output.push({
                    type: 'custom_tool_call',
                    call_id: String(block.id || ''),
                    name: String(block.name || ''),
                    input: cloneValue(block.input) ?? '',
                });
            } else {
                output.push({
                    type: 'function_call',
                    call_id: String(block.id || ''),
                    name: String(block.name || ''),
                    arguments: JSON.stringify(block.input ?? {}),
                });
            }
        }
    }

    if (messageContent.length > 0) {
        output.unshift({
            type: 'message',
            role: 'assistant',
            content: messageContent,
        });
    }

    const response = {
        id: normalized.id || `resp_${Date.now()}`,
        object: 'response',
        model: normalized.model,
        status: normalized.finishReason === 'max_tokens' ? 'incomplete' : 'completed',
        output,
        usage: buildResponsesUsage(normalized.usage),
    };

    if (normalized.finishReason === 'max_tokens') {
        response.incomplete_details = { reason: 'max_output_tokens' };
    }

    return applyResponsesRequestMetadata(response, requestBody);
}

function convertResponseBody({ fromApiId, toApiId, body, requestBody }) {
    const sourceApiId = getBaseApiId(fromApiId);
    const targetApiId = getBaseApiId(toApiId);

    if (sourceApiId === targetApiId) {
        return cloneValue(body);
    }

    const normalized = normalizeResponseBody(sourceApiId, body);

    switch (targetApiId) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return buildChatResponse(normalized);
    case PROXY_API_IDS.RESPONSES:
        return buildResponsesResponse(normalized, requestBody);
    case PROXY_API_IDS.MESSAGES:
        return buildMessagesResponse(normalized);
    default:
        throw createHttpError(500, `Unsupported response conversion target: ${toApiId}`);
    }
}

module.exports = {
    buildChatResponse,
    buildMessagesResponse,
    buildResponsesResponse,
    convertRequestBody,
    convertResponseBody,
    getBaseApiId,
    normalizeResponseBody,
    normalizeUsage,
};
