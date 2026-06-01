class PgAdminRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getByUsername(username) {
        const result = await this.pool.query(`
            SELECT username, password, updated_at
            FROM admins
            WHERE username = $1
        `, [username]);

        return result.rows[0] || null;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT username, password, updated_at
            FROM admins
            ORDER BY username
        `);

        return result.rows;
    }

    async count() {
        const result = await this.pool.query('SELECT COUNT(*)::integer AS count FROM admins');
        return Number(result.rows[0]?.count || 0);
    }

    async upsert(admin) {
        const result = await this.pool.query(`
            INSERT INTO admins (username, password, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                updated_at = NOW()
            RETURNING username, password, updated_at
        `, [
            admin.username,
            admin.password,
        ]);

        return result.rows[0] || null;
    }

    async deleteByUsername(username) {
        await this.pool.query('DELETE FROM admins WHERE username = $1', [username]);
    }
}

module.exports = {
    PgAdminRepository,
};
