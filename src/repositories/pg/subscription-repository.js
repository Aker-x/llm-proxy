const { withPgTransaction } = require('./shared');

class PgSubscriptionRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async expireStaleSubscriptions() {
        await this.pool.query(`
            UPDATE users
            SET subscription_status = 'expired',
                subscription_plan_id = NULL,
                updated_at = NOW()
            WHERE subscription_status = 'active'
              AND subscription_expires_at IS NOT NULL
              AND subscription_expires_at <= NOW()
        `);
    }

    async getSettings() {
        const result = await this.pool.query(`
            SELECT *
            FROM subscription_settings
            WHERE id = 'default'
        `);

        return result.rows[0] || null;
    }

    async upsertSettings({ enabled = true, quotaConsumptionEnabled = true }) {
        const result = await this.pool.query(`
            INSERT INTO subscription_settings (
                id,
                enabled,
                quota_consumption_enabled,
                monthly_price_cny,
                updated_at
            ) VALUES ('default', $1, $2, 500, NOW())
            ON CONFLICT (id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                quota_consumption_enabled = EXCLUDED.quota_consumption_enabled,
                updated_at = NOW()
            RETURNING *
        `, [
            Boolean(enabled),
            quotaConsumptionEnabled !== false,
        ]);

        return result.rows[0] || null;
    }

    async listPlans({ enabledOnly = false } = {}) {
        const result = enabledOnly
            ? await this.pool.query(`
                SELECT *
                FROM subscription_plans
                WHERE enabled = TRUE
                ORDER BY sort_order ASC, created_at ASC, id ASC
            `)
            : await this.pool.query(`
                SELECT *
                FROM subscription_plans
                ORDER BY sort_order ASC, created_at ASC, id ASC
            `);

        return result.rows;
    }

    async getPlanById(planId) {
        const result = await this.pool.query(`
            SELECT *
            FROM subscription_plans
            WHERE id = $1
        `, [planId]);

        return result.rows[0] || null;
    }

    async createPlan({
        id,
        name,
        description = '',
        enabled = true,
        monthlyPriceCny,
        sortOrder = 0,
    }) {
        const result = await this.pool.query(`
            INSERT INTO subscription_plans (
                id,
                name,
                description,
                enabled,
                monthly_price_cny,
                sort_order,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5::numeric, $6, NOW(), NOW())
            RETURNING *
        `, [
            id,
            name,
            String(description || ''),
            enabled !== false,
            Number(monthlyPriceCny || 0).toFixed(2),
            Number(sortOrder || 0),
        ]);

        return result.rows[0] || null;
    }

    async updatePlan(planId, {
        name,
        description = '',
        enabled = true,
        monthlyPriceCny,
        sortOrder = 0,
    }) {
        const result = await this.pool.query(`
            UPDATE subscription_plans
            SET name = $2,
                description = $3,
                enabled = $4,
                monthly_price_cny = $5::numeric,
                sort_order = $6,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            planId,
            name,
            String(description || ''),
            enabled !== false,
            Number(monthlyPriceCny || 0).toFixed(2),
            Number(sortOrder || 0),
        ]);

        return result.rows[0] || null;
    }

    async deletePlan(planId) {
        return withPgTransaction(this.pool, async (client) => {
            const activeUserResult = await client.query(`
                SELECT username
                FROM users
                WHERE subscription_status = 'active'
                  AND subscription_plan_id = $1
                LIMIT 1
            `, [planId]);
            if (activeUserResult.rows[0]) {
                return {
                    deleted: false,
                    activeSubscribers: true,
                    pendingOrders: false,
                };
            }

            const pendingOrderResult = await client.query(`
                SELECT id
                FROM subscription_orders
                WHERE plan_id = $1
                  AND status = 'pending'
                LIMIT 1
            `, [planId]);
            if (pendingOrderResult.rows[0]) {
                return {
                    deleted: false,
                    activeSubscribers: false,
                    pendingOrders: true,
                };
            }

            await client.query(`
                DELETE FROM subscription_plan_model_limits
                WHERE plan_id = $1
            `, [planId]);

            const deleteResult = await client.query(`
                DELETE FROM subscription_plans
                WHERE id = $1
                RETURNING id
            `, [planId]);

            return {
                deleted: Boolean(deleteResult.rows[0]),
                activeSubscribers: false,
                pendingOrders: false,
            };
        });
    }

    async listPlanModelLimits() {
        const result = await this.pool.query(`
            SELECT
                spml.plan_id,
                spml.external_model_name,
                spml.daily_request_limit,
                spml.updated_at,
                sp.name AS plan_name,
                sp.enabled AS plan_enabled,
                sp.sort_order,
                em.strategy
            FROM subscription_plan_model_limits spml
            INNER JOIN subscription_plans sp
                ON sp.id = spml.plan_id
            INNER JOIN external_models em
                ON em.name = spml.external_model_name
            ORDER BY sp.sort_order ASC, sp.created_at ASC, sp.id ASC, em.name ASC
        `);

        return result.rows;
    }

    async replacePlanModelLimits(planId, limits = []) {
        await withPgTransaction(this.pool, async (client) => {
            await client.query(`
                DELETE FROM subscription_plan_model_limits
                WHERE plan_id = $1
            `, [planId]);

            for (const limit of limits) {
                const rawName = String(limit.externalModelName || '').trim();
                if (!rawName) {
                    continue;
                }

                const parsedLimit = Number(limit.dailyRequestLimit);
                if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
                    continue;
                }

                await client.query(`
                    INSERT INTO subscription_plan_model_limits (
                        plan_id,
                        external_model_name,
                        daily_request_limit,
                        updated_at
                    ) VALUES ($1, $2, $3, NOW())
                `, [planId, rawName, Math.floor(parsedLimit)]);
            }
        });

        return this.listPlanModelLimits();
    }

    async getPlanLimitByExternalModelName(planId, externalModelName) {
        const result = await this.pool.query(`
            SELECT spml.*
            FROM subscription_plan_model_limits spml
            WHERE spml.plan_id = $1
              AND spml.external_model_name = $2
        `, [planId, externalModelName]);

        return result.rows[0] || null;
    }

    async listUserModelPreferences({ username, planId }) {
        const result = await this.pool.query(`
            SELECT
                username,
                plan_id,
                external_model_name,
                allow_balance_fallback,
                updated_at
            FROM user_subscription_model_preferences
            WHERE username = $1
              AND plan_id = $2
            ORDER BY external_model_name ASC
        `, [username, planId]);

        return result.rows;
    }

    async getUserModelPreference({ username, planId, externalModelName }) {
        const result = await this.pool.query(`
            SELECT
                username,
                plan_id,
                external_model_name,
                allow_balance_fallback,
                updated_at
            FROM user_subscription_model_preferences
            WHERE username = $1
              AND plan_id = $2
              AND external_model_name = $3
        `, [username, planId, externalModelName]);

        return result.rows[0] || null;
    }

    async upsertUserModelPreference({
        username,
        planId,
        externalModelName,
        allowBalanceFallback = true,
    }) {
        const result = await this.pool.query(`
            INSERT INTO user_subscription_model_preferences (
                username,
                plan_id,
                external_model_name,
                allow_balance_fallback,
                updated_at
            ) VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (username, plan_id, external_model_name) DO UPDATE SET
                allow_balance_fallback = EXCLUDED.allow_balance_fallback,
                updated_at = NOW()
            RETURNING *
        `, [
            username,
            planId,
            externalModelName,
            allowBalanceFallback !== false,
        ]);

        return result.rows[0] || null;
    }

    async reserveDailyUsage({
        requestId,
        username,
        planId,
        externalModelName,
        dailyRequestLimit,
        timezone = 'Asia/Shanghai',
    }) {
        const normalizedLimit = Number(dailyRequestLimit || 0);
        if (!requestId || !username || !planId || !externalModelName || normalizedLimit <= 0) {
            return null;
        }

        return withPgTransaction(this.pool, async (client) => {
            await client.query(`
                INSERT INTO subscription_quota_counters (
                    username,
                    plan_id,
                    external_model_name,
                    quota_date,
                    timezone,
                    used_count,
                    inflight_count,
                    updated_at
                )
                SELECT
                    $1,
                    $2,
                    $3,
                    DATE(NOW() AT TIME ZONE $4),
                    $4,
                    COALESCE((
                        SELECT COUNT(*)::integer
                        FROM recent_requests
                        WHERE username = $1
                          AND subscription_plan_id = $2
                          AND model_id = $3
                          AND accounting_mode = 'subscription'
                          AND subscription_quota_charged IS DISTINCT FROM FALSE
                          AND success = TRUE
                          AND DATE(created_at AT TIME ZONE $4) = DATE(NOW() AT TIME ZONE $4)
                    ), 0),
                    0,
                    NOW()
                ON CONFLICT (username, plan_id, external_model_name, quota_date) DO NOTHING
            `, [username, planId, externalModelName, timezone]);

            const counterResult = await client.query(`
                UPDATE subscription_quota_counters
                SET inflight_count = inflight_count + 1,
                    updated_at = NOW()
                WHERE username = $1
                  AND plan_id = $2
                  AND external_model_name = $3
                  AND quota_date = DATE(NOW() AT TIME ZONE $4)
                  AND (used_count + inflight_count) < $5::integer
                RETURNING used_count, inflight_count, quota_date
            `, [username, planId, externalModelName, timezone, normalizedLimit]);

            if (!counterResult.rows.length) {
                const currentResult = await client.query(`
                    SELECT used_count, inflight_count, quota_date
                    FROM subscription_quota_counters
                    WHERE username = $1
                      AND plan_id = $2
                      AND external_model_name = $3
                      AND quota_date = DATE(NOW() AT TIME ZONE $4)
                `, [username, planId, externalModelName, timezone]);
                const current = currentResult.rows[0] || {
                    used_count: 0,
                    inflight_count: 0,
                    quota_date: null,
                };
                const usedCount = Number(current.used_count || 0);
                const inflightCount = Number(current.inflight_count || 0);
                return {
                    reserved: false,
                    requestId,
                    username,
                    planId,
                    externalModelName,
                    dailyRequestLimit: normalizedLimit,
                    requestsToday: usedCount,
                    inflightCount,
                    remainingToday: Math.max(0, normalizedLimit - usedCount - inflightCount),
                    quotaDate: current.quota_date || null,
                };
            }

            const counter = counterResult.rows[0];
            const reservationResult = await client.query(`
                INSERT INTO subscription_quota_reservations (
                    request_id,
                    username,
                    plan_id,
                    external_model_name,
                    quota_date,
                    status,
                    created_at,
                    completed_at
                ) VALUES (
                    $1, $2, $3, $4, $5, 'reserved', NOW(), NULL
                )
                ON CONFLICT (request_id) DO NOTHING
                RETURNING request_id
            `, [
                requestId,
                username,
                planId,
                externalModelName,
                counter.quota_date,
            ]);

            if (!reservationResult.rows.length) {
                await client.query(`
                    UPDATE subscription_quota_counters
                    SET inflight_count = GREATEST(inflight_count - 1, 0),
                        updated_at = NOW()
                    WHERE username = $1
                      AND plan_id = $2
                      AND external_model_name = $3
                      AND quota_date = $4
                `, [username, planId, externalModelName, counter.quota_date]);

                const usedCount = Number(counter.used_count || 0);
                const inflightCount = Math.max(0, Number(counter.inflight_count || 0) - 1);
                return {
                    reserved: false,
                    duplicateRequestId: true,
                    requestId,
                    username,
                    planId,
                    externalModelName,
                    dailyRequestLimit: normalizedLimit,
                    requestsToday: usedCount,
                    inflightCount,
                    remainingToday: Math.max(0, normalizedLimit - usedCount - inflightCount),
                    quotaDate: counter.quota_date,
                };
            }

            const usedCount = Number(counter.used_count || 0);
            const inflightCount = Number(counter.inflight_count || 0);
            return {
                reserved: true,
                requestId,
                username,
                planId,
                externalModelName,
                dailyRequestLimit: normalizedLimit,
                requestsToday: usedCount,
                inflightCount,
                remainingToday: Math.max(0, normalizedLimit - usedCount - inflightCount),
                quotaDate: counter.quota_date,
            };
        });
    }

    async completeDailyUsageReservation({ requestId, consume = false }) {
        if (!requestId) {
            return null;
        }

        return withPgTransaction(this.pool, async (client) => {
            const reservationResult = await client.query(`
                SELECT *
                FROM subscription_quota_reservations
                WHERE request_id = $1
                FOR UPDATE
            `, [requestId]);

            const reservation = reservationResult.rows[0];
            if (!reservation || reservation.status !== 'reserved') {
                return reservation || null;
            }

            const consumeCount = consume ? 1 : 0;
            const counterResult = await client.query(`
                UPDATE subscription_quota_counters
                SET inflight_count = GREATEST(inflight_count - 1, 0),
                    used_count = used_count + $5::integer,
                    updated_at = NOW()
                WHERE username = $1
                  AND plan_id = $2
                  AND external_model_name = $3
                  AND quota_date = $4
                RETURNING used_count, inflight_count
            `, [
                reservation.username,
                reservation.plan_id,
                reservation.external_model_name,
                reservation.quota_date,
                consumeCount,
            ]);

            const nextStatus = consume ? 'consumed' : 'released';
            const updatedReservationResult = await client.query(`
                UPDATE subscription_quota_reservations
                SET status = $2,
                    completed_at = NOW()
                WHERE request_id = $1
                RETURNING *
            `, [requestId, nextStatus]);

            return {
                ...updatedReservationResult.rows[0],
                usedCount: Number(counterResult.rows[0]?.used_count || 0),
                inflightCount: Number(counterResult.rows[0]?.inflight_count || 0),
            };
        });
    }

    async releaseStaleDailyUsageReservations({ olderThanMinutes = 360 } = {}) {
        const normalizedMinutes = Math.max(1, Number(olderThanMinutes || 360));
        const result = await this.pool.query(`
            WITH stale AS (
                UPDATE subscription_quota_reservations
                SET status = 'released',
                    completed_at = NOW()
                WHERE status = 'reserved'
                  AND created_at < NOW() - ($1::numeric * INTERVAL '1 minute')
                RETURNING username, plan_id, external_model_name, quota_date
            ),
            grouped AS (
                SELECT
                    username,
                    plan_id,
                    external_model_name,
                    quota_date,
                    COUNT(*)::integer AS release_count
                FROM stale
                GROUP BY username, plan_id, external_model_name, quota_date
            )
            UPDATE subscription_quota_counters AS c
            SET inflight_count = GREATEST(c.inflight_count - grouped.release_count, 0),
                updated_at = NOW()
            FROM grouped
            WHERE c.username = grouped.username
              AND c.plan_id = grouped.plan_id
              AND c.external_model_name = grouped.external_model_name
              AND c.quota_date = grouped.quota_date
            RETURNING grouped.release_count
        `, [normalizedMinutes]);

        return result.rows.reduce((total, row) => total + Number(row.release_count || 0), 0);
    }

    async getUserSubscription(username) {
        const result = await this.pool.query(`
            SELECT
                u.username,
                u.subscription_status,
                u.subscription_started_at,
                u.subscription_expires_at,
                u.subscription_plan_id,
                sp.name AS subscription_plan_name,
                sp.description AS subscription_plan_description,
                sp.enabled AS subscription_plan_enabled,
                sp.monthly_price_cny AS subscription_monthly_price_cny
            FROM users u
            LEFT JOIN subscription_plans sp
                ON sp.id = u.subscription_plan_id
            WHERE u.username = $1
        `, [username]);

        return result.rows[0] || null;
    }

    async listActiveSubscribers() {
        const result = await this.pool.query(`
            SELECT
                u.username,
                u.subscription_status,
                u.subscription_started_at,
                u.subscription_expires_at,
                u.subscription_plan_id,
                sp.name AS subscription_plan_name,
                sp.description AS subscription_plan_description,
                sp.enabled AS subscription_plan_enabled,
                sp.monthly_price_cny AS subscription_monthly_price_cny
            FROM users u
            LEFT JOIN subscription_plans sp
                ON sp.id = u.subscription_plan_id
            WHERE u.subscription_status = 'active'
              AND u.subscription_expires_at IS NOT NULL
              AND u.subscription_expires_at > NOW()
            ORDER BY u.subscription_expires_at DESC, u.username
        `);

        return result.rows;
    }

    async createOrder(order) {
        const result = await this.pool.query(`
            INSERT INTO subscription_orders (
                id,
                username,
                plan_id,
                status,
                months,
                amount_cny,
                snapshot_monthly_price_cny,
                snapshot_plan_name,
                subject,
                customer_note,
                created_at,
                updated_at,
                reviewed_by,
                reviewed_at,
                review_note,
                failure_reason,
                approved_started_at,
                approved_expires_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *
        `, [
            order.id,
            order.username,
            order.planId,
            order.status,
            Number(order.months || 1),
            Number(order.amountCny || 0).toFixed(2),
            Number(order.snapshotMonthlyPriceCny || 0).toFixed(2),
            String(order.snapshotPlanName || ''),
            order.subject,
            order.customerNote || '',
            order.createdAt,
            order.updatedAt,
            order.reviewedBy || '',
            order.reviewedAt || null,
            order.reviewNote || '',
            order.failureReason || '',
            order.approvedStartedAt || null,
            order.approvedExpiresAt || null,
        ]);

        return result.rows[0] || null;
    }

    async getOrderByIdForUser(username, orderId) {
        const result = await this.pool.query(`
            SELECT *
            FROM subscription_orders
            WHERE username = $1
              AND id = $2
        `, [username, orderId]);

        return result.rows[0] || null;
    }

    async getOrderById(orderId) {
        const result = await this.pool.query(`
            SELECT *
            FROM subscription_orders
            WHERE id = $1
        `, [orderId]);

        return result.rows[0] || null;
    }

    async listOrdersByUsername(username) {
        const result = await this.pool.query(`
            SELECT *
            FROM subscription_orders
            WHERE username = $1
            ORDER BY created_at DESC, id DESC
        `, [username]);

        return result.rows;
    }

    async listAllOrders({ status } = {}) {
        if (status) {
            const result = await this.pool.query(`
                SELECT *
                FROM subscription_orders
                WHERE status = $1
                ORDER BY created_at DESC, id DESC
            `, [status]);

            return result.rows;
        }

        const result = await this.pool.query(`
            SELECT *
            FROM subscription_orders
            ORDER BY created_at DESC, id DESC
        `);

        return result.rows;
    }

    async approveOrder({
        orderId,
        reviewedBy = '',
        reviewedAt,
        reviewNote = '',
        userStartedAt,
        orderStartedAt,
        expiresAt,
    }) {
        return withPgTransaction(this.pool, async (client) => {
            const orderResult = await client.query(`
                SELECT *
                FROM subscription_orders
                WHERE id = $1
                FOR UPDATE
            `, [orderId]);
            const order = orderResult.rows[0];

            if (!order) {
                return null;
            }

            if (order.status === 'approved') {
                return { order, alreadyApproved: true };
            }

            if (order.status === 'rejected') {
                return { order, rejected: true };
            }

            await client.query(`
                UPDATE users
                SET subscription_status = 'active',
                    subscription_started_at = $2,
                    subscription_expires_at = $3,
                    subscription_plan_id = $4,
                    updated_at = NOW()
                WHERE username = $1
            `, [
                order.username,
                userStartedAt,
                expiresAt,
                order.plan_id || null,
            ]);

            const updatedOrderResult = await client.query(`
                UPDATE subscription_orders
                SET status = 'approved',
                    updated_at = $2,
                    reviewed_by = $3,
                    reviewed_at = $4,
                    review_note = $5,
                    failure_reason = '',
                    approved_started_at = $6,
                    approved_expires_at = $7
                WHERE id = $1
                RETURNING *
            `, [
                orderId,
                reviewedAt,
                String(reviewedBy || ''),
                reviewedAt,
                String(reviewNote || ''),
                orderStartedAt,
                expiresAt,
            ]);

            return {
                order: updatedOrderResult.rows[0] || null,
                alreadyApproved: false,
                rejected: false,
            };
        });
    }

    async rejectOrder({
        orderId,
        reviewedBy = '',
        reviewedAt,
        reviewNote = '',
        failureReason = '',
    }) {
        return withPgTransaction(this.pool, async (client) => {
            const orderResult = await client.query(`
                SELECT *
                FROM subscription_orders
                WHERE id = $1
                FOR UPDATE
            `, [orderId]);
            const order = orderResult.rows[0];

            if (!order) {
                return null;
            }

            if (order.status === 'approved') {
                return { order, alreadyApproved: true };
            }

            const updatedOrderResult = await client.query(`
                UPDATE subscription_orders
                SET status = 'rejected',
                    updated_at = $2,
                    reviewed_by = $3,
                    reviewed_at = $4,
                    review_note = $5,
                    failure_reason = $6
                WHERE id = $1
                RETURNING *
            `, [
                orderId,
                reviewedAt,
                String(reviewedBy || ''),
                reviewedAt,
                String(reviewNote || ''),
                String(failureReason || reviewNote || 'Rejected by admin.'),
            ]);

            return {
                order: updatedOrderResult.rows[0] || null,
                alreadyApproved: false,
            };
        });
    }

    async getDailyUsageCountForPlanExternalModel({
        username,
        planId,
        externalModelName,
        timezone = 'Asia/Shanghai',
    }) {
        const result = await this.pool.query(`
            SELECT COUNT(*)::bigint AS request_count
            FROM recent_requests
            WHERE username = $1
              AND subscription_plan_id = $2
              AND model_id = $3
              AND accounting_mode = 'subscription'
              AND subscription_quota_charged IS DISTINCT FROM FALSE
              AND success = TRUE
              AND DATE(created_at AT TIME ZONE $4) = DATE(NOW() AT TIME ZONE $4)
        `, [username, planId, externalModelName, timezone]);

        return Number(result.rows[0]?.request_count || 0);
    }

    async getDailyUsageCountsByUsername({ usernames = [], timezone = 'Asia/Shanghai' }) {
        if (!Array.isArray(usernames) || usernames.length === 0) {
            return [];
        }

        const result = await this.pool.query(`
            SELECT
                username,
                subscription_plan_id AS plan_id,
                model_id AS external_model_name,
                COUNT(*)::bigint AS request_count
            FROM recent_requests
            WHERE username = ANY($1::text[])
              AND accounting_mode = 'subscription'
              AND subscription_quota_charged IS DISTINCT FROM FALSE
              AND success = TRUE
              AND DATE(created_at AT TIME ZONE $2) = DATE(NOW() AT TIME ZONE $2)
            GROUP BY username, plan_id, external_model_name
        `, [usernames, timezone]);

        return result.rows;
    }
}

module.exports = {
    PgSubscriptionRepository,
};
