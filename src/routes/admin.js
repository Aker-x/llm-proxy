const express = require('express');

function createAdminRoutes({ adminController, auth }) {
    const router = express.Router();

    router.get('/api/admin/users', auth.requireAdmin, adminController.getUsers);
    router.post('/api/admin/users', auth.requireAdmin, adminController.createUser);
    router.put('/api/admin/users/:username/password', auth.requireAdmin, adminController.updateUserPassword);
    router.put('/api/admin/users/:username/rate-limit', auth.requireAdmin, adminController.updateUserRateLimit);
    router.post('/api/admin/users/:username/credit', auth.requireAdmin, adminController.creditUserBalance);
    router.delete('/api/admin/users/:username', auth.requireAdmin, adminController.deleteUser);
    router.post('/api/admin/recharge-orders/:orderId/approve', auth.requireAdmin, adminController.approveRechargeOrder);
    router.post('/api/admin/recharge-orders/:orderId/reject', auth.requireAdmin, adminController.rejectRechargeOrder);
    router.get('/api/admin/payment-settings', auth.requireAdmin, adminController.getPaymentSettings);
    router.put('/api/admin/payment-settings', auth.requireAdmin, adminController.updatePaymentSettings);
    router.get('/api/admin/subscription', auth.requireAdmin, adminController.getSubscriptionOverview);
    router.get('/api/admin/auth-files', auth.requireAdmin, adminController.getAuthFiles);
    router.post('/api/admin/auth-files', auth.requireAdmin, adminController.createAuthFile);
    router.delete('/api/admin/auth-files', auth.requireAdmin, adminController.deleteAuthFile);
    router.put('/api/admin/subscription/settings', auth.requireAdmin, adminController.updateSubscriptionSettings);
    router.post('/api/admin/subscription/plans', auth.requireAdmin, adminController.createSubscriptionPlan);
    router.put('/api/admin/subscription/plans/:planId', auth.requireAdmin, adminController.updateSubscriptionPlan);
    router.delete('/api/admin/subscription/plans/:planId', auth.requireAdmin, adminController.deleteSubscriptionPlan);
    router.post('/api/admin/subscription-orders/:orderId/approve', auth.requireAdmin, adminController.approveSubscriptionOrder);
    router.post('/api/admin/subscription-orders/:orderId/reject', auth.requireAdmin, adminController.rejectSubscriptionOrder);
    router.get('/api/admin/providers', auth.requireAdmin, adminController.getProviders);
    router.post('/api/admin/providers', auth.requireAdmin, adminController.createProvider);
    router.put('/api/admin/providers/:providerId', auth.requireAdmin, adminController.updateProvider);
    router.delete('/api/admin/providers/:providerId', auth.requireAdmin, adminController.deleteProvider);
    router.post('/api/admin/models', auth.requireAdmin, adminController.createModel);
    router.put('/api/admin/models/:modelId', auth.requireAdmin, adminController.updateModel);
    router.delete('/api/admin/models/:modelId', auth.requireAdmin, adminController.deleteModel);
    router.post('/api/admin/models/:modelId/test', auth.requireAdmin, adminController.testModel);
    router.post('/api/admin/external-models', auth.requireAdmin, adminController.createExternalModel);
    router.put('/api/admin/external-models/:name', auth.requireAdmin, adminController.updateExternalModel);
    router.delete('/api/admin/external-models/:name', auth.requireAdmin, adminController.deleteExternalModel);
    router.get('/api/admin/recent-requests', auth.requireAdmin, adminController.getRecentRequests);
    router.get('/api/admin/stats', auth.requireAdmin, adminController.getStats);
    router.post('/api/admin/stats/users/reset', auth.requireAdmin, adminController.resetAllUserCosts);
    router.post('/api/admin/stats/users/:username/reset', auth.requireAdmin, adminController.resetUserCost);
    router.post('/api/admin/sync-from-remote', auth.requireAdmin, adminController.syncFromRemote);
    router.get('/api/admin/catalog', auth.requireAdmin, adminController.exportCatalog);

    return router;
}

module.exports = {
    createAdminRoutes,
};
