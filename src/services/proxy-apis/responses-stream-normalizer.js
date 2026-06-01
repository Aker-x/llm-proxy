function parseJsonText(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function findSseBoundary(value) {
    const lfIndex = value.indexOf('\n\n');
    const crlfIndex = value.indexOf('\r\n\r\n');

    if (lfIndex < 0 && crlfIndex < 0) {
        return null;
    }

    if (lfIndex < 0) {
        return { index: crlfIndex, length: 4 };
    }

    if (crlfIndex < 0 || lfIndex < crlfIndex) {
        return { index: lfIndex, length: 2 };
    }

    return { index: crlfIndex, length: 4 };
}

function readSseBlock(rawBlock) {
    const lines = String(rawBlock || '').split(/\r?\n/);
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

    const dataText = dataLines.join('\n').trim();
    return {
        eventName,
        dataText,
        data: dataText && dataText !== '[DONE]' ? parseJsonText(dataText) : null,
    };
}

function buildResponseCompletedEvent(response, sequenceNumber) {
    const responseId = String(response?.id || '').trim() || `resp_${Date.now()}`;
    const completedResponse = {
        object: 'response',
        output: [],
        ...response,
        id: responseId,
        status: 'completed',
    };

    return [
        'event: response.completed',
        `data: ${JSON.stringify({
            type: 'response.completed',
            sequence_number: sequenceNumber,
            response: completedResponse,
        })}`,
        '',
        '',
    ].join('\n');
}

function ensureBlankLineSuffix(value) {
    if (!value) {
        return '';
    }

    return /\r?\n\r?\n$/.test(value) ? value : `${value.replace(/\s*$/, '')}\n\n`;
}

function normalizeResponsesStreamCompletion(stream, options = {}) {
    if (!stream || typeof stream.pipeThrough !== 'function') {
        return stream;
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const onInjected = typeof options.onInjected === 'function' ? options.onInjected : null;
    let buffer = '';
    let sawCompleted = false;
    let sawDone = false;
    let injected = false;
    let latestSequenceNumber = 0;
    let latestResponse = null;

    const injectCompletion = () => {
        if (sawCompleted || injected) {
            return '';
        }

        injected = true;
        if (onInjected) {
            onInjected();
        }
        return buildResponseCompletedEvent(latestResponse, latestSequenceNumber + 1);
    };

    const observeBlock = (rawBlock) => {
        const parsed = readSseBlock(rawBlock);
        const payload = parsed.data;

        if (parsed.dataText === '[DONE]') {
            sawDone = true;
            return `${injectCompletion()}${rawBlock}`;
        }

        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const sequenceNumber = Number(payload.sequence_number);
            if (Number.isFinite(sequenceNumber) && sequenceNumber > latestSequenceNumber) {
                latestSequenceNumber = sequenceNumber;
            }

            if (payload.response && typeof payload.response === 'object' && !Array.isArray(payload.response)) {
                latestResponse = {
                    ...(latestResponse || {}),
                    ...payload.response,
                };
            }

            if (parsed.eventName === 'response.completed' || payload.type === 'response.completed') {
                sawCompleted = true;
            }
        }

        return rawBlock;
    };

    return stream.pipeThrough(new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true });

            while (true) {
                const boundary = findSseBoundary(buffer);
                if (!boundary) {
                    break;
                }

                const rawBlock = buffer.slice(0, boundary.index + boundary.length);
                buffer = buffer.slice(boundary.index + boundary.length);
                controller.enqueue(encoder.encode(observeBlock(rawBlock)));
            }
        },

        flush(controller) {
            const remainingDecoded = decoder.decode();
            if (remainingDecoded) {
                buffer += remainingDecoded;
            }

            if (buffer) {
                const rawBlock = ensureBlankLineSuffix(buffer);
                buffer = '';
                controller.enqueue(encoder.encode(observeBlock(rawBlock)));
            }

            if (!sawDone) {
                controller.enqueue(encoder.encode(`${injectCompletion()}data: [DONE]\n\n`));
            }
        },
    }));
}

module.exports = {
    normalizeResponsesStreamCompletion,
};
