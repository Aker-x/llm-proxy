const test = require('node:test');
const assert = require('node:assert/strict');

const { BillingService } = require('../src/services/billing-service');

test('updateUserBalance sets an exact target balance', async () => {
    const calls = [];
    const service = new BillingService({
        paymentConfigService: {},
        userLookup: async (username) => ({
            username,
            balance_usd: 12.5,
        }),
        rechargeOrderRepository: {},
        billingRepository: {
            async updateUserBalance(payload) {
                calls.push(payload);
                return {
                    previousBalanceUsd: 12.5,
                    balanceUsd: payload.balanceUsd,
                    adjustmentUsd: payload.adjustmentUsd,
                };
            },
        },
    });

    const result = await service.updateUserBalance({
        username: 'alice',
        balanceUsd: 8,
        operator: 'admin',
    });

    assert.deepEqual(calls, [{
        username: 'alice',
        balanceUsd: 8,
        adjustmentUsd: -4.5,
        operator: 'admin',
    }]);
    assert.deepEqual(result, {
        username: 'alice',
        previousBalanceUsd: 12.5,
        balanceUsd: 8,
        adjustmentUsd: -4.5,
    });
});

test('updateUserBalance keeps legacy top-up behavior when amountUsd is provided', async () => {
    let appliedAmountUsd = null;
    const service = new BillingService({
        paymentConfigService: {},
        userLookup: async () => ({
            username: 'alice',
            balance_usd: 12.5,
        }),
        rechargeOrderRepository: {
            async create(order) {
                return {
                    id: 'order-1',
                    username: order.username,
                    out_trade_no: order.outTradeNo,
                    payment_method: order.paymentMethod,
                    status: order.status,
                    amount_usd: order.amountUsd,
                    amount_cny: order.amountCny,
                    cny_per_usd: order.cnyPerUsd,
                    subject: order.subject,
                    created_at: order.createdAt,
                    updated_at: order.updatedAt,
                    paid_at: order.paidAt,
                    trade_no: order.tradeNo,
                    buyer_logon_id: order.buyerLogonId,
                    trade_status: order.tradeStatus,
                    customer_note: order.customerNote,
                    reviewed_by: order.reviewedBy,
                    reviewed_at: order.reviewedAt,
                    review_note: order.reviewNote,
                    failure_reason: order.failureReason,
                };
            },
        },
        billingRepository: {
            async applyRechargeOrderPayment() {
                appliedAmountUsd = 5;
                return {
                    order: {
                        id: 'order-1',
                        username: 'alice',
                        out_trade_no: 'MANUAL1',
                        payment_method: 'manual',
                        status: 'paid',
                        amount_usd: 5,
                        amount_cny: 0,
                        cny_per_usd: 0,
                        subject: 'Manual credit for alice',
                        created_at: '2026-01-01T00:00:00.000Z',
                        updated_at: '2026-01-01T00:00:00.000Z',
                        paid_at: '2026-01-01T00:00:00.000Z',
                        trade_no: '',
                        buyer_logon_id: 'admin',
                        trade_status: 'MANUAL_CREDIT',
                        customer_note: '',
                        reviewed_by: 'admin',
                        reviewed_at: '2026-01-01T00:00:00.000Z',
                        review_note: '',
                        failure_reason: '',
                    },
                    balanceUsd: 17.5,
                };
            },
        },
    });

    const result = await service.updateUserBalance({
        username: 'alice',
        amountUsd: 5,
        operator: 'admin',
    });

    assert.equal(appliedAmountUsd, 5);
    assert.equal(result.balanceUsd, 17.5);
    assert.equal(result.username, 'alice');
});

test('createRechargeOrder validates the minimum recharge amount in CNY', async () => {
    const service = new BillingService({
        paymentConfigService: {
            async getBillingConfig() {
                return {
                    currency: 'USD',
                    rechargeEnabled: true,
                    minimumRechargeUsd: 1.428571,
                    minimumRechargeCny: 10,
                    cnyPerUsd: 7,
                    qrImagePath: '/qr.jpg',
                };
            },
        },
        userLookup: async () => ({
            username: 'alice',
            balance_usd: 0,
            total_recharged_usd: 0,
            total_spent_usd: 0,
        }),
        rechargeOrderRepository: {
            async listByUsername() {
                return [];
            },
            async create() {
                throw new Error('create should not be called');
            },
        },
        billingRepository: {},
    });

    await assert.rejects(
        () => service.createRechargeOrder({
            username: 'alice',
            amountUsd: 1,
            customerNote: '',
        }),
        /Minimum recharge amount is 10 CNY/
    );
});

test('createRechargeOrder stores a valid RMB recharge after USD conversion', async () => {
    let savedOrder = null;
    const service = new BillingService({
        paymentConfigService: {
            async getBillingConfig() {
                return {
                    currency: 'USD',
                    rechargeEnabled: true,
                    minimumRechargeUsd: 1.428571,
                    minimumRechargeCny: 10,
                    cnyPerUsd: 7,
                    qrImagePath: '/qr.jpg',
                };
            },
        },
        userLookup: async () => ({
            username: 'alice',
            balance_usd: 0,
            total_recharged_usd: 0,
            total_spent_usd: 0,
        }),
        rechargeOrderRepository: {
            async listByUsername() {
                return [];
            },
            async create(order) {
                savedOrder = order;
                return {
                    id: order.id,
                    username: order.username,
                    out_trade_no: order.outTradeNo,
                    payment_method: order.paymentMethod,
                    status: order.status,
                    amount_usd: order.amountUsd,
                    amount_cny: order.amountCny,
                    cny_per_usd: order.cnyPerUsd,
                    subject: order.subject,
                    created_at: order.createdAt,
                    updated_at: order.updatedAt,
                    paid_at: order.paidAt,
                    trade_no: order.tradeNo,
                    buyer_logon_id: order.buyerLogonId,
                    trade_status: order.tradeStatus,
                    customer_note: order.customerNote,
                    reviewed_by: order.reviewedBy,
                    reviewed_at: order.reviewedAt,
                    review_note: order.reviewNote,
                    failure_reason: order.failureReason,
                };
            },
        },
        billingRepository: {},
    });

    const result = await service.createRechargeOrder({
        username: 'alice',
        amountUsd: 10 / 7,
        customerNote: 'paid',
    });

    assert.equal(savedOrder.amountCny, 10);
    assert.equal(result.order.amountCny, 10);
    assert.equal(result.minimumRechargeCny, 10);
});
