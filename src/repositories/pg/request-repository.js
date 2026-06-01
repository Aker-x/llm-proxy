class PgRequestRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async createRecentRequest(request) {
        const result = await this.pool.query(`
            INSERT INTO recent_requests (
                request_id,
                username,
                provider_id,
                provider_name,
                model_id,
                model_name,
                accounting_mode,
                subscription_plan_id,
                subscription_quota_charged,
                success,
                input_tokens,
                output_tokens,
                thinking_tokens,
                cache_read_tokens,
                cache_creation_tokens,
                total_cost,
                currency,
                latency_ms,
                created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
            )
            ON CONFLICT (request_id) DO NOTHING
            RETURNING *
        `, [
            request.requestId,
            request.username,
            request.providerId,
            request.providerName,
            request.modelId,
            request.modelName,
            String(request.accountingMode || 'balance'),
            request.subscriptionPlanId || null,
            request.subscriptionQuotaCharged !== false,
            Boolean(request.success),
            Number(request.inputTokens || 0),
            Number(request.outputTokens || 0),
            Number(request.thinkingTokens || 0),
            Number(request.cacheReadTokens || 0),
            Number(request.cacheCreationTokens || 0),
            Number(request.totalCost || 0),
            String(request.currency || 'USD'),
            Number(request.latencyMs || 0),
        ]);

        return result.rows[0] || null;
    }

    async listRecentRequestsByUsername(username, limit = 20) {
        const result = await this.pool.query(`
            SELECT *
            FROM recent_requests
            WHERE username = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2
        `, [username, Number(limit)]);

        return result.rows;
    }
}

module.exports = {
    PgRequestRepository,
};
