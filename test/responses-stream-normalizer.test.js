const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeResponsesStreamCompletion } = require('../src/services/proxy-apis/responses-stream-normalizer');

function streamFromText(text) {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        },
    });
}

async function normalizeText(text, options = {}) {
    const stream = normalizeResponsesStreamCompletion(streamFromText(text), options);
    return new Response(stream).text();
}

function countMatches(text, pattern) {
    return [...String(text).matchAll(pattern)].length;
}

test('responses stream normalizer signals truncation before DONE instead of inventing success', async () => {
    let injected = 0;
    const result = await normalizeText([
        'event: response.created',
        'data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_test","object":"response","model":"gpt-5.5","status":"in_progress"}}',
        '',
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","sequence_number":1,"delta":"hello"}',
        '',
        'data: [DONE]',
        '',
    ].join('\n'), {
        onAbnormalEnd: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 1);
    assert.doesNotMatch(result, /event: response\.completed/);
    assert.match(result, /"code":"upstream_stream_truncated"/);
    assert.ok(result.indexOf('event: error') < result.indexOf('data: [DONE]'));
});

test('responses stream normalizer does not duplicate an existing response.completed event', async () => {
    let injected = 0;
    const result = await normalizeText([
        'event: response.created',
        'data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_done","status":"in_progress"}}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","sequence_number":1,"response":{"id":"resp_done","object":"response","status":"completed","output":[]}}',
        '',
        'data: [DONE]',
        '',
    ].join('\n'), {
        onAbnormalEnd: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 0);
    assert.equal(countMatches(result, /event: response\.completed/g), 1);
    assert.match(result, /data: \[DONE\]/);
});

test('responses stream normalizer closes a truncated stream with an error and DONE', async () => {
    let injected = 0;
    const result = await normalizeText([
        'event: response.created',
        'data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_truncated","object":"response","status":"in_progress"}}',
        '',
    ].join('\n'), {
        onAbnormalEnd: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 1);
    assert.doesNotMatch(result, /event: response\.completed/);
    assert.match(result, /"code":"upstream_stream_truncated"/);
    assert.match(result, /"id":"resp_truncated"/);
    assert.match(result, /data: \[DONE\]/);
});

for (const terminal of ['response.failed', 'response.incomplete', 'error']) {
    test(`responses stream normalizer preserves ${terminal} without adding success`, async () => {
        const text = `event: ${terminal}\ndata: ${JSON.stringify({ type: terminal, message: 'failed' })}\n\n`;
        const result = await normalizeText(text, {
            onAbnormalEnd() { assert.fail('An explicit terminal event is not a truncated stream'); },
        });
        assert.ok(result.startsWith(text));
        assert.doesNotMatch(result, /response\.completed|upstream_stream_truncated/);
        assert.match(result, /data: \[DONE\]/);
    });
}

test('responses stream normalizer handles split UTF-8 bytes and CRLF blocks', async () => {
    const text = 'event: response.completed\r\ndata: {"response":{"status":"completed","output":[{"text":"你好"}]}}\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({
        start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
        },
    });
    const result = await new Response(normalizeResponsesStreamCompletion(stream)).text();
    assert.equal(result, `${text}data: [DONE]\n\n`);
});
