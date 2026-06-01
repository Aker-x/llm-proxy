class PgModelRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getById(id) {
        const result = await this.pool.query(`
            SELECT
                id,
                provider_id,
                upstream_model,
                upstream_api,
                enabled,
                connectivity_status,
                connectivity_tested_at,
                connectivity_message,
                connectivity_status_code,
                connectivity_latency_ms
            FROM models
            WHERE id = $1
        `, [id]);

        return result.rows[0] || null;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT
                id,
                provider_id,
                upstream_model,
                upstream_api,
                enabled,
                connectivity_status,
                connectivity_tested_at,
                connectivity_message,
                connectivity_status_code,
                connectivity_latency_ms
            FROM models
            ORDER BY provider_id, upstream_api, upstream_model, id
        `);

        return result.rows;
    }

    async upsert(model) {
        const result = await this.pool.query(`
            INSERT INTO models (
                id,
                provider_id,
                upstream_model,
                upstream_api,
                enabled,
                connectivity_status,
                connectivity_tested_at,
                connectivity_message,
                connectivity_status_code,
                connectivity_latency_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
                provider_id = EXCLUDED.provider_id,
                upstream_model = EXCLUDED.upstream_model,
                upstream_api = EXCLUDED.upstream_api,
                enabled = EXCLUDED.enabled,
                connectivity_status = EXCLUDED.connectivity_status,
                connectivity_tested_at = EXCLUDED.connectivity_tested_at,
                connectivity_message = EXCLUDED.connectivity_message,
                connectivity_status_code = EXCLUDED.connectivity_status_code,
                connectivity_latency_ms = EXCLUDED.connectivity_latency_ms
            RETURNING
                id,
                provider_id,
                upstream_model,
                upstream_api,
                enabled,
                connectivity_status,
                connectivity_tested_at,
                connectivity_message,
                connectivity_status_code,
                connectivity_latency_ms
        `, [
            model.id,
            model.providerId,
            model.upstreamModel,
            model.upstreamApi,
            model.enabled !== false,
            model.connectivityStatus,
            model.connectivityTestedAt || null,
            model.connectivityMessage,
            model.connectivityStatusCode,
            model.connectivityLatencyMs,
        ]);

        return result.rows[0] || null;
    }

    async deleteById(id) {
        await this.pool.query('DELETE FROM models WHERE id = $1', [id]);
    }
}

module.exports = {
    PgModelRepository,
};
