const test = require('node:test');
const assert = require('node:assert/strict');
const { ProxyService } = require('../src/services/proxy-service');
const { getProxyApi } = require('../src/services/proxy-apis');
const { inspectResponseOutcome, hasReportedUsage } = require('../src/services/proxy-apis/response-outcome');

const textOutput = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello' }] }];
const reportedUsage = { input_tokens: 20, output_tokens: 7, total_tokens: 27 };
const event = (type, data = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const terminal = (status, extras = {}) => event(`response.${status}`, {
    response: { id: 'resp_test', status, output: textOutput, usage: reportedUsage, ...extras },
});
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
});
const sseResponse = (body, status = 200) => new Response(body, {
    status, headers: { 'content-type': 'text/event-stream' },
});

function inspect(apiId, responseText) {
    return inspectResponseOutcome({
        apiId, responseText, ...getProxyApi(apiId).extractResponseMetadata(responseText),
    });
}

function createService(apiId = 'responses', mode = 'subscription', accountingError = null) {
    const recorded = [];
    const reservations = [];
    let resolveCalls = 0;
    const record = async (payload) => {
        recorded.push(payload);
        if (accountingError) throw accountingError;
    };
    const service = new ProxyService({
        paymentConfigService: { async getBillingConfig() { return { rechargeEnabled: false }; } },
        userLookup: async () => ({ username: 'alice' }),
        requestAccountingService: { recordUsageOnly: record, settle: record },
        subscriptionService: {
            async resolveUsageAccess({ requestId }) {
                return {
                    mode,
                    subscription: mode === 'subscription' ? { active: true, planId: 'plan-test' } : null,
                    appliedLimit: { externalModelName: 'visible-model', quotaConsumptionEnabled: true },
                    quotaReservation: { requestId },
                };
            },
            async completeUsageReservation(payload) { reservations.push(payload); },
        },
        modelResolutionService: {
            async resolveModelContext() {
                resolveCalls += 1;
                assert.ok(resolveCalls < 3, 'Unexpected upstream retry loop');
                return {
                    provider: { id: 'provider-test', name: 'Upstream A', apiBaseUrl: 'https://upstream.example/v1', apiKey: 'test-key' },
                    model: {
                        id: 'billing-model', name: 'visible-model', upstreamModel: 'actual-upstream-model', upstreamApi: apiId,
                        pricing: { inputPerMillionTokens: 100, outputPerMillionTokens: 100, priceMultiplier: 1 },
                    },
                    sourceModel: { id: 'source-test' }, externalModel: { name: 'visible-model' },
                };
            },
        },
    });
    return { service, recorded, reservations, get resolveCalls() { return resolveCalls; } };
}

async function forward(service, apiId = 'responses', stream = true) {
    return service.forwardRequest({
        apiId, username: 'alice', requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        body: apiId === 'responses'
            ? { model: 'visible-model', input: 'hello', stream }
            : { model: 'visible-model', messages: [{ role: 'user', content: 'hello' }], max_tokens: 100, stream },
    });
}

for (const status of ['failed', 'incomplete']) {
    test(`HTTP 200 streaming ${status} is a failure with retained usage, released quota and no retry`, async (t) => {
        let fetchCalls = 0;
        t.mock.method(global, 'fetch', async () => {
            fetchCalls += 1;
            return sseResponse(terminal(status, status === 'failed'
                ? { error: { code: 'quota_exceeded', message: 'Quota exhausted' } }
                : { incomplete_details: { reason: 'max_output_tokens' } }));
        });
        const ctx = createService();
        const result = await forward(ctx.service);
        const delivered = await new Response(result.stream).text();
        await result.completion;
        assert.equal(fetchCalls, 1);
        assert.equal(ctx.resolveCalls, 1);
        assert.match(delivered, new RegExp(`response\\.${status}`));
        assert.doesNotMatch(delivered, /response\.completed/);
        assert.equal(ctx.recorded.length, 1);
        const payload = ctx.recorded[0];
        assert.equal(payload.success, false);
        assert.equal(payload.actualAmountUsd, 0);
        assert.equal(payload.requestSummary.inputTokens, 20);
        assert.equal(payload.requestSummary.outputTokens, 7);
        assert.equal(payload.requestSummary.responseDiagnostics.responseStatus, status);
        assert.equal(payload.requestSummary.responseDiagnostics.usageStatus, 'reported');
        assert.equal(ctx.reservations[0].success, false);
    });
}

test('Responses stream without a terminal event delivers an error and records failure', async (t) => {
    t.mock.method(global, 'fetch', async () => sseResponse(
        event('response.created', { response: { id: 'resp_test', status: 'in_progress', usage: reportedUsage } })
        + event('response.output_text.delta', { delta: 'hello' }) + 'data: [DONE]\n\n'
    ));
    const ctx = createService();
    const result = await forward(ctx.service);
    const delivered = await new Response(result.stream).text();
    await result.completion;
    assert.match(delivered, /upstream_stream_truncated/);
    assert.doesNotMatch(delivered, /response\.completed/);
    assert.equal(ctx.recorded[0].success, false);
    assert.equal(ctx.recorded[0].actualAmountUsd, 0);
    assert.equal(ctx.recorded[0].requestSummary.responseDiagnostics.hasOutput, true);
    assert.equal(ctx.reservations[0].success, false);
});

