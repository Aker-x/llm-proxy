const { createHttpError } = require('../utils/http-error');
const { sanitizeHeadersForLog } = require('../utils/sanitize');

function createAdminController({
    accountService,
    sessionService,
    statsService,
    proxyService,
    userRepository,
    billingService,
    subscriptionService,
    catalogAdminService,
    remoteSyncService,
    authManagementService,
    paymentConfigService,
}) {
    return {
        async getUsers(_req, res) {
            res.json({
                users: await accountService.listAccounts(),
            });
        },

        async createUser(req, res) {
            const result = await accountService.createAccount(req.body);
            res.status(201).json({
                ok: true,
                user: {
                    username: result.account.username,
                    role: result.role,
                    apiKeyCount: 0,
                },
            });
        },

        async updateUserPassword(req, res) {
            const result = await accountService.updateAccountPassword(req.params.username, req.body);
            await sessionService.deleteSessionsForUser(result.account.username, result.role);
            res.json({
                ok: true,
                user: {
                    username: result.account.username,
                    role: result.role,
                    apiKeyCount: result.role === 'user'
                        ? (await accountService.listUserApiKeys(result.account.username)).length
                        : 0,
                },
            });
        },

        async updateUserRateLimit(req, res) {
            const result = await accountService.updateUserRateLimit(req.params.username, req.body || {});
            res.json({
                ok: true,
                user: {
                    username: result.account.username,
                    role: result.role,
                    upstreamRateLimitEnabled: result.account.upstream_rate_limit_enabled === true,
                    upstreamRateLimitIntervalSeconds: Number(result.account.upstream_rate_limit_interval_seconds || 60),
                    upstreamRateLimitLastRequestAt: result.account.upstream_rate_limit_last_request_at || null,
                },
            });
        },

        async deleteUser(req, res) {
            const username = String(req.params.username || '').trim();
            const account = await accountService.getAccountByUsername(username);
            if (!account) {
                throw createHttpError(404, 'Account not found.');
            }

            const deleted = await accountService.deleteAccount(username);
            await sessionService.deleteSessionsForUser(username, deleted.role);
            await statsService.deleteUserStats(username);
            res.json({ ok: true });
        },

        async getProviders(_req, res) {
            res.json(await catalogAdminService.getAdminCatalogResponse());
        },

        async createProvider(req, res) {
            const provider = await catalogAdminService.createProvider(req.body);
            res.json({ ok: true, provider });
        },

        async updateProvider(req, res) {
            const provider = await catalogAdminService.updateProvider(req.params.providerId, req.body);
            res.json({ ok: true, provider });
        },

        async deleteProvider(req, res) {
            await catalogAdminService.deleteProvider(req.params.providerId);
            res.json({ ok: true });
        },

        async createModel(req, res) {
            const model = await catalogAdminService.createModel(req.body);
            res.json({ ok: true, model });
        },

        async updateModel(req, res) {
            const model = await catalogAdminService.updateModel(req.params.modelId, req.body);
            res.json({ ok: true, model });
        },

        async deleteModel(req, res) {
            await catalogAdminService.deleteModel(req.params.modelId);
            res.json({ ok: true });
        },

        async testModel(req, res) {
            const result = await proxyService.testModelConnectivity({
                modelId: req.params.modelId,
                requestId: req.requestId,
                clientHeaders: sanitizeHeadersForLog(req.headers),
            });
            res.json(result);
        },

        async createExternalModel(req, res) {
            const externalModel = await catalogAdminService.createExternalModel(req.body);
            res.json({ ok: true, externalModel });
        },

        async updateExternalModel(req, res) {
            const externalModel = await catalogAdminService.updateExternalModel(req.params.name, req.body);
            res.json({ ok: true, externalModel });
        },

        async deleteExternalModel(req, res) {
            await catalogAdminService.deleteExternalModel(req.params.name);
            res.json({ ok: true });
        },

        async getStats(_req, res) {
            const accounts = await accountService.listAccounts();
            const usernames = accounts.map((account) => account.username);
            const stats = await statsService.getAdminStats(usernames);
            const accountsByUsername = new Map(accounts.map((account) => [account.username, account]));
            const decorateUserStats = (item) => ({
                ...item,
                role: accountsByUsername.get(item.username)?.role || 'user',
                balanceUsd: Number(accountsByUsername.get(item.username)?.balanceUsd || 0),
                totalRechargedUsd: Number(accountsByUsername.get(item.username)?.totalRechargedUsd || 0),
                totalSpentUsd: Number(accountsByUsername.get(item.username)?.totalSpentUsd || 0),
            });

            res.json({
                ...stats,
                users: (stats.users || []).map(decorateUserStats),
                userModelUsage: (stats.userModelUsage || []).map(decorateUserStats),
                todayUserModelUsage: (stats.todayUserModelUsage || []).map(decorateUserStats),
                rechargeOrders: await billingService.getAdminRechargeOrders(),
            });
        },

        async getSubscriptionOverview(_req, res) {
            res.json(await subscriptionService.getAdminOverview());
        },

        async getPaymentSettings(_req, res) {
            res.json(await paymentConfigService.getAdminPaymentSettings());
        },

        async updatePaymentSettings(req, res) {
            const result = await paymentConfigService.updateAdminPaymentSettings(req.body || {});
            res.json({
                ok: true,
                ...result,
            });
        },

        async getAuthFiles(_req, res) {
            res.json(await authManagementService.getAuthFiles());
        },

        async createAuthFile(req, res) {
            const result = await authManagementService.createAuthFile(req.body || {});
            res.status(201).json(result);
        },

        async deleteAuthFile(req, res) {
            const result = await authManagementService.deleteAuthFile(req.body || {});
            res.json(result);
        },

        async updateSubscriptionSettings(req, res) {
            const result = await subscriptionService.updateSettings(req.body || {});
            res.json({
                ok: true,
                ...result,
            });
        },

        async createSubscriptionPlan(req, res) {
            const result = await subscriptionService.createPlan(req.body || {});
            res.status(201).json({
                ok: true,
                ...result,
            });
        },

        async updateSubscriptionPlan(req, res) {
            const result = await subscriptionService.updatePlan(req.params.planId, req.body || {});
            res.json({
                ok: true,
                ...result,
            });
        },

        async deleteSubscriptionPlan(req, res) {
            const result = await subscriptionService.deletePlan(req.params.planId);
            res.json({
                ok: true,
                ...result,
            });
        },

        async getRecentRequests(_req, res) {
            res.json({
                recentRequests: await statsService.getRecentRequests(50),
            });
        },

        async creditUserBalance(req, res) {
            const username = String(req.params.username || '').trim();
            if (!(await userRepository.getByUsername(username))) {
                throw createHttpError(404, 'User not found.');
            }

            const result = await billingService.updateUserBalance({
                username,
                balanceUsd: req.body?.balanceUsd,
                amountUsd: req.body?.amountUsd,
                subject: req.body?.subject,
                operator: req.adminSession?.username,
            });
            res.json({ ok: true, ...result });
        },

        async approveRechargeOrder(req, res) {
            const result = await billingService.approveRechargeOrder({
                orderId: req.params.orderId,
                reviewedBy: req.adminSession?.username,
                reviewNote: req.body?.reviewNote,
            });
            res.json({ ok: true, ...result });
        },

        async rejectRechargeOrder(req, res) {
            const result = await billingService.rejectRechargeOrder({
                orderId: req.params.orderId,
                reviewedBy: req.adminSession?.username,
                reviewNote: req.body?.reviewNote,
                reason: req.body?.reason,
            });
            res.json({ ok: true, ...result });
        },

        async approveSubscriptionOrder(req, res) {
            const result = await subscriptionService.approveOrder({
                orderId: req.params.orderId,
                reviewedBy: req.adminSession?.username,
                reviewNote: req.body?.reviewNote,
            });
            res.json({ ok: true, ...result });
        },

        async rejectSubscriptionOrder(req, res) {
            const result = await subscriptionService.rejectOrder({
                orderId: req.params.orderId,
                reviewedBy: req.adminSession?.username,
                reviewNote: req.body?.reviewNote,
                reason: req.body?.reason,
            });
            res.json({ ok: true, ...result });
        },

        async resetUserCost(req, res) {
            const username = String(req.params.username || '').trim();
            if (!(await accountService.getAccountByUsername(username))) {
                throw createHttpError(404, 'Account not found.');
            }

            const summary = await statsService.resetUserCost(username);
            res.json({ ok: true, summary });
        },

        async resetAllUserCosts(_req, res) {
            const usernames = await accountService.getAllAccountUsernames();
            const summaries = await statsService.resetAllUserCosts(usernames);
            res.json({ ok: true, summaries });
        },

        async syncFromRemote(req, res) {
            const result = await remoteSyncService.syncFromRemote(req.body);
            res.json({ ok: true, ...result });
        },

        async exportCatalog(_req, res) {
            res.json(await catalogAdminService.exportCatalog());
        },
    };
}

module.exports = {
    createAdminController,
};
