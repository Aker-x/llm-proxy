class PgStatsEventRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async create(event) {
        const result = await this.pool.query(`
            INSERT INTO stats_events (
                request_id,
                username,
                provider_id,
                model_id,
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
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10, $11, $12, $13, NOW()
            )
            ON CONFLICT (request_id) DO NOTHING
            RETURNING *
        `, [
            event.requestId,
            event.username || null,
            event.providerId,
            event.modelId,
            Boolean(event.success),
            Number(event.inputTokens || 0),
            Number(event.outputTokens || 0),
            Number(event.thinkingTokens || 0),
            Number(event.cacheReadTokens || 0),
            Number(event.cacheCreationTokens || 0),
            Number(event.totalCost || 0),
            String(event.currency || 'USD'),
            Number(event.latencyMs || 0),
        ]);

        return result.rows[0] || null;
    }
}

module.exports = {
    PgStatsEventRepository,
};
