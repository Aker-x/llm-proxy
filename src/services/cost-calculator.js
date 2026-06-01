const { toNonNegativeNumber } = require('../utils/normalizers');

function getPricingValue(pricing, canonicalKey, legacyKey) {
    return toNonNegativeNumber(
        pricing?.[canonicalKey],
        toNonNegativeNumber(pricing?.[legacyKey])
    );
}

function resolveUsageTokenCount(primaryValue, fallbackValue) {
    const normalizedPrimary = toNonNegativeNumber(primaryValue, null);
    const normalizedFallback = toNonNegativeNumber(fallbackValue, null);

    if (normalizedPrimary === null) {
        return normalizedFallback ?? 0;
    }

    if (normalizedPrimary > 0 || normalizedFallback === null || normalizedFallback === 0) {
        return normalizedPrimary;
    }

    return normalizedFallback;
}

function calculateCost(usage, pricing) {
    const inputTokens = resolveUsageTokenCount(
        usage?.input_tokens,
        usage?.prompt_tokens
    );
    const outputTokens = resolveUsageTokenCount(
        usage?.output_tokens,
        usage?.completion_tokens
    );
    const thinkingTokens = toNonNegativeNumber(usage?.thinking_tokens);
    const cacheReadTokens = toNonNegativeNumber(
        usage?.cache_read_input_tokens
            ?? usage?.cache_read_tokens
            ?? usage?.input_tokens_details?.cached_tokens
            ?? usage?.prompt_tokens_details?.cached_tokens
    );
    const cacheCreationTokens = toNonNegativeNumber(
        usage?.cache_creation_input_tokens
            ?? usage?.cache_creation_tokens
            ?? usage?.input_tokens_details?.cache_write_tokens
            ?? usage?.prompt_tokens_details?.cache_write_tokens
    );
    const billableInputTokens = Math.max(0, inputTokens - cacheReadTokens);
    const inputPricePerMillionTokens = getPricingValue(pricing, 'inputPerMillionTokens', 'inputPer1kTokens');
    const outputPricePerMillionTokens = getPricingValue(pricing, 'outputPerMillionTokens', 'outputPer1kTokens');
    const cachedInputPricePerMillionTokens = getPricingValue(pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens');
    const cacheCreationPricePerMillionTokens = getPricingValue(pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens');
    // Thinking/reasoning tokens may be charged at a different (typically lower) rate
    const thinkingPricePerMillionTokens = getPricingValue(pricing, 'thinkingPerMillionTokens', null);
    const priceMultiplier = toNonNegativeNumber(pricing?.priceMultiplier, 1);

    const inputCost = (billableInputTokens / 1000000) * inputPricePerMillionTokens;
    const outputCost = (outputTokens / 1000000) * outputPricePerMillionTokens;
    const cacheReadCost = (cacheReadTokens / 1000000) * cachedInputPricePerMillionTokens;
    const cacheCreationCost = (cacheCreationTokens / 1000000) * cacheCreationPricePerMillionTokens;

    // Subtract thinking tokens from output cost; charge them at thinking rate (default = same as output rate)
    const nonThinkingOutputTokens = Math.max(0, outputTokens - thinkingTokens);
    const outputCostAdjusted = ((nonThinkingOutputTokens / 1000000) * outputPricePerMillionTokens)
        + ((thinkingTokens / 1000000) * thinkingPricePerMillionTokens);

    const calculatedUsageCost = (inputCost + outputCostAdjusted + cacheReadCost + cacheCreationCost) * priceMultiplier;
    const upstreamReportedCost = toNonNegativeNumber(
        usage?.cost ?? usage?.total_cost ?? usage?.billing?.cost,
        null
    );
    const usageCost = upstreamReportedCost !== null && calculatedUsageCost === 0
        ? upstreamReportedCost
        : calculatedUsageCost;
    const totalCost = usageCost;

    return {
        inputTokens,
        outputTokens,
        thinkingTokens,
        cacheReadTokens,
        cacheCreationTokens,
        billableInputTokens,
        inputCost: Number(inputCost.toFixed(6)),
        outputCost: Number(outputCost.toFixed(6)),
        thinkingCost: Number(((thinkingTokens / 1000000) * thinkingPricePerMillionTokens).toFixed(6)),
        cacheReadCost: Number(cacheReadCost.toFixed(6)),
        cacheCreationCost: Number(cacheCreationCost.toFixed(6)),
        upstreamReportedCost: upstreamReportedCost === null ? null : Number(upstreamReportedCost.toFixed(6)),
        totalCost: Number(totalCost.toFixed(6)),
        currency: pricing?.currency || 'USD',
        priceMultiplier,
    };
}

module.exports = {
    calculateCost,
};
