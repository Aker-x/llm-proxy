const { parseJsonText, parseSseEvents } = require('./usage-parsers');
const { summarizeText } = require('./shared');

function hasContent(content) {
    if (typeof content === 'string') {
        return Boolean(content.trim());
    }
    return Array.isArray(content) && content.some((part) => (
        Boolean(part?.text?.trim?.() || part?.refusal?.trim?.() || part?.thinking?.trim?.())
        || ['tool_use', 'image', 'audio'].includes(part?.type)
    ));
}

function hasResponseOutput(body) {
    if (!body || typeof body !== 'object') {
        return false;
    }
    if (Array.isArray(body.output)) {
        return body.output.some((item) => item && (
            item.type === 'message'
                ? hasContent(item.content)
                : Boolean(item.type && item.type !== 'reasoning')
        ));
    }
    if (Array.isArray(body.choices)) {
        return body.choices.some((choice) => (
            hasContent(choice?.message?.content)
            || Boolean(choice?.message?.tool_calls?.length || choice?.message?.function_call
                || choice?.message?.refusal || choice?.message?.audio)
        ));
    }
    return hasContent(body.content);
}

function hasReportedUsage(usage) {
    if (!usage || typeof usage !== 'object') return false;
    return Object.entries(usage).some(([key, value]) => (
        value && typeof value === 'object' ? hasReportedUsage(value)
            : /tokens|cost/.test(key) && ['number', 'string'].includes(typeof value)
                && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
    ));
}

function inspectResponseOutcome({ apiId, responseText, parsedResponse, usage, streamReadError = null }) {
    const isJson = Boolean(parseJsonText(responseText));
    const events = isJson ? [] : parseSseEvents(responseText);
    let error = parsedResponse?.error || null;
    let status = String(parsedResponse?.status || '').toLowerCase();
    let terminalEvent = null;
    let lastEvent = null;
    let completed = isJson;
    let observedOutput = false;

    for (const event of events) {
        const payload = event.data;
        const type = String(payload?.type || event.event || (event.dataText === '[DONE]' ? '[DONE]' : '')).trim();
        if (type) lastEvent = type;
        if (['response.output_text.delta', 'response.output_text.done', 'response.refusal.delta', 'response.refusal.done'].includes(type)) {
            observedOutput ||= Boolean((payload?.delta || payload?.text || payload?.refusal || '').trim());
        }
        if (type === 'response.output_item.added' || type === 'response.output_item.done') {
            observedOutput ||= hasResponseOutput({ output: [payload?.item] });
        }
        if (payload?.error || type === 'error' || type === 'response.failed') {
            error = payload?.error || payload?.response?.error || {
                code: payload?.code || 'upstream_stream_error',
                message: payload?.message || 'Upstream stream returned an error.',
            };
            terminalEvent = type || 'error';
        }
        if (type === 'response.incomplete' || payload?.response?.status === 'incomplete') {
            status = 'incomplete';
            terminalEvent = 'response.incomplete';
        }
        if (apiId === 'responses' || apiId === 'responses_compact') {
            if (type === 'response.completed') {
                completed = true;
                if (!error && status !== 'incomplete') terminalEvent = type;
            }
        } else if (apiId === 'messages') {
            if (type === 'message_stop') {
                completed = true;
                if (!error) terminalEvent = type;
            }
        } else if (Array.isArray(payload?.choices) && payload.choices.some((choice) => choice.finish_reason)) {
            completed = true;
            if (!error) terminalEvent = 'finish_reason';
        }
    }

    const diagnostics = {
        responseStatus: 'completed',
        usageStatus: hasReportedUsage(usage) ? 'reported' : 'missing',
        hasOutput: hasResponseOutput(parsedResponse) || observedOutput,
        terminalEvent,
        lastEvent,
        eventCount: events.length,
        responseBytes: Buffer.byteLength(String(responseText || ''), 'utf8'),
    };
    if (streamReadError) {
        diagnostics.responseStatus = 'truncated';
        error = { code: 'upstream_stream_read_error', message: streamReadError.message || String(streamReadError) };
    } else if (error || ['failed', 'cancelled'].includes(status)) {
        diagnostics.responseStatus = 'failed';
        error = error || { code: 'upstream_response_failed', message: `Upstream response status: ${status}.` };
    } else if (status === 'incomplete') {
        diagnostics.responseStatus = 'incomplete';
        error = { code: 'upstream_response_incomplete', message: parsedResponse?.incomplete_details?.reason || 'Upstream response is incomplete.' };
    } else if (!isJson && !completed) {
        diagnostics.responseStatus = 'truncated';
        error = { code: 'upstream_stream_truncated', message: 'Upstream stream ended without a completion event.' };
    } else if (isJson && ['in_progress', 'queued'].includes(status)) {
        diagnostics.responseStatus = 'incomplete';
        error = { code: 'upstream_response_incomplete', message: `Upstream response is still ${status}.` };
    } else if (!diagnostics.hasOutput) {
        diagnostics.responseStatus = 'empty';
        error = { code: 'upstream_empty_response', message: 'Upstream returned no model output or tool call.' };
    }

    if (error) {
        diagnostics.errorCode = typeof error === 'object' ? error.code || error.type || 'upstream_response_error' : 'upstream_response_error';
        diagnostics.errorMessage = summarizeText(typeof error === 'string' ? error : error.message || JSON.stringify(error));
    }
    return { success: diagnostics.responseStatus === 'completed', diagnostics };
}

module.exports = { inspectResponseOutcome, hasReportedUsage };
