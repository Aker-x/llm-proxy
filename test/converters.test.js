const test = require('node:test');
const assert = require('node:assert/strict');

const {
    convertRequestBody,
    convertResponseBody,
} = require('../src/services/proxy-apis/converters');
const { responsesApi, normalizeResponsesBuiltinTools } = require('../src/services/proxy-apis/responses-api');
const { buildSyntheticStream } = require('../src/services/proxy-apis/synthetic-streams');
const { extractResponsesMetadata, parseSseEvents } = require('../src/services/proxy-apis/usage-parsers');

test('chat developer messages are promoted to responses instructions', () => {
    const result = convertRequestBody({
        fromApiId: 'chat_completions',
        toApiId: 'responses',
        body: {
            model: 'gpt-5',
            messages: [
                { role: 'developer', content: 'Follow the house style.' },
                { role: 'user', content: 'Hello' },
            ],
        },
    });

    assert.equal(result.instructions, 'Follow the house style.');
    assert.deepEqual(result.input, [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
    }]);
});

test('responses system input items become anthropic system prompt', () => {
    const result = convertRequestBody({
        fromApiId: 'responses',
        toApiId: 'messages',
        body: {
            model: 'claude-sonnet',
            input: [
                {
                    type: 'message',
                    role: 'system',
                    content: [{ type: 'input_text', text: 'Behave like a reviewer.' }],
                },
                {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Check this diff.' }],
                },
            ],
        },
    });

    assert.equal(result.system, 'Behave like a reviewer.');
    assert.deepEqual(result.messages, [{
        role: 'user',
        content: [{ type: 'text', text: 'Check this diff.' }],
    }]);
});

test('responses builtin tools are ignored instead of rejected during chat conversion', () => {
    const result = convertRequestBody({
        fromApiId: 'responses',
        toApiId: 'chat_completions',
        body: {
            model: 'gpt-5',
            tools: [
                { type: 'web_search_preview' },
                {
                    type: 'function',
                    name: 'lookup_weather',
                    description: 'Look up weather',
                    parameters: {
                        type: 'object',
                        properties: {
                            city: { type: 'string' },
                        },
                    },
                },
            ],
            input: 'hello',
        },
    });

    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].function.name, 'lookup_weather');
});

test('responses tool outputs preserve structured text and image content for anthropic', () => {
    const result = convertRequestBody({
        fromApiId: 'responses',
        toApiId: 'messages',
        body: {
            model: 'claude-sonnet',
            input: [
                {
                    type: 'function_call_output',
                    call_id: 'call_123',
                    output: [
                        { type: 'input_text', text: 'Screenshot result' },
                        { type: 'input_image', image_url: 'data:image/png;base64,ZmFrZQ==' },
                    ],
                },
            ],
        },
    });

    assert.deepEqual(result.messages, [{
        role: 'user',
        content: [{
            type: 'tool_result',
            tool_use_id: 'call_123',
            content: [
                { type: 'text', text: 'Screenshot result' },
                {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: 'image/png',
                        data: 'ZmFrZQ==',
                    },
                },
            ],
        }],
    }]);
});

test('responses custom tool call items convert to anthropic tool_use and tool_result blocks', () => {
    const result = convertRequestBody({
        fromApiId: 'responses',
        toApiId: 'messages',
        body: {
            model: 'claude-sonnet',
            input: [
                {
                    type: 'custom_tool_call',
                    call_id: 'call_patch',
                    name: 'apply_patch',
                    input: '*** Begin Patch',
                },
                {
                    type: 'custom_tool_call_output',
                    call_id: 'call_patch',
                    output: 'ok',
                },
            ],
        },
    });

    assert.deepEqual(result.messages, [
        {
            role: 'assistant',
            content: [{
                type: 'tool_use',
                id: 'call_patch',
                name: 'apply_patch',
                input: {
                    input: '*** Begin Patch',
                },
            }],
        },
        {
            role: 'user',
            content: [{
                type: 'tool_result',
                tool_use_id: 'call_patch',
                content: 'ok',
            }],
        },
    ]);
});

