const { hashApiKey } = require('../../utils/api-key');

class PgApiKeyRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async findByApiKey(apiKey) {
        const normalizedKey = String(apiKey || '').trim();
        if (!normalizedKey) {
            return null;
        }

        // Try hash lookup first (new keys)
        const keyHash = hashApiKey(normalizedKey);
        let result = await this.pool.query(`
            SELECT
                id,
                username,
                name,
                api_key,
                api_key_hash,
                created_at,
                last_used_at
            FROM user_api_keys
            WHERE api_key_hash = $1
            LIMIT 1
        `, [keyHash]);

        if (result.rows[0]) {
            return result.rows[0];
        }

        // Fallback: plain key lookup (backwards compat for existing un-hashed rows)
        result = await this.pool.query(`
            SELECT
                id,
                username,
                name,
                api_key,
                api_key_hash,
                created_at,
                last_used_at
            FROM user_api_keys
            WHERE api_key = $1
            LIMIT 1
        `, [normalizedKey]);

        const row = result.rows[0] || null;
        // Backfill hash for existing row that has no hash yet
        if (row && !row.api_key_hash) {
            await this.pool.query(`
                UPDATE user_api_keys
                SET api_key_hash = $2
                WHERE id = $1
            `, [row.id, keyHash]);
        }
        return row;
    }

    async listByUsername(username) {
        const result = await this.pool.query(`
            SELECT
                id,
                username,
                name,
                api_key,
                created_at,
                last_used_at
            FROM user_api_keys
            WHERE username = $1
            ORDER BY created_at DESC, id DESC
        `, [username]);

        return result.rows;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT
                id,
                username,
                name,
                api_key,
                created_at,
                last_used_at
            FROM user_api_keys
            ORDER BY username, created_at DESC, id DESC
        `);

        return result.rows;
    }

    async upsert(apiKeyRecord) {
        const keyHash = hashApiKey(apiKeyRecord.apiKey);
        const result = await this.pool.query(`
            INSERT INTO user_api_keys (
                id,
                username,
                name,
                api_key,
                api_key_hash,
                created_at,
                last_used_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                username = EXCLUDED.username,
                name = EXCLUDED.name,
                api_key = EXCLUDED.api_key,
                api_key_hash = EXCLUDED.api_key_hash,
                created_at = EXCLUDED.created_at,
                last_used_at = EXCLUDED.last_used_at
            RETURNING
                id,
                username,
                name,
                api_key,
                api_key_hash,
                created_at,
                last_used_at
        `, [
            apiKeyRecord.id,
            apiKeyRecord.username,
            apiKeyRecord.name,
            apiKeyRecord.apiKey,
            keyHash,
            apiKeyRecord.createdAt,
            apiKeyRecord.lastUsedAt || null,
        ]);

        return result.rows[0] || null;
    }

    async touchLastUsedAt(id, lastUsedAt = new Date().toISOString()) {
        await this.pool.query(`
            UPDATE user_api_keys
            SET last_used_at = $2
            WHERE id = $1
        `, [id, lastUsedAt]);
    }

    async deleteById(id) {
        await this.pool.query('DELETE FROM user_api_keys WHERE id = $1', [id]);
    }

    async deleteByUsername(username) {
        await this.pool.query('DELETE FROM user_api_keys WHERE username = $1', [username]);
    }
}

module.exports = {
    PgApiKeyRepository,
};