test('transport failure retains partial usage and records total latency, not headers latency', async (t) => {
    let now = 1000;
    let controller;
    t.mock.method(Date, 'now', () => now);
    const stream = new ReadableStream({ start(value) { controller = value; } });
    t.mock.method(global, 'fetch', async () => sseResponse(stream));
    const ctx = createService();
    const result = await forward(ctx.service);
    const delivered = new Response(result.stream).text();
    // Capture a complete initial usage event before the connection breaks.
    controller.enqueue(new TextEncoder().encode(event('response.created', {
        response: { id: 'resp_test', status: 'in_progress', usage: reportedUsage },
    })));
    await new Promise((resolve) => setImmediate(resolve));
    now = 1500;
    controller.error(new Error('socket terminated'));
    await assert.rejects(delivered, /socket terminated/);
    await result.completion;
    assert.equal(ctx.recorded.length, 1);
    const summary = ctx.recorded[0].requestSummary;
    assert.equal(summary.inputTokens, 20);
    assert.equal(summary.latencyMs, 500);
    assert.equal(summary.responseDiagnostics.headerLatencyMs, 0);
    assert.equal(summary.responseDiagnostics.responseStatus, 'truncated');
    assert.equal(summary.responseDiagnostics.errorCode, 'upstream_stream_read_error');
    assert.equal(ctx.recorded[0].actualAmountUsd, 0);
    assert.equal(ctx.reservations[0].success, false);
});

for (const body of [{ error: { code: 'invalid_request', message: 'Invalid upstream request' } }, { output: [], status: 'completed' }, {}]) {
    test(`HTTP 200 JSON is not success without output: ${JSON.stringify(body)}`, async (t) => {
        t.mock.method(global, 'fetch', async () => jsonResponse(body));
        const ctx = createService('responses', 'balance');
        const result = await forward(ctx.service, 'responses', false);
        assert.equal(result.status, 502);
        assert.equal(ctx.recorded[0].success, false);
        assert.equal(ctx.recorded[0].actualAmountUsd, 0);
    });
}

test('failed HTTP 200 JSON retains reported tokens without charging the balance', async (t) => {
    t.mock.method(global, 'fetch', async () => jsonResponse({
        status: 'failed', error: { code: 'server_error', message: 'Upstream failure' }, usage: reportedUsage,
    }));
    const ctx = createService('responses', 'balance');
    const result = await forward(ctx.service, 'responses', false);
    assert.equal(result.status, 502);
    assert.equal(ctx.recorded[0].requestSummary.outputTokens, 7);
    assert.equal(ctx.recorded[0].actualAmountUsd, 0);
});

for (const usage of [null, {}, { input_tokens: 0, output_tokens: 0 }]) {
    test(`real output distinguishes missing usage from reported zero: ${JSON.stringify(usage)}`, async (t) => {
        t.mock.method(global, 'fetch', async () => jsonResponse({ status: 'completed', output: textOutput, usage }));
        const ctx = createService();
        const result = await forward(ctx.service, 'responses', false);
        assert.equal(result.status, 200);
        assert.equal(ctx.recorded[0].success, true);
        assert.equal(ctx.recorded[0].requestSummary.responseDiagnostics.usageStatus, hasReportedUsage(usage) ? 'reported' : 'missing');
        assert.equal(ctx.reservations[0].success, true);
    });
}

for (const output of [
    [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'search', arguments: '{}' }],
    [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Cannot help with that.' }] }],
]) {
    test(`Responses ${output[0].type} output in terminal-only envelope is legitimate success`, async (t) => {
        t.mock.method(global, 'fetch', async () => sseResponse(terminal('completed', { output })));
        const ctx = createService();
        const result = await forward(ctx.service);
        await new Response(result.stream).text();
        await result.completion;
        assert.equal(ctx.recorded[0].success, true);
        assert.ok(ctx.recorded[0].actualAmountUsd > 0);
        const metadata = getProxyApi('responses').extractResponseMetadata(terminal('completed', { output }));
        assert.deepEqual(metadata.parsedResponse.output, output);
        assert.deepEqual(metadata.usage, reportedUsage);
    });
}

test('non-2xx SSE is buffered so quota failure can retry before stream delivery', async (t) => {
    let fetchCalls = 0;
    t.mock.method(global, 'fetch', async () => ++fetchCalls === 1
        ? sseResponse(event('error', { error: { code: 'usage_limit_reached', message: 'quota exhausted' } }), 429)
        : sseResponse(terminal('completed')));
    const ctx = createService();
    const result = await forward(ctx.service);
    await new Response(result.stream).text();
    await result.completion;
    assert.equal(fetchCalls, 2);
    assert.equal(ctx.recorded.length, 1);
    assert.equal(ctx.recorded[0].success, true);
    assert.deepEqual(ctx.reservations.map((item) => item.success), [false, true]);
});

