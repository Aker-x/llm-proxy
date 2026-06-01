const { PROXY_API_IDS } = require('./constants');
const { normalizeUsage } = require('./converters');

function sseEvent({ event, data }) {
    const prefix = event ? `event: ${event}\n` : '';
    return `${prefix}data: ${JSON.stringify(data)}\n\n`;
}

function createSequenceNumber() {
    let current = 0;
    return () => {
        current += 1;
        return current;
    };
}

function buildResponseOutputItemId(item, responseId, outputIndex) {
    if (item?.id) {
        return String(item.id);
    }

    const itemType = String(item?.type || '').trim() || 'item';
    const normalizedType = itemType.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'item';
    return `${normalizedType}_${responseId}_${outputIndex}`;
}

function buildChatSyntheticStream(body) {
    const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
    const chunk = {
        id: body.id,
        object: 'chat.completion.chunk',
        created: body.created || Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{
            index: choice?.index || 0,
            delta: {
                role: choice?.message?.role || 'assistant',
                ...(choice?.message?.content ? { content: choice.message.content } : {}),
                ...(Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0
                    ? { tool_calls: choice.message.tool_calls }
                    : {}),
            },
            finish_reason: choice?.finish_reason || 'stop',
        }],
    };

    const usageChunk = body?.usage
        ? {
            id: body.id,
            object: 'chat.completion.chunk',
            created: body.created || Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [],
            usage: body.usage,
        }
        : null;

    return [
        `data: ${JSON.stringify(chunk)}\n\n`,
        usageChunk ? `data: ${JSON.stringify(usageChunk)}\n\n` : '',
        'data: [DONE]\n\n',
    ].join('');
}

function buildMessagesSyntheticStream(body) {
    const usage = normalizeUsage(body?.usage);
    const chunks = [
        sseEvent({
            event: 'message_start',
            data: {
                type: 'message_start',
                message: {
                    id: body.id,
                    type: 'message',
                    role: body.role || 'assistant',
                    model: body.model,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                        input_tokens: usage.input_tokens,
                        output_tokens: 0,
                        thinking_tokens: 0,
                        cache_read_input_tokens: usage.cache_read_input_tokens,
                        cache_creation_input_tokens: usage.cache_creation_input_tokens,
                    },
                },
            },
        }),
    ];

    const content = Array.isArray(body?.content) ? body.content : [];
    content.forEach((block, index) => {
        if (block.type === 'tool_use') {
            const inputJson = JSON.stringify(block.input || {});
            chunks.push(sseEvent({
                event: 'content_block_start',
                data: {
                    type: 'content_block_start',
                    index,
                    content_block: {
                        type: 'tool_use',
                        id: block.id,
                        name: block.name,
                        input: {},
                    },
                },
            }));
            if (inputJson) {
                chunks.push(sseEvent({
                    event: 'content_block_delta',
                    data: {
                        type: 'content_block_delta',
                        index,
                        delta: {
                            type: 'input_json_delta',
                            partial_json: inputJson,
                        },
                    },
                }));
            }
            chunks.push(sseEvent({
                event: 'content_block_stop',
                data: {
                    type: 'content_block_stop',
                    index,
                },
            }));
            return;
        }

        if (block.type === 'thinking') {
            chunks.push(sseEvent({
                event: 'content_block_start',
                data: {
                    type: 'content_block_start',
                    index,
                    content_block: {
                        type: 'thinking',
                        thinking: '',
                    },
                },
            }));
            if (block.thinking) {
                chunks.push(sseEvent({
                    event: 'content_block_delta',
                    data: {
                        type: 'content_block_delta',
                        index,
                        delta: {
                            type: 'thinking_delta',
                            thinking: block.thinking,
                        },
                    },
                }));
            }
            chunks.push(sseEvent({
                event: 'content_block_stop',
                data: {
                    type: 'content_block_stop',
                    index,
                },
            }));
            return;
        }

        chunks.push(sseEvent({
            event: 'content_block_start',
            data: {
                type: 'content_block_start',
                index,
                content_block: {
                    type: 'text',
                    text: '',
                },
            },
        }));
        if (block.text) {
            chunks.push(sseEvent({
                event: 'content_block_delta',
                data: {
                    type: 'content_block_delta',
                    index,
                    delta: {
                        type: 'text_delta',
                        text: block.text,
                    },
                },
            }));
        }
        chunks.push(sseEvent({
            event: 'content_block_stop',
            data: {
                type: 'content_block_stop',
                index,
            },
        }));
    });

    chunks.push(sseEvent({
        event: 'message_delta',
        data: {
            type: 'message_delta',
            delta: {
                stop_reason: body.stop_reason || 'end_turn',
                stop_sequence: body.stop_sequence ?? null,
            },
            usage: {
                output_tokens: usage.output_tokens,
                thinking_tokens: usage.thinking_tokens,
            },
            context_management: body?.context_management ?? null,
        },
    }));
    chunks.push(sseEvent({
        event: 'message_stop',
        data: {
            type: 'message_stop',
        },
    }));

    return chunks.join('');
}

