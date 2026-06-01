class PgUsageStatsRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getTotals() {
        const result = await this.pool.query(`
            SELECT
                COUNT(*)::bigint AS requests,
                COUNT(*) FILTER (WHERE success)::bigint AS success_requests,
                COUNT(*) FILTER (WHERE NOT success)::bigint AS failed_requests,
                COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
                COALESCE(SUM(total_cost), 0)::numeric AS total_cost,
                MAX(currency) AS currency,
                MAX(created_at) AS last_updated_at
            FROM recent_requests
        `);

        return result.rows[0] || null;
    }

    async getUsers() {
        const result = await this.pool.query(`
            SELECT
                username,
                COUNT(*)::bigint AS requests,
                COUNT(*) FILTER (WHERE success)::bigint AS success_requests,
                COUNT(*) FILTER (WHERE NOT success)::bigint AS failed_requests,
                COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
                COALESCE(SUM(total_cost), 0)::numeric AS total_cost,
                MAX(currency) AS currency,
                MAX(created_at) AS last_used_at
            FROM recent_requests
            GROUP BY username
            ORDER BY total_cost DESC, requests DESC, username
        `);

        return result.rows;
    }

    async getProviders() {
        const result = await this.pool.query(`
            SELECT
                provider_id,
                provider_name,
                COUNT(*)::bigint AS requests,
                COUNT(*) FILTER (WHERE success)::bigint AS success_requests,
                COUNT(*) FILTER (WHERE NOT success)::bigint AS failed_requests,
                COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
                COALESCE(SUM(total_cost), 0)::numeric AS total_cost,
                MAX(created_at) AS last_used_at
            FROM recent_requests
            GROUP BY provider_id, provider_name
            ORDER BY total_cost DESC, requests DESC, provider_name, provider_id
        `);

        return result.rows;
    }

    async getUserModelUsage({ period = 'all', timezone = 'Asia/Shanghai' } = {}) {
        const whereClause = period === 'today'
            ? `WHERE created_at >= (date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1)`
            : '';
        const params = period === 'today' ? [timezone] : [];

        const result = await this.pool.query(`
            SELECT
                username,
                MIN(model_id) AS model_id,
                COALESCE(NULLIF(model_name, ''), model_id) AS model_name,
                COUNT(*)::bigint AS requests,
                COUNT(*) FILTER (WHERE success)::bigint AS success_requests,
                COUNT(*) FILTER (WHERE NOT success)::bigint AS failed_requests,
                COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
                COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens), 0)::bigint AS cache_creation_tokens,
                COALESCE(SUM(total_cost), 0)::numeric AS total_cost,
                MAX(currency) AS currency,
                MAX(created_at) AS last_used_at
            FROM recent_requests
            ${whereClause}
            GROUP BY username, COALESCE(NULLIF(model_name, ''), model_id)
            ORDER BY username, total_cost DESC, requests DESC, model_name
        `, params);

        return result.rows;
    }


    async getRecentRequests(username = null, limit = 100) {
        if (username) {
            const result = await this.pool.query(`
                SELECT *
                FROM recent_requests
                WHERE username = $1
                ORDER BY created_at DESC, id DESC
                LIMIT $2
            `, [username, Number(limit)]);

            return result.rows;
        }

        const result = await this.pool.query(`
            SELECT *
            FROM recent_requests
            ORDER BY created_at DESC, id DESC
            LIMIT $1
        `, [Number(limit)]);

        return result.rows;
    }

    async deleteRecentRequestsOlderThan(cutoffIso) {
        const result = await this.pool.query(`
            DELETE FROM recent_requests
            WHERE created_at < $1
        `, [cutoffIso]);

        return Number(result.rowCount || 0);
    }

    async deleteStatsEventsOlderThan(cutoffIso) {
        const result = await this.pool.query(`
            DELETE FROM stats_events
            WHERE created_at < $1
        `, [cutoffIso]);

        return Number(result.rowCount || 0);
    }

    async deleteUserStats(username) {
        await this.pool.query('DELETE FROM stats_events WHERE username = $1', [username]);
        await this.pool.query('DELETE FROM recent_requests WHERE username = $1', [username]);
    }

    async deleteAllStats() {
        await this.pool.query('DELETE FROM stats_events');
        await this.pool.query('DELETE FROM recent_requests');
    }
}

module.exports = {
    PgUsageStatsRepository,
};