test('stream accounting failure does not trigger a second settlement or upstream retry', async (t) => {
    let fetchCalls = 0;
    t.mock.method(global, 'fetch', async () => { fetchCalls += 1; return sseResponse(terminal('completed')); });
    const ctx = createService('responses', 'subscription', new Error('database unavailable'));
    const result = await forward(ctx.service);
    await new Response(result.stream).text();
    await result.completion;
    assert.equal(fetchCalls, 1);
    assert.equal(ctx.recorded.length, 1);
    assert.equal(ctx.reservations.length, 1);
});

test('failed stream releases subscription quota even when diagnostic persistence fails', async (t) => {
    t.mock.method(global, 'fetch', async () => sseResponse(terminal('failed')));
    const ctx = createService('responses', 'subscription', new Error('database unavailable'));
    const result = await forward(ctx.service);
    await new Response(result.stream).text();
    await result.completion;
    assert.equal(ctx.recorded.length, 1);
    assert.equal(ctx.reservations.length, 1);
    assert.equal(ctx.reservations[0].success, false);
});

test('cross-protocol failed Responses output is not synthesized as a successful Chat stream', async (t) => {
    t.mock.method(global, 'fetch', async () => sseResponse(terminal('failed')));
    const ctx = createService();
    const result = await forward(ctx.service, 'chat_completions');
    assert.equal(result.status, 502);
    assert.equal(result.type, 'json');
    assert.equal(ctx.recorded[0].success, false);
    assert.equal(ctx.recorded[0].actualAmountUsd, 0);
});

test('buffered truncated Responses stream retains tokens and reports failure', async (t) => {
    const stream = new ReadableStream({
        async start(controller) {
            controller.enqueue(new TextEncoder().encode(terminal('completed')));
            await new Promise((resolve) => setImmediate(resolve));
            controller.error(new Error('socket terminated'));
        },
    });
    t.mock.method(global, 'fetch', async () => sseResponse(stream));
    const ctx = createService();
    const result = await forward(ctx.service, 'chat_completions');
    assert.equal(result.status, 502);
    assert.equal(result.payload.error.code, 'upstream_stream_read_error');
    assert.equal(ctx.recorded[0].requestSummary.inputTokens, 20);
    assert.equal(ctx.recorded[0].actualAmountUsd, 0);
});

test('generic Responses error event is forwarded as error, not completion, and records failure', async (t) => {
    t.mock.method(global, 'fetch', async () => sseResponse(event('error', { code: 'upstream_failure', message: 'Failed', usage: reportedUsage })));
    const ctx = createService();
    const result = await forward(ctx.service);
    const delivered = await new Response(result.stream).text();
    await result.completion;
    assert.match(delivered, /event: error/);
    assert.doesNotMatch(delivered, /response\.completed/);
    assert.equal(ctx.recorded[0].success, false);
    assert.equal(ctx.recorded[0].requestSummary.inputTokens, 20);
});

test('Chat SSE requires finish_reason rather than DONE alone, but accepts streamed refusals and tools', () => {
    const chunk = (choice) => `data: ${JSON.stringify({ id: 'chat_test', choices: [choice] })}\n\n`;
    assert.equal(inspect('chat_completions', chunk({ delta: { content: 'hello' } }) + 'data: [DONE]\n\n').success, false);
    for (const delta of [
        { refusal: 'Cannot help with that.' },
        { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search', arguments: '{}' } }] },
        { function_call: { name: 'search', arguments: '{}' } },
        { audio: { id: 'audio_1', data: 'audio' } },
    ]) {
        assert.equal(inspect('chat_completions', chunk({ delta }) + chunk({ delta: {}, finish_reason: 'stop' })).success, true);
    }
});

test('Messages SSE requires message_stop and preserves usage on errors', () => {
    const text = event('message_start', { message: { id: 'msg_test', usage: reportedUsage } })
        + event('content_block_start', { index: 0, content_block: { type: 'text', text: 'hello' } });
    assert.equal(inspect('messages', text).diagnostics.responseStatus, 'truncated');
    assert.equal(inspect('messages', text + event('message_stop')).success, true);
    const failure = inspect('messages', text + event('error', { error: { type: 'overloaded_error', message: 'overloaded' } }));
    assert.equal(failure.success, false);
    assert.equal(failure.diagnostics.usageStatus, 'reported');
    assert.equal(failure.diagnostics.errorCode, 'overloaded_error');
});

test('error-only SSE retains reported usage even without any model output', () => {
    for (const apiId of ['responses', 'chat_completions', 'messages']) {
        const text = event('error', { error: { code: 'server_error', message: 'failure' }, usage: reportedUsage });
        const metadata = getProxyApi(apiId).extractResponseMetadata(text);
        assert.deepEqual(metadata.usage, reportedUsage);
        assert.equal(inspect(apiId, text).success, false);
    }
});

test('usage field detection rejects invalid values but accepts nested billing costs', () => {
    for (const usage of [null, {}, { input_tokens: null }, { input_tokens: '' }, { input_tokens: false }, { input_tokens: -1 }]) {
        assert.equal(hasReportedUsage(usage), false);
    }
    assert.equal(hasReportedUsage({ billing: { cost: 0 } }), true);
});
