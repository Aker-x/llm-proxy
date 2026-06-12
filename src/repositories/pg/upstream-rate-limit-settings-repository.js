class PgUpstreamRateLimitSettingsRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getById(id) {
        const result = await this.pool.query(`
            SELECT
                id,
                enabled,
                requests_per_minute,
                updated_at
            FROM upstream_rate_limit_settings
            WHERE id = $1
        `, [id]);

        return result.rows[0] || null;
    }

    async upsertDefault(config) {
        const result = await this.pool.query(`
            INSERT INTO upstream_rate_limit_settings (
                id,
                enabled,
                requests_per_minute,
                updated_at
            ) VALUES (
                'default',
                $1,
                $2::integer,
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                requests_per_minute = EXCLUDED.requests_per_minute,
                updated_at = NOW()
            RETURNING
                id,
                enabled,
                requests_per_minute,
                updated_at
        `, [
            Boolean(config.enabled),
            Number(config.requestsPerMinute || 60),
        ]);

        return result.rows[0] || null;
    }
}

module.exports = {
    PgUpstreamRateLimitSettingsRepository,
};
