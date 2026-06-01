function parseJsonText(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function mergeUsage(baseUsage, nextUsage) {
    if (!nextUsage || typeof nextUsage !== 'object' || Array.isArray(nextUsage)) {
        return baseUsage;
    }

    const merged = baseUsage && typeof baseUsage === 'object' && !Array.isArray(baseUsage)
        ? { ...baseUsage }
        : {};

    for (const [key, value] of Object.entries(nextUsage)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            merged[key] = mergeUsage(merged[key], value);
        } else {
            merged[key] = value;
        }
    }

    return merged;
}

function parseSseEvents(responseText) {
    const events = [];

    for (const block of String(responseText || '').split(/\r?\n\r?\n/)) {
        const lines = block.split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) {
            continue;
        }

        let eventName = '';
        const dataLines = [];

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
                continue;
            }

            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        if (dataLines.length === 0) {
            continue;
        }

        const dataText = dataLines.join('\n').trim();
        if (!dataText || dataText === '[DONE]') {
            events.push({ event: eventName, dataText, data: null });
            continue;
        }

        events.push({
            event: eventName,
            dataText,
            data: parseJsonText(dataText),
        });
    }

    return events;
}

function buildChatResponseFromEvents(events) {
    const choices = new Map();
    let responseId = '';
    let model = '';
    let created = Math.floor(Date.now() / 1000);
    let usage = null;

    for (const event of events) {
        const payload = event.data;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            continue;
        }

        responseId = payload.id || responseId;
        model = payload.model || model;
        created = payload.created || created;
        usage = mergeUsage(usage, payload.usage);

        for (const choice of Array.isArray(payload.choices) ? payload.choices : []) {
            const choiceIndex = Number(choice?.index || 0);
            const existing = choices.get(choiceIndex) || {
                index: choiceIndex,
                message: {
                    role: 'assistant',
                    content: '',
                    tool_calls: [],
                },
                finish_reason: null,
            };
            const delta = choice?.delta || {};

            if (delta.role) {
                existing.message.role = delta.role;
            }
            if (typeof delta.content === 'string') {
                existing.message.content += delta.content;
            }

            if (Array.isArray(delta.tool_calls)) {
                for (const toolCall of delta.tool_calls) {
                    const toolIndex = Number(toolCall?.index ?? existing.message.tool_calls.length);
                    const currentTool = existing.message.tool_calls[toolIndex] || {
                        id: '',
                        type: 'function',
                        function: {
                            name: '',
                            arguments: '',
                        },
                    };

                    if (toolCall.id) {
                        currentTool.id = toolCall.id;
                    }
                    if (toolCall.type) {
                        currentTool.type = toolCall.type;
                    }
                    if (toolCall.function?.name) {
                        currentTool.function.name += toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                        currentTool.function.arguments += toolCall.function.arguments;
                    }

                    existing.message.tool_calls[toolIndex] = currentTool;
                }
            }

            if (choice.finish_reason) {
                existing.finish_reason = choice.finish_reason;
            }

            choices.set(choiceIndex, existing);
        }
    }

    if (!responseId && !model && choices.size === 0) {
        return null;
    }

    const finalChoices = Array.from(choices.values())
        .sort((left, right) => left.index - right.index)
        .map((choice) => ({
            index: choice.index,
            message: {
                role: choice.message.role || 'assistant',
                content: choice.message.content || null,
                ...(choice.message.tool_calls.length > 0 ? { tool_calls: choice.message.tool_calls } : {}),
            },
            finish_reason: choice.finish_reason || (choice.message.tool_calls.length > 0 ? 'tool_calls' : 'stop'),
        }));

    return {
        id: responseId || `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created,
        model,
        choices: finalChoices,
        ...(usage ? { usage } : {}),
    };
}

function buildMessagesResponseFromEvents(events) {
    let responseId = '';
    let model = '';
    let stopReason = null;
    let stopSequence = null;
    let usage = null;
    let contextManagement = null;
    const contentMap = new Map();

    for (const event of events) {
        const payload = event.data;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            continue;
        }

        const type = String(payload.type || '').trim();
        if (type === 'message_start') {
            responseId = payload.message?.id || responseId;
            model = payload.message?.model || model;
            usage = mergeUsage(usage, payload.message?.usage);
            contextManagement = payload.message?.context_management ?? contextManagement;
            continue;
        }

        if (type === 'content_block_start') {
            const index = Number(payload.index || 0);
            const contentBlock = payload.content_block || {};
            const blockType = String(contentBlock.type || '').trim();
            if (blockType === 'text') {
                contentMap.set(index, { type: 'text', text: contentBlock.text || '' });
            } else if (blockType === 'thinking') {
                contentMap.set(index, { type: 'thinking', thinking: contentBlock.thinking || '' });
            } else if (blockType === 'tool_use') {
                contentMap.set(index, {
                    type: 'tool_use',
                    id: String(contentBlock.id || ''),
                    name: String(contentBlock.name || ''),
                    input: cloneObject(contentBlock.input) || {},
                    _inputJson: '',
                });
            }
            continue;
        }

        if (type === 'content_block_delta') {
            const index = Number(payload.index || 0);
            const currentBlock = contentMap.get(index);
            const delta = payload.delta || {};
            const deltaType = String(delta.type || '').trim();

            if (!currentBlock) {
                continue;
            }

            if (deltaType === 'text_delta') {
                currentBlock.text = `${currentBlock.text || ''}${delta.text || ''}`;
            } else if (deltaType === 'thinking_delta') {
                currentBlock.thinking = `${currentBlock.thinking || ''}${delta.thinking || ''}`;
            } else if (deltaType === 'input_json_delta') {
                currentBlock._inputJson = `${currentBlock._inputJson || ''}${delta.partial_json || ''}`;
            }
            continue;
        }

        if (type === 'content_block_stop') {
            const index = Number(payload.index || 0);
            const currentBlock = contentMap.get(index);
            if (currentBlock?.type === 'tool_use' && currentBlock._inputJson) {
                currentBlock.input = parseJsonText(currentBlock._inputJson) || currentBlock.input || {};
            }
            continue;
        }

        if (type === 'message_delta') {
            stopReason = payload.delta?.stop_reason || stopReason;
            stopSequence = payload.delta?.stop_sequence ?? stopSequence;
            usage = mergeUsage(usage, payload.usage);
            if (payload.context_management !== undefined) {
                contextManagement = payload.context_management;
            }
        }
    }

    if (!responseId && !model && contentMap.size === 0) {
        return null;
    }

    const content = Array.from(contentMap.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([, block]) => {
            if (block.type === 'tool_use') {
                return {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: block.input || {},
                };
            }

            if (block.type === 'thinking') {
                return {
                    type: 'thinking',
                    thinking: block.thinking || '',
                };
            }

            return {
                type: 'text',
                text: block.text || '',
            };
        });

    return {
        id: responseId || `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model,
        content,
        stop_reason: stopReason || (content.some((block) => block.type === 'tool_use') ? 'tool_use' : 'end_turn'),
        stop_sequence: stopSequence ?? null,
        context_management: contextManagement ?? null,
        ...(usage ? { usage } : {}),
    };
}