test('chat reasoning_content is preserved when converting to anthropic messages', () => {
    const result = convertResponseBody({
        fromApiId: 'chat_completions',
        toApiId: 'messages',
        body: {
            id: 'chatcmpl_1',
            model: 'gpt-5',
            choices: [{
                index: 0,
                finish_reason: 'stop',
                message: {
                    role: 'assistant',
                    reasoning_content: 'Private reasoning summary',
                    content: 'Visible answer',
                },
            }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
            },
        },
    });

    assert.deepEqual(result.content, [
        { type: 'thinking', thinking: 'Private reasoning summary' },
        { type: 'text', text: 'Visible answer' },
    ]);
});

test('chat tool_calls preserve google extra content and map finish reason for anthropic messages', () => {
    const result = convertResponseBody({
        fromApiId: 'chat_completions',
        toApiId: 'messages',
        body: {
            id: 'chatcmpl_google_1',
            model: 'gemini-3.1-flash-lite-preview',
            choices: [{
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                    role: 'assistant',
                    tool_calls: [{
                        id: 'call_google_1',
                        type: 'function',
                        extra_content: {
                            google: {
                                thought_signature: 'sig_123',
                            },
                        },
                        function: {
                            name: 'get_weather',
                            arguments: '{"city":"Hangzhou"}',
                        },
                    }],
                },
            }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
            },
        },
    });

    assert.equal(result.stop_reason, 'tool_use');
    assert.deepEqual(result.content, [{
        type: 'tool_use',
        id: 'call_google_1',
        name: 'get_weather',
        input: { city: 'Hangzhou' },
        extra_content: {
            google: {
                thought_signature: 'sig_123',
            },
        },
    }]);
});

test('anthropic thinking is preserved when converting to chat responses', () => {
    const result = convertResponseBody({
        fromApiId: 'messages',
        toApiId: 'chat_completions',
        body: {
            id: 'msg_1',
            model: 'claude-sonnet',
            stop_reason: 'end_turn',
            content: [
                { type: 'thinking', thinking: 'Deliberation summary' },
                { type: 'text', text: 'Final answer' },
            ],
            usage: {
                input_tokens: 10,
                output_tokens: 6,
            },
        },
    });

    assert.equal(result.choices[0].message.reasoning_content, 'Deliberation summary');
    assert.equal(result.choices[0].message.content, 'Final answer');
});

test('anthropic tool_use extra content is preserved when converting to chat completions', () => {
    const result = convertRequestBody({
        fromApiId: 'messages',
        toApiId: 'chat_completions',
        body: {
            model: 'gemini-3.1-flash-lite-preview',
            messages: [{
                role: 'assistant',
                content: [{
                    type: 'tool_use',
                    id: 'call_google_1',
                    name: 'get_weather',
                    input: { city: 'Hangzhou' },
                    extra_content: {
                        google: {
                            thought_signature: 'sig_123',
                        },
                    },
                }],
            }],
        },
    });

    assert.deepEqual(result.messages, [{
        role: 'assistant',
        content: null,
        tool_calls: [{
            id: 'call_google_1',
            type: 'function',
            extra_content: {
                google: {
                    thought_signature: 'sig_123',
                },
            },
            function: {
                name: 'get_weather',
                arguments: '{"city":"Hangzhou"}',
            },
        }],
    }]);
});

test('responses custom tool calls are preserved when converting responses to chat completions', () => {
    const result = convertResponseBody({
        fromApiId: 'responses',
        toApiId: 'chat_completions',
        body: {
            id: 'resp_custom',
            model: 'gpt-5-codex',
            status: 'completed',
            output: [{
                type: 'custom_tool_call',
                call_id: 'call_patch',
                name: 'apply_patch',
                input: '*** Begin Patch',
            }],
            usage: {
                input_tokens: 10,
                output_tokens: 5,
            },
        },
    });

    assert.equal(result.choices[0].finish_reason, 'tool_calls');
    assert.equal(result.choices[0].message.tool_calls[0].function.name, 'apply_patch');
    assert.equal(
        result.choices[0].message.tool_calls[0].function.arguments,
        JSON.stringify({ input: '*** Begin Patch' })
    );
});

