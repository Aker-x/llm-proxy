const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { createProxyController } = require('../src/controllers/proxy-controller');

function createResponseSink() {
    const chunks = [];
    const headers = new Map([['X-Proxy-Request-Id', 'request-test']]);
    const sink = new Writable({ write(chunk, encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    sink.status = () => sink;
    sink.setHeader = (name, value) => headers.set(name, value);
    sink.getHeader = (name) => headers.get(name);
    return { sink, chunks };
}

const request = { body: {}, currentSession: { username: 'alice' }, requestId: 'request-test', headers: {} };

test('stream controller waits for delivery and analysis completion', async () => {
    let finishAnalysis;
    const completion = new Promise((resolve) => { finishAnalysis = resolve; });
    const stream = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hello\n\n'));
        controller.close();
    } });
    const controller = createProxyController({ proxyService: {
        async forwardRequest() { return { type: 'stream', status: 200, stream, completion }; },
    } });
    const { sink, chunks } = createResponseSink();
    const delivered = new Promise((resolve) => sink.on('finish', resolve));
    let completed = false;
    const result = controller.createResponse(request, sink).then(() => { completed = true; });
    await delivered;
    assert.equal(completed, false);
    finishAnalysis();
    await result;
    assert.equal(completed, true);
    assert.equal(chunks.join(''), 'data: hello\n\n');
});

test('stream controller handles upstream read errors without an unhandled pipe error', async (t) => {
    const warnings = [];
    t.mock.method(console, 'warn', (...args) => warnings.push(args.join(' ')));
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('socket terminated')); } });
    const controller = createProxyController({ proxyService: {
        async forwardRequest() { return { type: 'stream', status: 200, stream, completion: Promise.resolve() }; },
    } });
    const { sink } = createResponseSink();
    await controller.createResponse(request, sink);
    assert.equal(sink.destroyed, true);
    assert.match(warnings.join(' '), /request-test.*socket terminated/);
});
