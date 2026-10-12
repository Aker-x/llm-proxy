// Unlike Response.text(), retain the bytes received before a transport failure.
async function readResponseStream(stream) {
    if (!stream) return { responseText: '', streamReadError: null };
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks = [];
    let streamReadError = null;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        streamReadError = error;
    } finally {
        chunks.push(decoder.decode());
        reader.releaseLock();
    }
    return { responseText: chunks.join(''), streamReadError };
}

module.exports = { readResponseStream };
