class PgSessionRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async create({ token, username, role, expiresAt }) {
        const result = await this.pool.query(`
            INSERT INTO sessions (token, username, role, expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (token) DO UPDATE SET
                username = EXCLUDED.username,
                role = EXCLUDED.role,
                expires_at = EXCLUDED.expires_at
            RETURNING token, username, role, expires_at
        `, [token, username, role, expiresAt]);

        return result.rows[0] || null;
    }

    async getByToken(token) {
        const result = await this.pool.query(`
            SELECT token, username, role, expires_at
            FROM sessions
            WHERE token = $1
        `, [token]);

        return result.rows[0] || null;
    }

    async deleteByToken(token) {
        await this.pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    }

    async deleteByUsername(username, role = null) {
        if (role) {
            await this.pool.query('DELETE FROM sessions WHERE username = $1 AND role = $2', [username, role]);
            return;
        }

        await this.pool.query('DELETE FROM sessions WHERE username = $1', [username]);
    }

    async cleanupExpiredSessions(now = new Date().toISOString()) {
        await this.pool.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
    }
}

module.exports = {
    PgSessionRepository,
};