function mergeResponseEnvelope(base, next) {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
        return base;
    }

    const merged = base && typeof base === 'object' && !Array.isArray(base)
        ? { ...base }
        : {};

    for (const [key, value] of Object.entries(next)) {
        if (key === 'output') {
            continue;
        }

        if (key === 'usage') {
            merged.usage = mergeUsage(merged.usage, value);
            continue;
        }

        merged[key] = cloneObject(value);
    }

    return merged;
}

function ensureResponsesOutputItem(outputItems, outputIndex, fallbackType) {
    const index = Number(outputIndex || 0);
    const existing = outputItems.get(index);
    if (existing) {
        return existing;
    }

    const item = { type: fallbackType };
    outputItems.set(index, item);
    return item;
}

function ensureResponseMessagePart(item, contentIndex, fallbackType = 'output_text') {
    if (!Array.isArray(item.content)) {
        item.content = [];
    }

    const index = Number(contentIndex || 0);
    const existing = item.content[index];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        return existing;
    }

    const part = { type: fallbackType };
    item.content[index] = part;
    return part;
}

function ensureResponseReasoningPart(item, summaryIndex, fallbackType = 'summary_text') {
    if (!Array.isArray(item.summary)) {
        item.summary = [];
    }

    const index = Number(summaryIndex || 0);
    const existing = item.summary[index];
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        return existing;
    }

    const part = { type: fallbackType };
    item.summary[index] = part;
    return part;
}

