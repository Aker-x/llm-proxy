class PgProviderRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getById(id) {
        const result = await this.pool.query(`
            SELECT id, api_base_url, api_key, updated_at
            FROM providers
            WHERE id = $1
        `, [id]);

        return result.rows[0] || null;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT id, api_base_url, api_key, updated_at
            FROM providers
            ORDER BY id
        `);

        return result.rows;
    }

    async upsert(provider) {
        const result = await this.pool.query(`
            INSERT INTO providers (id, api_base_url, api_key, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (id) DO UPDATE SET
                api_base_url = EXCLUDED.api_base_url,
                api_key = EXCLUDED.api_key,
                updated_at = NOW()
            RETURNING id, api_base_url, api_key, updated_at
        `, [
            provider.id,
            provider.apiBaseUrl,
            provider.apiKey,
        ]);

        return result.rows[0] || null;
    }

    async deleteById(id) {
        await this.pool.query('DELETE FROM providers WHERE id = $1', [id]);
    }
}

module.exports = {
    PgProviderRepository,
};
