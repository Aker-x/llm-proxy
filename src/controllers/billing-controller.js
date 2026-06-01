function createBillingController({ billingService, subscriptionService }) {
    return {
        async getBilling(req, res) {
            res.json(await billingService.getBillingOverview(req.userSession.username));
        },

        async getSubscription(req, res) {
            res.json(await subscriptionService.getUserOverview(req.userSession.username));
        },

        async createRechargeOrder(req, res) {
            const result = await billingService.createRechargeOrder({
                username: req.userSession.username,
                amountUsd: req.body?.amountUsd,
                customerNote: req.body?.customerNote,
            });

            res.status(201).json({
                ok: true,
                ...result,
            });
        },

        async createSubscriptionOrder(req, res) {
            const result = await subscriptionService.createSubscriptionOrder({
                username: req.userSession.username,
                planId: req.body?.planId,
                customerNote: req.body?.customerNote,
            });

            res.status(201).json({
                ok: true,
                ...result,
            });
        },

        async updateSubscriptionModelPreference(req, res) {
            const result = await subscriptionService.updateUserModelPreference({
                username: req.userSession.username,
                externalModelName: req.body?.externalModelName,
                allowBalanceFallback: req.body?.allowBalanceFallback,
            });

            res.json({
                ok: true,
                ...result,
            });
        },

        async refreshRechargeOrder(req, res) {
            const result = await billingService.refreshRechargeOrder({
                username: req.userSession.username,
                orderId: req.params.orderId,
            });

            res.json({
                ok: true,
                ...result,
            });
        },
    };
}

module.exports = {
    createBillingController,
};