function buildResponsesResponseFromEvents(events) {
    let response = null;
    const outputItems = new Map();

    for (const event of events) {
        const payload = event.data;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            continue;
        }

        const type = String(payload.type || '').trim();
        if (
            type === 'response.created'
            || type === 'response.in_progress'
            || type === 'response.completed'
        ) {
            response = mergeResponseEnvelope(response, payload.response);
            continue;
        }

        if (type === 'response.output_item.added' || type === 'response.output_item.done') {
            outputItems.set(
                Number(payload.output_index || 0),
                cloneObject(payload.item) || { type: 'message' }
            );
            continue;
        }

        if (type === 'response.content_part.added' || type === 'response.content_part.done') {
            const item = ensureResponsesOutputItem(outputItems, payload.output_index, 'message');
            item.type = item.type || 'message';
            const part = ensureResponseMessagePart(
                item,
                payload.content_index,
                payload.part?.type || 'output_text'
            );
            Object.assign(part, cloneObject(payload.part) || {});
            continue;
        }

        if (type === 'response.output_text.delta' || type === 'response.output_text.done') {
            const item = ensureResponsesOutputItem(outputItems, payload.output_index, 'message');
            item.type = item.type || 'message';
            const part = ensureResponseMessagePart(item, payload.content_index, 'output_text');
            part.type = 'output_text';
            if (type === 'response.output_text.delta') {
                part.text = `${part.text || ''}${payload.delta || ''}`;
            } else {
                part.text = payload.text || part.text || '';
                if (Array.isArray(payload.logprobs)) {
                    part.logprobs = cloneObject(payload.logprobs);
                }
            }
            continue;
        }

        if (type === 'response.reasoning_summary_part.added' || type === 'response.reasoning_summary_part.done') {
            const item = ensureResponsesOutputItem(outputItems, payload.output_index, 'reasoning');
            item.type = 'reasoning';
            const part = ensureResponseReasoningPart(
                item,
                payload.summary_index,
                payload.part?.type || 'summary_text'
            );
            Object.assign(part, cloneObject(payload.part) || {});
            continue;
        }

        if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_summary_text.done') {
            const item = ensureResponsesOutputItem(outputItems, payload.output_index, 'reasoning');
            item.type = 'reasoning';
            const part = ensureResponseReasoningPart(item, payload.summary_index, 'summary_text');
            part.type = 'summary_text';
            if (type === 'response.reasoning_summary_text.delta') {
                part.text = `${part.text || ''}${payload.delta || ''}`;
            } else {
                part.text = payload.text || part.text || '';
            }
            continue;
        }

        if (type === 'response.function_call_arguments.delta' || type === 'response.function_call_arguments.done') {
            const item = ensureResponsesOutputItem(outputItems, payload.output_index, 'function_call');
            item.type = item.type || 'function_call';
            if (type === 'response.function_call_arguments.delta') {
                item.arguments = `${item.arguments || ''}${payload.delta || ''}`;
            } else {
                item.arguments = payload.arguments || item.arguments || '';
            }
        }
    }

    const output = outputItems.size > 0
        ? Array.from(outputItems.entries())
            .sort((left, right) => left[0] - right[0])
            .map(([, item]) => cloneObject(item))
        : (Array.isArray(response?.output) ? cloneObject(response.output) : []);

    if (!response && output.length === 0) {
        return null;
    }

    return {
        ...(cloneObject(response) || {}),
        id: response?.id || `resp_${Date.now()}`,
        object: response?.object || 'response',
        model: response?.model || '',
        status: response?.status || 'completed',
        output,
        ...(response?.usage ? { usage: response.usage } : {}),
    };
}

function cloneObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? JSON.parse(JSON.stringify(value))
        : value;
}

function extractChatCompletionMetadata(responseText) {
    const parsedResponse = parseJsonText(responseText);
    if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
        return {
            parsedResponse,
            usage: parsedResponse.usage || null,
            usageSource: parsedResponse.usage ? 'json' : null,
        };
    }

    const events = parseSseEvents(responseText);
    const response = buildChatResponseFromEvents(events);
    return {
        parsedResponse: response,
        usage: response?.usage || null,
        usageSource: response?.usage ? 'sse' : null,
    };
}

function extractResponsesMetadata(responseText) {
    const parsedResponse = parseJsonText(responseText);
    if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
        return {
            parsedResponse,
            usage: parsedResponse.usage || null,
            usageSource: parsedResponse.usage ? 'json' : null,
        };
    }

    const events = parseSseEvents(responseText);
    const response = buildResponsesResponseFromEvents(events);

    return {
        parsedResponse: response,
        usage: response?.usage || null,
        usageSource: response?.usage ? 'sse' : null,
    };
}

function extractMessagesMetadata(responseText) {
    const parsedResponse = parseJsonText(responseText);
    if (parsedResponse && typeof parsedResponse === 'object' && !Array.isArray(parsedResponse)) {
        return {
            parsedResponse,
            usage: parsedResponse.usage || null,
            usageSource: parsedResponse.usage ? 'json' : null,
        };
    }

    const events = parseSseEvents(responseText);
    const response = buildMessagesResponseFromEvents(events);

    return {
        parsedResponse: response,
        usage: response?.usage || null,
        usageSource: response?.usage ? 'sse' : null,
    };
}

module.exports = {
    extractChatCompletionMetadata,
    extractMessagesMetadata,
    extractResponsesMetadata,
    parseJsonText,
    parseSseEvents,
};
