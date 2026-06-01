class PgRechargeOrderRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async create(order) {
        const result = await this.pool.query(`
            INSERT INTO recharge_orders (
                id,
                username,
                out_trade_no,
                payment_method,
                status,
                amount_usd,
                amount_cny,
                cny_per_usd,
                subject,
                created_at,
                updated_at,
                paid_at,
                trade_no,
                buyer_logon_id,
                trade_status,
                customer_note,
                reviewed_by,
                reviewed_at,
                review_note,
                failure_reason
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            )
            RETURNING *
        `, [
            order.id,
            order.username,
            order.outTradeNo,
            order.paymentMethod,
            order.status,
            order.amountUsd,
            order.amountCny,
            order.cnyPerUsd,
            order.subject,
            order.createdAt,
            order.updatedAt,
            order.paidAt || null,
            order.tradeNo || '',
            order.buyerLogonId || '',
            order.tradeStatus || '',
            order.customerNote || '',
            order.reviewedBy || '',
            order.reviewedAt || null,
            order.reviewNote || '',
            order.failureReason || '',
        ]);

        return result.rows[0] || null;
    }

    async getById(id) {
        const result = await this.pool.query('SELECT * FROM recharge_orders WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async getByIdForUser(username, id) {
        const result = await this.pool.query(`
            SELECT *
            FROM recharge_orders
            WHERE username = $1 AND id = $2
        `, [username, id]);

        return result.rows[0] || null;
    }

    async getByOutTradeNo(outTradeNo) {
        const result = await this.pool.query(`
            SELECT *
            FROM recharge_orders
            WHERE out_trade_no = $1
        `, [outTradeNo]);

        return result.rows[0] || null;
    }

    async listByUsername(username) {
        const result = await this.pool.query(`
            SELECT *
            FROM recharge_orders
            WHERE username = $1
            ORDER BY created_at DESC, id DESC
        `, [username]);

        return result.rows;
    }

    async listAll({ status } = {}) {
        if (status) {
            const result = await this.pool.query(`
                SELECT *
                FROM recharge_orders
                WHERE status = $1
                ORDER BY created_at DESC, id DESC
            `, [status]);

            return result.rows;
        }

        const result = await this.pool.query(`
            SELECT *
            FROM recharge_orders
            ORDER BY created_at DESC, id DESC
        `);

        return result.rows;
    }
}

module.exports = {
    PgRechargeOrderRepository,
};