function buildResponsesSyntheticStream(body) {
    const responseId = body?.id || `resp_${Date.now()}`;
    const nextSequence = createSequenceNumber();
    const createdBody = {
        ...body,
        status: 'in_progress',
    };
    const chunks = [
        sseEvent({
            event: 'response.created',
            data: {
                type: 'response.created',
                sequence_number: nextSequence(),
                response: createdBody,
            },
        }),
        sseEvent({
            event: 'response.in_progress',
            data: {
                type: 'response.in_progress',
                sequence_number: nextSequence(),
                response: {
                    id: responseId,
                    object: body?.object || 'response',
                    model: body?.model,
                    status: 'in_progress',
                },
            },
        }),
    ];

    const output = Array.isArray(body?.output) ? body.output : [];
    output.forEach((item, outputIndex) => {
        const itemId = buildResponseOutputItemId(item, responseId, outputIndex);
        const itemWithId = item && typeof item === 'object' && !Array.isArray(item)
            ? { ...item, id: itemId }
            : item;

        chunks.push(sseEvent({
            event: 'response.output_item.added',
            data: {
                type: 'response.output_item.added',
                sequence_number: nextSequence(),
                output_index: outputIndex,
                item: itemWithId,
            },
        }));

        if (item.type === 'message' && Array.isArray(item.content)) {
            item.content.forEach((contentPart, contentIndex) => {
                const partWithDefaults = contentPart?.type === 'output_text'
                    ? {
                        annotations: [],
                        logprobs: [],
                        ...contentPart,
                    }
                    : contentPart;
                chunks.push(sseEvent({
                    event: 'response.content_part.added',
                    data: {
                        type: 'response.content_part.added',
                        sequence_number: nextSequence(),
                        item_id: itemId,
                        output_index: outputIndex,
                        content_index: contentIndex,
                        part: partWithDefaults,
                    },
                }));

                if (contentPart.type === 'output_text' && contentPart.text) {
                    chunks.push(sseEvent({
                        event: 'response.output_text.delta',
                        data: {
                            type: 'response.output_text.delta',
                            sequence_number: nextSequence(),
                            item_id: itemId,
                            output_index: outputIndex,
                            content_index: contentIndex,
                            delta: contentPart.text,
                        },
                    }));
                    chunks.push(sseEvent({
                        event: 'response.output_text.done',
                        data: {
                            type: 'response.output_text.done',
                            sequence_number: nextSequence(),
                            item_id: itemId,
                            output_index: outputIndex,
                            content_index: contentIndex,
                            text: contentPart.text,
                            logprobs: [],
                        },
                    }));
                }

                chunks.push(sseEvent({
                    event: 'response.content_part.done',
                    data: {
                        type: 'response.content_part.done',
                        sequence_number: nextSequence(),
                        item_id: itemId,
                        output_index: outputIndex,
                        content_index: contentIndex,
                        part: partWithDefaults,
                    },
                }));
            });
        }

        if (item.type === 'reasoning') {
            const summary = Array.isArray(item.summary) ? item.summary : [];
            summary.forEach((summaryPart, summaryIndex) => {
                chunks.push(sseEvent({
                    event: 'response.reasoning_summary_part.added',
                    data: {
                        type: 'response.reasoning_summary_part.added',
                        sequence_number: nextSequence(),
                        item_id: itemId,
                        output_index: outputIndex,
                        summary_index: summaryIndex,
                        part: summaryPart,
                    },
                }));

                if (summaryPart?.type === 'summary_text' && summaryPart.text) {
                    chunks.push(sseEvent({
                        event: 'response.reasoning_summary_text.delta',
                        data: {
                            type: 'response.reasoning_summary_text.delta',
                            sequence_number: nextSequence(),
                            item_id: itemId,
                            output_index: outputIndex,
                            summary_index: summaryIndex,
                            delta: summaryPart.text,
                        },
                    }));
                    chunks.push(sseEvent({
                        event: 'response.reasoning_summary_text.done',
                        data: {
                            type: 'response.reasoning_summary_text.done',
                            sequence_number: nextSequence(),
                            item_id: itemId,
                            output_index: outputIndex,
                            summary_index: summaryIndex,
                            text: summaryPart.text,
                        },
                    }));
                }

                chunks.push(sseEvent({
                    event: 'response.reasoning_summary_part.done',
                    data: {
                        type: 'response.reasoning_summary_part.done',
                        sequence_number: nextSequence(),
                        item_id: itemId,
                        output_index: outputIndex,
                        summary_index: summaryIndex,
                        part: summaryPart,
                    },
                }));
            });
        }

        if (item.type === 'function_call' && item.arguments) {
            chunks.push(sseEvent({
                event: 'response.function_call_arguments.delta',
                data: {
                    type: 'response.function_call_arguments.delta',
                    sequence_number: nextSequence(),
                    item_id: itemId,
                    output_index: outputIndex,
                    delta: item.arguments,
                },
            }));
            chunks.push(sseEvent({
                event: 'response.function_call_arguments.done',
                data: {
                    type: 'response.function_call_arguments.done',
                    sequence_number: nextSequence(),
                    item_id: itemId,
                    output_index: outputIndex,
                    arguments: item.arguments,
                },
            }));
        }

        chunks.push(sseEvent({
            event: 'response.output_item.done',
            data: {
                type: 'response.output_item.done',
                sequence_number: nextSequence(),
                output_index: outputIndex,
                item: itemWithId,
            },
        }));
    });

    chunks.push(sseEvent({
        event: 'response.completed',
        data: {
            type: 'response.completed',
            sequence_number: nextSequence(),
            response: {
                ...body,
                id: responseId,
            },
        },
    }));
    chunks.push('data: [DONE]\n\n');

    return chunks.join('');
}

function buildSyntheticStream({ apiId, body }) {
    switch (apiId) {
    case PROXY_API_IDS.CHAT_COMPLETIONS:
        return buildChatSyntheticStream(body);
    case PROXY_API_IDS.RESPONSES:
    case PROXY_API_IDS.RESPONSES_COMPACT:
        return buildResponsesSyntheticStream(body);
    case PROXY_API_IDS.MESSAGES:
        return buildMessagesSyntheticStream(body);
    default:
        return '';
    }
}

module.exports = {
    buildSyntheticStream,
};