test('responses builtin tool aliases are normalized before forwarding upstream', () => {
    const body = {
        model: 'gpt-5',
        tools: [
            { type: 'web_search_preview', search_context_size: 'high' },
            { type: 'web_search_preview_2025_03_11' },
        ],
        tool_choice: {
            type: 'allowed_tools',
            tools: [
                { type: 'web_search_preview' },
                { type: 'web_search_preview_2025_03_11' },
            ],
        },
    };

    const normalized = normalizeResponsesBuiltinTools(structuredClone(body));
    assert.equal(normalized.tools[0].type, 'web_search');
    assert.equal(normalized.tools[1].type, 'web_search');
    assert.equal(normalized.tool_choice.type, 'allowed_tools');
    assert.equal(normalized.tool_choice.tools[0].type, 'web_search');
    assert.equal(normalized.tool_choice.tools[1].type, 'web_search');
});

test('responses prepareRequest applies builtin tool normalization', () => {
    const prepared = responsesApi.prepareRequest({
        body: {
            model: 'client-model',
            tools: [{ type: 'web_search_preview' }],
            tool_choice: { type: 'web_search_preview_2025_03_11' },
        },
        provider: {
            apiBaseUrl: 'https://example.com/v1',
            apiKey: 'test-key',
            id: 'provider-1',
        },
        model: {
            upstreamModel: 'gpt-5',
            name: 'client-model',
            id: 'model-1',
        },
        requestId: 'req-1',
    });

    assert.equal(prepared.sanitizedBody.tools[0].type, 'web_search');
    assert.equal(prepared.sanitizedBody.tool_choice.type, 'web_search');
});

test('responses response conversion preserves request metadata like the reference project', () => {
    const result = convertResponseBody({
        fromApiId: 'messages',
        toApiId: 'responses',
        body: {
            id: 'msg_2',
            model: 'claude-sonnet',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'done' }],
            usage: {
                input_tokens: 12,
                output_tokens: 4,
            },
        },
        requestBody: {
            previous_response_id: 'resp_prev',
            prompt_cache_key: 'cache_123',
            max_tool_calls: 4,
        },
    });

    assert.equal(result.previous_response_id, 'resp_prev');
    assert.equal(result.prompt_cache_key, 'cache_123');
    assert.equal(result.max_tool_calls, 4);
});

test('responses synthetic stream emits rich reasoning and function-call events', () => {
    const streamText = buildSyntheticStream({
        apiId: 'responses',
        body: {
            id: 'resp_test',
            object: 'response',
            model: 'gpt-5',
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'deliberation' }],
                },
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'hello' }],
                },
                {
                    type: 'function_call',
                    call_id: 'call_1',
                    name: 'read_file',
                    arguments: '{"path":"README.md"}',
                },
            ],
        },
    });

    const events = parseSseEvents(streamText);
    const eventNames = events.map((event) => event.event).filter(Boolean);

    assert.ok(eventNames.includes('response.in_progress'));
    assert.ok(eventNames.includes('response.reasoning_summary_part.added'));
    assert.ok(eventNames.includes('response.reasoning_summary_text.delta'));
    assert.ok(eventNames.includes('response.reasoning_summary_text.done'));
    assert.ok(eventNames.includes('response.output_text.done'));
    assert.ok(eventNames.includes('response.function_call_arguments.done'));
    assert.ok(eventNames.includes('response.completed'));

    const completed = events.find((event) => event.event === 'response.completed');
    assert.equal(completed.data.response.id, 'resp_test');
});

test('responses metadata extraction can rebuild a response without response.completed', () => {
    const responseText = [
        'event: response.created',
        'data: {"type":"response.created","response":{"id":"resp_partial","object":"response","model":"gpt-5","status":"in_progress"}}',
        '',
        'event: response.output_item.added',
        'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg_1","type":"message","role":"assistant","content":[]}}',
        '',
        'event: response.content_part.added',
        'data: {"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","annotations":[],"logprobs":[]}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"hello"}',
        '',
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"hello","logprobs":[]}',
        '',
        'event: response.output_item.done',
        'data: {"type":"response.output_item.done","output_index":1,"item":{"id":"fc_1","type":"custom_tool_call","call_id":"call_patch","name":"apply_patch","input":"*** Begin Patch"}}',
        '',
        'data: [DONE]',
        '',
    ].join('\n');

    const { parsedResponse } = extractResponsesMetadata(responseText);
    assert.equal(parsedResponse.id, 'resp_partial');
    assert.equal(parsedResponse.output[0].content[0].text, 'hello');
    assert.equal(parsedResponse.output[1].type, 'custom_tool_call');
    assert.equal(parsedResponse.output[1].call_id, 'call_patch');
});
