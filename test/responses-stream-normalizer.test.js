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

test('responses stream normalizer injects response.completed before DONE when upstream omits it', async () => {
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
        onInjected: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 1);
    assert.match(result, /event: response\.completed/);
    assert.match(result, /"id":"resp_test"/);
    assert.match(result, /"status":"completed"/);
    assert.ok(result.indexOf('event: response.completed') < result.indexOf('data: [DONE]'));
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
        onInjected: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 0);
    assert.equal(countMatches(result, /event: response\.completed/g), 1);
    assert.match(result, /data: \[DONE\]/);
});

test('responses stream normalizer closes a truncated stream with response.completed and DONE', async () => {
    let injected = 0;
    const result = await normalizeText([
        'event: response.created',
        'data: {"type":"response.created","sequence_number":0,"response":{"id":"resp_truncated","object":"response","status":"in_progress"}}',
        '',
    ].join('\n'), {
        onInjected: () => {
            injected += 1;
        },
    });

    assert.equal(injected, 1);
    assert.match(result, /event: response\.completed/);
    assert.match(result, /"id":"resp_truncated"/);
    assert.match(result, /data: \[DONE\]/);
});
