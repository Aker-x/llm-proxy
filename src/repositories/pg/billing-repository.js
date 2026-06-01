const { normalizeNumericString, withPgTransaction } = require('./shared');

class PgBillingRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async deleteCompletedReservationsOlderThan(cutoffIso) {
        const result = await this.pool.query(`
            DELETE FROM request_reservations
            WHERE completed_at IS NOT NULL
              AND completed_at < $1
              AND status IN ('settled', 'failed')
        `, [cutoffIso]);

        return Number(result.rowCount || 0);
    }

    async reserveFunds({
        requestId,
        username,
        routeId = null,
        providerId,
        modelId,
        reservedAmountUsd,
    }) {
        const normalizedReservedAmount = normalizeNumericString(reservedAmountUsd);

        return withPgTransaction(this.pool, async (client) => {
            const balanceResult = await client.query(`
                UPDATE users
                SET balance_usd = balance_usd - $1::numeric,
                    updated_at = NOW()
                WHERE username = $2
                  AND balance_usd >= $1::numeric
                RETURNING username, balance_usd
            `, [normalizedReservedAmount, username]);

            if (!balanceResult.rows.length) {
                return null;
            }

            const balanceAfterUsd = balanceResult.rows[0].balance_usd;

            await client.query(`
                INSERT INTO request_reservations (
                    request_id,
                    username,
                    route_id,
                    provider_id,
                    model_id,
                    reserved_amount_usd,
                    actual_amount_usd,
                    status,
                    created_at,
                    completed_at
                ) VALUES ($1, $2, $3, $4, $5, $6::numeric, NULL, 'reserved', NOW(), NULL)
            `, [
                requestId,
                username,
                routeId,
                providerId,
                modelId,
                normalizedReservedAmount,
            ]);

            await client.query(`
                INSERT INTO wallet_ledger (
                    username,
                    request_id,
                    entry_type,
                    amount_usd,
                    balance_after_usd,
                    created_at
                ) VALUES ($1, $2, 'reserve', $3::numeric, $4::numeric, NOW())
            `, [
                username,
                requestId,
                `-${normalizedReservedAmount}`,
                balanceAfterUsd,
            ]);

            return {
                requestId,
                username,
                reservedAmountUsd: Number(normalizedReservedAmount),
                balanceAfterUsd: Number(balanceAfterUsd),
            };
        });
    }

    async settleReservation({
        requestId,
        username,
        providerId = null,
        modelId = null,
        actualAmountUsd,
        success,
    }) {
        const normalizedActualAmount = normalizeNumericString(actualAmountUsd);

        return withPgTransaction(this.pool, async (client) => {
            const reservationResult = await client.query(`
                SELECT
                    request_id,
                    username,
                    reserved_amount_usd,
                    status
                FROM request_reservations
                WHERE request_id = $1
                FOR UPDATE
            `, [requestId]);

            const reservation = reservationResult.rows[0];
            if (!reservation) {
                const actualAmount = Number(normalizedActualAmount);
                const nextStatus = success ? 'settled' : 'failed';
                let balanceAfterUsd = null;

                if (actualAmount > 0) {
                    const chargeResult = await client.query(`
                        UPDATE users
                        SET balance_usd = balance_usd - $1::numeric,
                            total_spent_usd = total_spent_usd + $1::numeric,
                            updated_at = NOW()
                        WHERE username = $2
                        RETURNING balance_usd
                    `, [normalizedActualAmount, username]);
                    balanceAfterUsd = chargeResult.rows[0]?.balance_usd ?? null;

                    await client.query(`
                        INSERT INTO wallet_ledger (
                            username,
                            request_id,
                            entry_type,
                            amount_usd,
                            balance_after_usd,
                            created_at
                        ) VALUES ($1, $2, 'charge', $3::numeric, $4::numeric, NOW())
                    `, [
                        username,
                        requestId,
                        `-${normalizedActualAmount}`,
                        balanceAfterUsd,
                    ]);
                } else {
                    const userResult = await client.query(`
                        UPDATE users
                        SET updated_at = NOW()
                        WHERE username = $1
                        RETURNING balance_usd
                    `, [username]);
                    balanceAfterUsd = userResult.rows[0]?.balance_usd ?? null;
                }

                const insertedReservationResult = await client.query(`
                    INSERT INTO request_reservations (
                        request_id,
                        username,
                        route_id,
                        provider_id,
                        model_id,
                        reserved_amount_usd,
                        actual_amount_usd,
                        status,
                        created_at,
                        completed_at
                    ) VALUES ($1, $2, NULL, $3, $4, 0::numeric, $5::numeric, $6, NOW(), NOW())
                    RETURNING
                        request_id,
                        username,
                        reserved_amount_usd,
                        actual_amount_usd,
                        status,
                        completed_at
                `, [
                    requestId,
                    username,
                    providerId,
                    modelId,
                    normalizedActualAmount,
                    nextStatus,
                ]);

                return {
                    ...insertedReservationResult.rows[0],
                    balanceAfterUsd: balanceAfterUsd === null ? null : Number(balanceAfterUsd),
                };
            }

            if (reservation.status === 'settled' || reservation.status === 'failed') {
                return reservation;
            }

            const reservedAmount = Number(reservation.reserved_amount_usd || 0);
            const actualAmount = Number(normalizedActualAmount);
            const delta = Number((reservedAmount - actualAmount).toFixed(6));

            let balanceAfterUsd = null;

            if (delta > 0) {
                const refundResult = await client.query(`
                    UPDATE users
                    SET balance_usd = balance_usd + $1::numeric,
                        total_spent_usd = total_spent_usd + $2::numeric,
                        updated_at = NOW()
                    WHERE username = $3
                    RETURNING balance_usd
                `, [delta.toFixed(6), normalizedActualAmount, username]);
                balanceAfterUsd = refundResult.rows[0]?.balance_usd ?? null;

                await client.query(`
                    INSERT INTO wallet_ledger (
                        username,
                        request_id,
                        entry_type,
                        amount_usd,
                        balance_after_usd,
                        created_at
                    ) VALUES ($1, $2, 'refund', $3::numeric, $4::numeric, NOW())
                `, [
                    username,
                    requestId,
                    delta.toFixed(6),
                    balanceAfterUsd,
                ]);
            } else if (delta < 0) {
                const extraCharge = Math.abs(delta);
                const chargeResult = await client.query(`
                    UPDATE users
                    SET balance_usd = balance_usd - $1::numeric,
                        total_spent_usd = total_spent_usd + $2::numeric,
                        updated_at = NOW()
                    WHERE username = $3
                    RETURNING balance_usd
                `, [extraCharge.toFixed(6), normalizedActualAmount, username]);
                balanceAfterUsd = chargeResult.rows[0]?.balance_usd ?? null;

                await client.query(`
                    INSERT INTO wallet_ledger (
                        username,
                        request_id,
                        entry_type,
                        amount_usd,
                        balance_after_usd,
                        created_at
                    ) VALUES ($1, $2, 'charge_adjustment', $3::numeric, $4::numeric, NOW())
                `, [
                    username,
                    requestId,
                    `-${extraCharge.toFixed(6)}`,
                    balanceAfterUsd,
                ]);
            } else {
                const chargeResult = await client.query(`
                    UPDATE users
                    SET total_spent_usd = total_spent_usd + $1::numeric,
                        updated_at = NOW()
                    WHERE username = $2
                    RETURNING balance_usd
                `, [normalizedActualAmount, username]);
                balanceAfterUsd = chargeResult.rows[0]?.balance_usd ?? null;
            }

            const nextStatus = success ? 'settled' : 'failed';

            const updatedReservationResult = await client.query(`
                UPDATE request_reservations
                SET actual_amount_usd = $2::numeric,
                    status = $3,
                    completed_at = NOW()
                WHERE request_id = $1
                RETURNING
                    request_id,
                    username,
                    reserved_amount_usd,
                    actual_amount_usd,
                    status,
                    completed_at
            `, [requestId, normalizedActualAmount, nextStatus]);

            return {
                ...updatedReservationResult.rows[0],
                balanceAfterUsd: balanceAfterUsd === null ? null : Number(balanceAfterUsd),
            };
        });
    }

    async applyRechargeOrderPayment({
        orderId,
        reviewedBy = '',
        reviewedAt = null,
        reviewNote = '',
        tradeNo = '',
        buyerLogonId = '',
        tradeStatus = 'TRADE_SUCCESS',
        paidAt = new Date().toISOString(),
    }) {
        return withPgTransaction(this.pool, async (client) => {
            const orderResult = await client.query(`
                SELECT *
                FROM recharge_orders
                WHERE id = $1
                FOR UPDATE
            `, [orderId]);
            const order = orderResult.rows[0];
            if (!order) {
                return null;
            }

            if (order.status === 'paid') {
                const userResult = await client.query(`
                    SELECT balance_usd
                    FROM users
                    WHERE username = $1
                `, [order.username]);
                return {
                    order,
                    balanceUsd: Number(userResult.rows[0]?.balance_usd || 0),
                };
            }

            if (order.status === 'failed' || order.status === 'closed') {
                return {
                    order,
                    balanceUsd: null,
                    rejected: true,
                };
            }

            const userResult = await client.query(`
                UPDATE users
                SET balance_usd = balance_usd + $1::numeric,
                    total_recharged_usd = total_recharged_usd + $1::numeric,
                    last_recharged_at = $2,
                    updated_at = NOW()
                WHERE username = $3
                RETURNING balance_usd
            `, [
                normalizeNumericString(order.amount_usd),
                paidAt,
                order.username,
            ]);
            const balanceAfterUsd = userResult.rows[0]?.balance_usd ?? null;

            await client.query(`
                INSERT INTO wallet_ledger (
                    username,
                    request_id,
                    entry_type,
                    amount_usd,
                    balance_after_usd,
                    created_at
                ) VALUES ($1, NULL, 'recharge', $2::numeric, $3::numeric, NOW())
            `, [
                order.username,
                normalizeNumericString(order.amount_usd),
                balanceAfterUsd,
            ]);

            const updatedOrderResult = await client.query(`
                UPDATE recharge_orders
                SET status = 'paid',
                    paid_at = $2,
                    updated_at = $2,
                    trade_no = $3,
                    buyer_logon_id = $4,
                    trade_status = $5,
                    reviewed_by = $6,
                    reviewed_at = $7,
                    review_note = $8,
                    failure_reason = ''
                WHERE id = $1
                RETURNING *
            `, [
                orderId,
                paidAt,
                String(tradeNo || order.trade_no || ''),
                String(buyerLogonId || order.buyer_logon_id || ''),
                String(tradeStatus || order.trade_status || 'TRADE_SUCCESS'),
                String(reviewedBy || order.reviewed_by || ''),
                reviewedAt || paidAt,
                String(reviewNote || order.review_note || ''),
            ]);

            return {
                order: updatedOrderResult.rows[0] || null,
                balanceUsd: balanceAfterUsd === null ? null : Number(balanceAfterUsd),
            };
        });
    }

    async updateUserBalance({
        username,
        balanceUsd,
        adjustmentUsd,
        operator = '',
        reviewedAt = new Date().toISOString(),
    }) {
        const normalizedBalanceUsd = normalizeNumericString(balanceUsd);
        const normalizedAdjustmentUsd = normalizeNumericString(adjustmentUsd);
        const adjustmentAmount = Number(normalizedAdjustmentUsd);

        return withPgTransaction(this.pool, async (client) => {
            const currentUserResult = await client.query(`
                SELECT balance_usd
                FROM users
                WHERE username = $1
                FOR UPDATE
            `, [username]);
            const currentUser = currentUserResult.rows[0];
            if (!currentUser) {
                return null;
            }

            const updatedUserResult = await client.query(`
                UPDATE users
                SET balance_usd = $2::numeric,
                    total_recharged_usd = total_recharged_usd + $3::numeric,
                    last_recharged_at = CASE
                        WHEN $3::numeric > 0 THEN $4
                        ELSE last_recharged_at
                    END,
                    updated_at = NOW()
                WHERE username = $1
                RETURNING balance_usd, total_recharged_usd
            `, [
                username,
                normalizedBalanceUsd,
                adjustmentAmount > 0 ? normalizedAdjustmentUsd : normalizeNumericString(0),
                reviewedAt,
            ]);
            const updatedUser = updatedUserResult.rows[0];

            await client.query(`
                INSERT INTO wallet_ledger (
                    username,
                    request_id,
                    entry_type,
                    amount_usd,
                    balance_after_usd,
                    created_at
                ) VALUES ($1, NULL, 'manual_adjustment', $2::numeric, $3::numeric, NOW())
            `, [
                username,
                normalizedAdjustmentUsd,
                normalizedBalanceUsd,
            ]);

            return {
                username,
                previousBalanceUsd: Number(currentUser.balance_usd || 0),
                balanceUsd: Number(updatedUser?.balance_usd || 0),
                adjustmentUsd: adjustmentAmount,
                totalRechargedUsd: Number(updatedUser?.total_recharged_usd || 0),
                reviewedBy: String(operator || '').trim(),
                reviewedAt,
            };
        });
    }

    async rejectRechargeOrder({
        orderId,
        reviewedBy = '',
        reviewedAt = new Date().toISOString(),
        reviewNote = '',
        failureReason = '',
    }) {
        return withPgTransaction(this.pool, async (client) => {
            const orderResult = await client.query(`
                SELECT *
                FROM recharge_orders
                WHERE id = $1
                FOR UPDATE
            `, [orderId]);
            const order = orderResult.rows[0];
            if (!order) {
                return null;
            }

            if (order.status === 'paid') {
                return {
                    order,
                    alreadyPaid: true,
                };
            }

            const updatedOrderResult = await client.query(`
                UPDATE recharge_orders
                SET status = 'failed',
                    trade_status = 'MANUAL_REVIEW_REJECTED',
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
                alreadyPaid: false,
            };
        });
    }
}

module.exports = {
    PgBillingRepository,
};
