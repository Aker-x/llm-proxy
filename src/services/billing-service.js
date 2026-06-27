const crypto = require('crypto');
const { createHttpError } = require('../utils/http-error');

function roundUsd(value) {
    const numericValue = Number(value || 0);
    return Number(numericValue.toFixed(6));
}

function buildOutTradeNo() {
    return `REQ${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}

function mapRechargeOrder(row = {}) {
    return {
        id: row.id,
        outTradeNo: row.out_trade_no,
        paymentMethod: row.payment_method,
        status: row.status,
        amountUsd: Number(row.amount_usd || 0),
        amountCny: Number(row.amount_cny || 0),
        cnyPerUsd: Number(row.cny_per_usd || 0),
        subject: row.subject,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at || null,
        tradeNo: row.trade_no,
        buyerLogonId: row.buyer_logon_id,
        tradeStatus: row.trade_status,
        customerNote: row.customer_note,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at || null,
        reviewNote: row.review_note,
        failureReason: row.failure_reason,
    };
}

class BillingService {
    constructor({
        paymentConfigService,
        userLookup = null,
        rechargeOrderRepository,
        billingRepository,
    }) {
        this.paymentConfigService = paymentConfigService;
        this.userLookup = userLookup;
        this.rechargeOrderRepository = rechargeOrderRepository;
        this.billingRepository = billingRepository;
    }

    async getBillingOverview(username) {
        const billing = await this.paymentConfigService.getBillingConfig();
        const user = await this.userLookup(username);
        const orders = (await this.rechargeOrderRepository.listByUsername(username)).map(mapRechargeOrder);

        if (!user) {
            return {
                ...billing,
                balanceUsd: 0,
                totalRechargedUsd: 0,
                totalSpentUsd: 0,
                lastRechargedAt: null,
                orders,
            };
        }

        return {
            ...billing,
            balanceUsd: roundUsd(user.balance_usd),
            totalRechargedUsd: roundUsd(user.total_recharged_usd),
            totalSpentUsd: roundUsd(user.total_spent_usd),
            lastRechargedAt: user.last_recharged_at || null,
            orders,
        };
    }

    async createRechargeOrder({ username, amountUsd, customerNote }) {
        const billing = await this.getBillingOverview(username);
        const normalizedAmountUsd = roundUsd(amountUsd);
        const amountCny = Number((normalizedAmountUsd * Number(billing.cnyPerUsd || 0)).toFixed(2));

        if (!billing.rechargeEnabled) {
            throw createHttpError(503, 'Recharge is not enabled.');
        }

        if (amountCny < Number(billing.minimumRechargeCny || 0)) {
            throw createHttpError(400, `Minimum recharge amount is ${billing.minimumRechargeCny} CNY.`);
        }

        const now = new Date().toISOString();
        const order = mapRechargeOrder(await this.rechargeOrderRepository.create({
            id: crypto.randomUUID(),
            username,
            outTradeNo: buildOutTradeNo(),
            paymentMethod: 'manual_transfer',
            status: 'pending',
            amountUsd: normalizedAmountUsd,
            amountCny,
            cnyPerUsd: billing.cnyPerUsd,
            subject: `Manual recharge request for ${username}`,
            createdAt: now,
            updatedAt: now,
            paidAt: null,
            tradeNo: '',
            buyerLogonId: '',
            tradeStatus: '',
            customerNote: String(customerNote || '').trim(),
            reviewedBy: '',
            reviewedAt: null,
            reviewNote: '',
            failureReason: '',
        }));

        return {
            order,
            qrImagePath: billing.qrImagePath,
            minimumRechargeUsd: billing.minimumRechargeUsd,
            minimumRechargeCny: billing.minimumRechargeCny,
            cnyPerUsd: billing.cnyPerUsd,
        };
    }

    async refreshRechargeOrder({ username, orderId }) {
        const order = await this.rechargeOrderRepository.getByIdForUser(username, orderId);
        if (!order) {
            throw createHttpError(404, 'Recharge order not found.');
        }

        return { order: mapRechargeOrder(order) };
    }

    async getAdminRechargeOrders({ status } = {}) {
        const rows = await this.rechargeOrderRepository.listAll({ status });
        return rows.map((row) => ({
            username: row.username,
            ...mapRechargeOrder(row),
        }));
    }

    async grantUserBalance({ username, amountUsd, subject, operator }) {
        const normalizedAmountUsd = roundUsd(amountUsd);
        if (normalizedAmountUsd <= 0) {
            throw createHttpError(400, 'Amount must be greater than 0.');
        }

        const now = new Date().toISOString();
        const order = await this.rechargeOrderRepository.create({
            id: crypto.randomUUID(),
            username,
            outTradeNo: `MANUAL${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`,
            paymentMethod: 'manual',
            status: 'pending',
            amountUsd: normalizedAmountUsd,
            amountCny: 0,
            cnyPerUsd: 0,
            subject: String(subject || `Manual credit for ${username}`).trim(),
            createdAt: now,
            updatedAt: now,
            paidAt: null,
            tradeNo: '',
            buyerLogonId: '',
            tradeStatus: '',
            customerNote: '',
            reviewedBy: '',
            reviewedAt: null,
            reviewNote: '',
            failureReason: '',
        });

        const result = await this.billingRepository.applyRechargeOrderPayment({
            orderId: order.id,
            reviewedBy: String(operator || '').trim(),
            reviewedAt: now,
            reviewNote: String(subject || '').trim(),
            buyerLogonId: String(operator || '').trim(),
            tradeStatus: 'MANUAL_CREDIT',
            paidAt: now,
        });

        return {
            username,
            order: mapRechargeOrder(result.order),
            balanceUsd: roundUsd(result.balanceUsd),
        };
    }

    async updateUserBalance({ username, balanceUsd, amountUsd, subject, operator }) {
        const hasTargetBalance = balanceUsd !== undefined && balanceUsd !== null && String(balanceUsd).trim() !== '';
        if (!hasTargetBalance) {
            return this.grantUserBalance({ username, amountUsd, subject, operator });
        }

        const normalizedBalanceUsd = roundUsd(balanceUsd);
        if (!Number.isFinite(normalizedBalanceUsd) || normalizedBalanceUsd < 0) {
            throw createHttpError(400, 'Balance must be greater than or equal to 0.');
        }

        const user = await this.userLookup(username);
        if (!user) {
            throw createHttpError(404, 'User not found.');
        }

        const previousBalanceUsd = roundUsd(user.balance_usd);
        const adjustmentUsd = roundUsd(normalizedBalanceUsd - previousBalanceUsd);
        if (adjustmentUsd === 0) {
            return {
                username,
                previousBalanceUsd,
                balanceUsd: normalizedBalanceUsd,
                adjustmentUsd: 0,
                totalRechargedUsd: roundUsd(user.total_recharged_usd),
                totalSpentUsd: roundUsd(user.total_spent_usd),
            };
        }

        const result = await this.billingRepository.updateUserBalance({
            username,
            balanceUsd: normalizedBalanceUsd,
            adjustmentUsd,
            operator,
        });
        if (!result) {
            throw createHttpError(404, 'User not found.');
        }

        return {
            username,
            previousBalanceUsd: roundUsd(result.previousBalanceUsd),
            balanceUsd: roundUsd(result.balanceUsd),
            adjustmentUsd: roundUsd(result.adjustmentUsd),
            totalRechargedUsd: roundUsd(result.totalRechargedUsd),
            totalSpentUsd: roundUsd(result.totalSpentUsd),
        };
    }

    async approveRechargeOrder({ orderId, reviewedBy, reviewNote }) {
        const result = await this.billingRepository.applyRechargeOrderPayment({
            orderId,
            reviewedBy: String(reviewedBy || '').trim(),
            reviewedAt: new Date().toISOString(),
            reviewNote: String(reviewNote || '').trim(),
            tradeStatus: 'MANUAL_REVIEW_APPROVED',
            paidAt: new Date().toISOString(),
        });

        if (!result) {
            throw createHttpError(404, 'Recharge order not found.');
        }

        if (result.rejected) {
            throw createHttpError(400, 'Recharge order is already closed.');
        }

        return {
            username: result.order.username,
            order: mapRechargeOrder(result.order),
            balanceUsd: roundUsd(result.balanceUsd),
        };
    }

    async rejectRechargeOrder({ orderId, reviewedBy, reviewNote, reason }) {
        const result = await this.billingRepository.rejectRechargeOrder({
            orderId,
            reviewedBy: String(reviewedBy || '').trim(),
            reviewedAt: new Date().toISOString(),
            reviewNote: String(reviewNote || '').trim(),
            failureReason: String(reason || reviewNote || 'Rejected by admin.').trim(),
        });

        if (!result) {
            throw createHttpError(404, 'Recharge order not found.');
        }

        if (result.alreadyPaid) {
            throw createHttpError(400, 'Paid recharge orders cannot be rejected.');
        }

        return {
            username: result.order.username,
            order: mapRechargeOrder(result.order),
        };
    }
}

module.exports = {
    BillingService,
};
