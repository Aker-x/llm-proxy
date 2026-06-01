const express = require('express');

function createBillingRoutes({ auth, billingController }) {
    const router = express.Router();

    router.get('/api/user/billing', auth.requireUser, billingController.getBilling);
    router.get('/api/user/subscription', auth.requireUser, billingController.getSubscription);
    router.post('/api/user/recharge-orders', auth.requireUser, billingController.createRechargeOrder);
    router.post('/api/user/subscription-orders', auth.requireUser, billingController.createSubscriptionOrder);
    router.put('/api/user/subscription-model-preferences', auth.requireUser, billingController.updateSubscriptionModelPreference);
    router.post('/api/user/recharge-orders/:orderId/refresh', auth.requireUser, billingController.refreshRechargeOrder);

    return router;
}

module.exports = {
    createBillingRoutes,
};
