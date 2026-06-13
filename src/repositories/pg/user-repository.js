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
                upstream_rate_limit_requests_per_minute,
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
                upstream_rate_limit_requests_per_minute,
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
                upstream_rate_limit_requests_per_minute,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
                upstream_rate_limit_requests_per_minute = EXCLUDED.upstream_rate_limit_requests_per_minute,
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
                upstream_rate_limit_requests_per_minute,
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
            user.upstreamRateLimitRequestsPerMinute ?? 60,
            user.upstreamRateLimitIntervalSeconds ?? 60,
            user.upstreamRateLimitLastRequestAt || null,
        ]);

        return result.rows[0] || null;
    }

    async updateRateLimitSettings(username, { enabled, requestsPerMinute }) {
        const result = await this.pool.query(`
            UPDATE users
            SET
                upstream_rate_limit_enabled = $2,
                upstream_rate_limit_requests_per_minute = $3,
                upstream_rate_limit_interval_seconds = GREATEST(1, CEIL(60.0 / GREATEST($3, 1)))::integer,
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
                upstream_rate_limit_requests_per_minute,
                upstream_rate_limit_interval_seconds,
                upstream_rate_limit_last_request_at,
                updated_at
        `, [username, Boolean(enabled), Number(requestsPerMinute || 60)]);

        return result.rows[0] || null;
    }

    async reserveUpstreamRateLimitSlot(username) {
        const result = await this.pool.query(`
            WITH current_user_settings AS (
                SELECT
                    u.username,
                    u.upstream_rate_limit_enabled AS user_override_enabled,
                    GREATEST(u.upstream_rate_limit_requests_per_minute, 1) AS user_requests_per_minute,
                    u.upstream_rate_limit_last_request_at,
                    COALESCE(global_settings.enabled, FALSE) AS global_enabled,
                    GREATEST(COALESCE(global_settings.requests_per_minute, 60), 1) AS global_requests_per_minute
                FROM users u
                LEFT JOIN upstream_rate_limit_settings global_settings
                    ON global_settings.id = 'default'
                WHERE u.username = $1
            ),
            effective_settings AS (
                SELECT
                    current_user_settings.*,
                    CASE
                        WHEN current_user_settings.user_override_enabled THEN TRUE
                        ELSE current_user_settings.global_enabled
                    END AS rate_limit_enabled,
                    CASE
                        WHEN current_user_settings.user_override_enabled THEN current_user_settings.user_requests_per_minute
                        ELSE current_user_settings.global_requests_per_minute
                    END AS requests_per_minute,
                    CASE
                        WHEN current_user_settings.user_override_enabled THEN current_user_settings.user_requests_per_minute
                        ELSE current_user_settings.global_requests_per_minute
                    END AS effective_requests_per_minute,
                    CASE
                        WHEN current_user_settings.user_override_enabled THEN current_user_settings.user_requests_per_minute
                        ELSE current_user_settings.global_requests_per_minute
                    END AS effective_rpm
                FROM current_user_settings
            ),
            updated AS (
                UPDATE users AS users_to_update
                SET
                    upstream_rate_limit_last_request_at = CASE
                        WHEN effective_settings.rate_limit_enabled IS NOT TRUE THEN users_to_update.upstream_rate_limit_last_request_at
                        WHEN users_to_update.upstream_rate_limit_last_request_at IS NULL
                            THEN NOW()
                        ELSE GREATEST(
                            NOW(),
                            users_to_update.upstream_rate_limit_last_request_at
                                + make_interval(secs => (60.0 / effective_settings.effective_rpm))
                        )
                    END,
                    updated_at = NOW()
                FROM effective_settings
                WHERE users_to_update.username = effective_settings.username
                  AND effective_settings.rate_limit_enabled = TRUE
                RETURNING users_to_update.username
            )
            SELECT
                effective_settings.rate_limit_enabled,
                effective_settings.effective_rpm AS requests_per_minute,
                effective_settings.user_override_enabled,
                effective_settings.user_requests_per_minute,
                effective_settings.global_enabled,
                effective_settings.global_requests_per_minute,
                CASE
                    WHEN effective_settings.rate_limit_enabled IS NOT TRUE THEN effective_settings.upstream_rate_limit_last_request_at
                    WHEN effective_settings.upstream_rate_limit_last_request_at IS NULL THEN NOW()
                    ELSE GREATEST(
                        NOW(),
                        effective_settings.upstream_rate_limit_last_request_at
                            + make_interval(secs => (60.0 / effective_settings.effective_rpm))
                    )
                END AS scheduled_at,
                GREATEST(
                    0,
                    COALESCE(
                        EXTRACT(EPOCH FROM (
                            CASE
                                WHEN effective_settings.rate_limit_enabled IS NOT TRUE THEN effective_settings.upstream_rate_limit_last_request_at
                                WHEN effective_settings.upstream_rate_limit_last_request_at IS NULL THEN NOW()
                                ELSE GREATEST(
                                    NOW(),
                                    effective_settings.upstream_rate_limit_last_request_at
                                        + make_interval(secs => (60.0 / effective_settings.effective_rpm))
                                )
                            END
                            - NOW()
                        )),
                        0
                    )
                ) AS wait_seconds
            FROM effective_settings
            LEFT JOIN updated ON updated.username = effective_settings.username
        `, [username]);

        const row = result.rows[0] || null;
        if (row) {
            const waitMs = Math.max(0, Math.ceil(Number(row.wait_seconds || 0) * 1000));
            return {
                rateLimitEnabled: row.rate_limit_enabled === true,
                requestsPerMinute: Number(row.requests_per_minute || 0),
                intervalSeconds: Number(row.requests_per_minute || 0) > 0
                    ? Math.max(1, Math.ceil(60 / Number(row.requests_per_minute || 1)))
                    : 0,
                scheduledAt: row.scheduled_at || null,
                waitMs,
            };
        }

        const settingsResult = await this.pool.query(`
            SELECT
                username,
                upstream_rate_limit_enabled,
                GREATEST(upstream_rate_limit_requests_per_minute, 1) AS requests_per_minute,
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
                requestsPerMinute: 0,
                scheduledAt: null,
                waitMs: 0,
            };
        }

        return {
            rateLimitEnabled: settings.upstream_rate_limit_enabled === true,
            requestsPerMinute: Number(settings.requests_per_minute || 0),
            intervalSeconds: Number(settings.requests_per_minute || 0) > 0
                ? Math.max(1, Math.ceil(60 / Number(settings.requests_per_minute || 1)))
                : 0,
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
