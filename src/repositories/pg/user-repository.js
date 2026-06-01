const { withPgTransaction } = require('./shared');

class PgUserRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getByUsername(username) {
        const result = await this.pool.query(`
            SELECT
                username,
                password,
                balance_usd,
                total_recharged_usd,
                total_spent_usd,
                last_recharged_at,
                subscription_status,
                subscription_plan_id,
                subscription_started_at,
                subscription_expires_at,
                upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
            FROM users
            WHERE username = $1
        `, [username]);

        return result.rows[0] || null;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT
                username,
                password,
                balance_usd,
                total_recharged_usd,
                total_spent_usd,
                last_recharged_at,
                subscription_status,
                subscription_plan_id,
                subscription_started_at,
                subscription_expires_at,
                upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
            FROM users
            ORDER BY username
        `);

        return result.rows;
    }

    async upsert(user) {
        const result = await this.pool.query(`
            INSERT INTO users (
                username,
                password,
                balance_usd,
                total_recharged_usd,
                total_spent_usd,
                last_recharged_at,
                subscription_status,
                subscription_plan_id,
                subscription_started_at,
                subscription_expires_at,
                upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                balance_usd = EXCLUDED.balance_usd,
                total_recharged_usd = EXCLUDED.total_recharged_usd,
                total_spent_usd = EXCLUDED.total_spent_usd,
                last_recharged_at = EXCLUDED.last_recharged_at,
                subscription_status = EXCLUDED.subscription_status,
                subscription_plan_id = EXCLUDED.subscription_plan_id,
                subscription_started_at = EXCLUDED.subscription_started_at,
                subscription_expires_at = EXCLUDED.subscription_expires_at,
                upstream_rate_limit_enabled = EXCLUDED.upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds = EXCLUDED.upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at = EXCLUDED.upstream_rate_limit_last_request_at,
                updated_at = NOW()
            RETURNING
                username,
                password,
                balance_usd,
                total_recharged_usd,
                total_spent_usd,
                last_recharged_at,
                subscription_status,
                subscription_plan_id,
                subscription_started_at,
                subscription_expires_at,
                upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
        `, [
            user.username,
            user.password,
            user.balanceUsd ?? 0,
            user.totalRechargedUsd ?? 0,
            user.totalSpentUsd ?? 0,
            user.lastRechargedAt || null,
            user.subscriptionStatus || 'inactive',
            user.subscriptionPlanId || null,
            user.subscriptionStartedAt || null,
            user.subscriptionExpiresAt || null,
            user.upstreamRateLimitEnabled ?? false,
            user.upstreamRateLimitIntervalSeconds ?? 60,
            user.upstreamRateLimitLastRequestAt || null,
        ]);

        return result.rows[0] || null;
    }

    async updateRateLimitSettings(username, { enabled, intervalSeconds }) {
        const result = await this.pool.query(`
            UPDATE users
            SET
                upstream_rate_limit_enabled = $2,
                upstream_rate_limit_interval_seconds = $3,
                upstream_rate_limit_last_request_at = CASE
                    WHEN $2 THEN upstream_rate_limit_last_request_at
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE username = $1
            RETURNING
                username,
                password,
                balance_usd,
                total_recharged_usd,
                total_spent_usd,
                last_recharged_at,
                subscription_status,
                subscription_plan_id,
                subscription_started_at,
                subscription_expires_at,
                upstream_rate_limit_enabled,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
        `, [username, Boolean(enabled), intervalSeconds]);

        return result.rows[0] || null;
    }

    async reserveUpstreamRateLimitSlot(username) {
        const result = await this.pool.query(`
            UPDATE users AS users_to_update
            SET
                upstream_rate_limit_last_request_at = CASE
                    WHEN users_to_update.upstream_rate_limit_last_request_at IS NULL
                        THEN NOW()
                    ELSE GREATEST(
                        NOW(),
                        users_to_update.upstream_rate_limit_last_request_at
                            + (GREATEST(users_to_update.upstream_rate_limit_interval_seconds, 1) * INTERVAL '1 second')
                    )
                END,
                updated_at = NOW()
            WHERE users_to_update.username = $1
              AND users_to_update.upstream_rate_limit_enabled = TRUE
            RETURNING
                users_to_update.username,
                users_to_update.upstream_rate_limit_enabled,
                GREATEST(users_to_update.upstream_rate_limit_interval_seconds, 1) AS interval_seconds,
                users_to_update.upstream_rate_limit_last_request_at AS recorded_at,
                EXTRACT(EPOCH FROM (
                    users_to_update.upstream_rate_limit_last_request_at
                    - NOW()
                )) AS wait_seconds
        `, [username]);

        const row = result.rows[0] || null;
        if (row) {
            const waitMs = Math.max(0, Math.ceil(Number(row.wait_seconds || 0) * 1000));
            return {
                rateLimitEnabled: true,
                intervalSeconds: Number(row.interval_seconds || 0),
                scheduledAt: row.recorded_at || null,
                waitMs,
            };
        }

        const settingsResult = await this.pool.query(`
            SELECT
                username,
                upstream_rate_limit_enabled,
                GREATEST(upstream_rate_limit_interval_seconds, 1) AS interval_seconds,
                upstream_rate_limit_last_request_at
            FROM users
            WHERE username = $1
        `, [username]);

        const settings = settingsResult.rows[0] || null;
        if (!settings) {
            return {
                allowed: true,
                status: 'missing',
                rateLimitEnabled: false,
                intervalSeconds: 0,
                scheduledAt: null,
                waitMs: 0,
            };
        }

        return {
            rateLimitEnabled: settings.upstream_rate_limit_enabled === true,
            intervalSeconds: Number(settings.interval_seconds || 0),
            scheduledAt: settings.upstream_rate_limit_last_request_at || null,
            waitMs: 0,
        };
    }

    async deleteByUsername(username) {
        await withPgTransaction(this.pool, async (client) => {
            await client.query('DELETE FROM request_reservations WHERE username = $1', [username]);
            await client.query('DELETE FROM wallet_ledger WHERE username = $1', [username]);
            await client.query('DELETE FROM users WHERE username = $1', [username]);
        });
    }
}

module.exports = {
    PgUserRepository,
};
