function estimateTextTokens(value) {
    const text = String(value || '').trim();
    if (!text) {
        return 0;
    }

    return Math.max(1, Math.ceil(Buffer.byteLength(text, 'utf8') / 4));
}

function estimateStructuredTokens(value) {
    if (value === null || value === undefined) {
        return 0;
    }

    if (typeof value === 'string') {
        return estimateTextTokens(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return estimateTextTokens(String(value));
    }

    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + estimateStructuredTokens(item), 0);
    }

    if (typeof value !== 'object') {
        return estimateTextTokens(String(value));
    }

    const blockType = String(value.type || '').trim();
    if (blockType === 'text') {
        return estimateTextTokens(value.text) + 4;
    }

    if (blockType === 'image') {
        return 1200;
    }

    if (blockType === 'tool_use') {
        return estimateTextTokens(value.name) + estimateStructuredTokens(value.input) + 16;
    }

    if (blockType === 'tool_result') {
        return estimateStructuredTokens(value.content) + 12;
    }

    if (blockType === 'thinking' || blockType === 'redacted_thinking') {
        return 0;
    }

    try {
        return estimateTextTokens(JSON.stringify(value));
    } catch {
        return estimateTextTokens(String(value));
    }
}

function estimateMessageTokens(message) {
    const roleTokens = estimateTextTokens(message?.role || 'user');
    const contentTokens = estimateStructuredTokens(message?.content);
    return roleTokens + contentTokens + 8;
}

function estimateSystemTokens(system) {
    if (Array.isArray(system)) {
        return system.reduce((total, block) => total + estimateStructuredTokens(block), 0) + 4;
    }

    return estimateStructuredTokens(system) + 4;
}

function estimateToolTokens(tool) {
    return (
        estimateTextTokens(tool?.name)
        + estimateTextTokens(tool?.description)
        + estimateStructuredTokens(tool?.input_schema)
        + 24
    );
}

function estimateAnthropicMessageInputTokens(body = {}) {
    let total = 12;

    total += estimateSystemTokens(body.system);

    for (const message of Array.isArray(body.messages) ? body.messages : []) {
        total += estimateMessageTokens(message);
    }

    for (const tool of Array.isArray(body.tools) ? body.tools : []) {
        total += estimateToolTokens(tool);
    }

    if (body.tool_choice !== undefined) {
        total += estimateStructuredTokens(body.tool_choice) + 4;
    }

    return Math.max(1, total);
}

module.exports = {
    estimateAnthropicMessageInputTokens,
};
