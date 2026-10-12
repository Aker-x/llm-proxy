const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PgRequestRepository } = require('../src/repositories/pg/request-repository');
const { PgStatsService } = require('../src/services/pg-stats-service');

const diagnostics = { responseStatus: 'truncated', usageStatus: 'missing', errorCode: 'upstream_stream_truncated' };

test('recent request repository persists diagnostics as bound JSON and preserves legacy NULL', async () => {
    const calls = [];
    const repository = new PgRequestRepository({ pool: {
        async query(sql, values) { calls.push({ sql, values }); return { rows: [{ id: 1 }] }; },
    } });
    await repository.createRecentRequest({ requestId: 'request-test', responseDiagnostics: diagnostics });
    await repository.createRecentRequest({ requestId: 'request-legacy' });
    assert.match(calls[0].sql, /response_diagnostics/);
    assert.match(calls[0].sql, /\$19::jsonb/);
    assert.equal(calls[0].values.length, 19);
    assert.deepEqual(JSON.parse(calls[0].values[18]), diagnostics);
    assert.equal(calls[1].values[18], null);
});

test('recent stats expose request IDs and diagnostics without treating legacy zero as missing', async () => {
    const service = new PgStatsService({ usageStatsRepository: {
        async getRecentRequests() {
            return [
                { request_id: 'request-test', response_diagnostics: diagnostics, input_tokens: 20 },
                { request_id: 'request-legacy', input_tokens: 0 },
            ];
        },
    } });
    const rows = await service.getRecentRequests();
    assert.equal(rows[0].requestId, 'request-test');
    assert.deepEqual(rows[0].responseDiagnostics, diagnostics);
    assert.equal(rows[0].inputTokens, 20);
    assert.equal(rows[1].responseDiagnostics, null);
    assert.equal(rows[1].inputTokens, 0);
});

async function loadFrontend(relativePath) {
    const source = await fs.readFile(path.join(__dirname, '..', relativePath), 'utf8');
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

for (const kind of ['admin', 'user']) {
    test(`${kind} recent request UI distinguishes missing usage, reported zero and legacy records`, async () => {
        const body = { innerHTML: '' };
        const { escapeHtml } = await loadFrontend('public/assets/shared/format.js');
        const helpers = {
            applyTableSort: (items) => items,
            escapeHtml,
            formatDateTime: (value) => value || '-',
            formatMoney: (value) => `${Number(value || 0).toFixed(3)} USD`,
            formatNumber: (value) => String(value || 0),
            getStatusBadge: (text) => `<span>${text}</span>`,
        };
        let renderer;
        if (kind === 'admin') {
            const { createUsersStatsModule } = await loadFrontend('public/assets/admin/users-stats.js');
            renderer = createUsersStatsModule({ adminRecentRequestsBody: body, ...helpers });
        } else {
            const { createUserRenderingModule } = await loadFrontend('public/assets/user/rendering.js');
            renderer = createUserRenderingModule({ elements: { userRecentRequestsBody: body }, helpers });
        }
        renderer.renderRecentRequests([{ success: true, totalCost: 0, responseDiagnostics: { usageStatus: 'missing' } }]);
        if (kind === 'admin') {
            assert.match(body.innerHTML, /用量缺失/);
        } else {
            assert.doesNotMatch(body.innerHTML, /用量缺失/);
        }
        assert.match(body.innerHTML, /成功/);
        assert.match(body.innerHTML, /<td>—<\/td>/);
        assert.doesNotMatch(body.innerHTML, /0\.000 USD/);
        for (const responseDiagnostics of [null, { usageStatus: 'reported' }]) {
            renderer.renderRecentRequests([{ success: true, totalCost: 0, responseDiagnostics }]);
            assert.doesNotMatch(body.innerHTML, /用量缺失|—/);
            assert.match(body.innerHTML, /0\.000 USD/);
        }
        renderer.renderRecentRequests([{
            success: false, totalCost: 0, requestId: 'request-test',
            responseDiagnostics: { ...diagnostics, errorMessage: '<img src=x onerror=alert(1)>' },
        }]);
        assert.match(body.innerHTML, /失败/);
        if (kind === 'admin') {
            assert.match(body.innerHTML, /未完成/);
            assert.match(body.innerHTML, /&lt;img/);
        } else {
            assert.doesNotMatch(body.innerHTML, /用量缺失|未完成|upstream_stream_truncated|onerror/);
        }
        assert.match(body.innerHTML, /request-test/);
        assert.doesNotMatch(body.innerHTML, /<img/);
        assert.match(body.innerHTML, /0\.000 USD/);
    });
}
