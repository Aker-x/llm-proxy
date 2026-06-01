const { createHttpError } = require('../utils/http-error');

function buildLegacySubscriptionFallback(remoteData = {}) {
    const hasLegacyLimits = Array.isArray(remoteData.subscriptionModelLimits)
        && remoteData.subscriptionModelLimits.length > 0;
    const hasLegacyOrders = Array.isArray(remoteData.subscriptionOrders)
        && remoteData.subscriptionOrders.length > 0;
    const hasLegacyUsers = Array.isArray(remoteData.users)
        && remoteData.users.some((user) => String(user?.subscriptionStatus || '').trim() === 'active');

    if (!hasLegacyLimits && !hasLegacyOrders && !hasLegacyUsers) {
        return {
            subscriptionPlans: Array.isArray(remoteData.subscriptionPlans)
                ? remoteData.subscriptionPlans
                : undefined,
            subscriptionPlanModelLimits: Array.isArray(remoteData.subscriptionPlanModelLimits)
                ? remoteData.subscriptionPlanModelLimits
                : undefined,
            users: Array.isArray(remoteData.users) ? remoteData.users : [],
            subscriptionOrders: Array.isArray(remoteData.subscriptionOrders)
                ? remoteData.subscriptionOrders
                : undefined,
        };
    }

    const legacyPlanId = 'legacy-default';
    const legacyPlanName = '默认订阅';
    const setting = Array.isArray(remoteData.subscriptionSettings)
        ? remoteData.subscriptionSettings[0]
        : null;
    const legacyPrice = Number(setting?.monthlyPriceCny || 500);

    const subscriptionPlans = Array.isArray(remoteData.subscriptionPlans) && remoteData.subscriptionPlans.length > 0
        ? remoteData.subscriptionPlans
        : [{
            id: legacyPlanId,
            name: legacyPlanName,
            description: '由旧版单一订阅配置自动迁移',
            enabled: setting?.enabled !== false,
            monthlyPriceCny: Number.isFinite(legacyPrice) && legacyPrice > 0 ? legacyPrice : 500,
            sortOrder: 0,
        }];

    const subscriptionPlanModelLimits = Array.isArray(remoteData.subscriptionPlanModelLimits)
        ? remoteData.subscriptionPlanModelLimits
        : (Array.isArray(remoteData.subscriptionModelLimits)
            ? remoteData.subscriptionModelLimits.map((limit) => ({
                planId: legacyPlanId,
                externalModelName: limit.externalModelName || limit.modelId,
                dailyRequestLimit: Number(limit.dailyRequestLimit || 0),
                updatedAt: limit.updatedAt || null,
            }))
            : undefined);

    const users = Array.isArray(remoteData.users)
        ? remoteData.users.map((user) => {
            if (user.subscriptionPlanId) {
                return user;
            }

            if (String(user.subscriptionStatus || '').trim() !== 'active') {
                return user;
            }

            return {
                ...user,
                subscriptionPlanId: legacyPlanId,
            };
        })
        : [];

    const subscriptionOrders = Array.isArray(remoteData.subscriptionOrders)
        ? remoteData.subscriptionOrders.map((order) => ({
            ...order,
            planId: order.planId || legacyPlanId,
            planName: order.planName || legacyPlanName,
        }))
        : undefined;

    return {
        subscriptionPlans,
        subscriptionPlanModelLimits,
        users,
        subscriptionOrders,
    };
}

class RemoteSyncService {
    constructor({ catalogAdminService }) {
        this.catalogAdminService = catalogAdminService;
    }

    async syncFromRemote({ host, port = 80, username, password }) {
        if (!host || typeof host !== 'string') {
            throw createHttpError(400, '远端服务器 IP 不能为空。');
        }

        const baseUrl = `http://${host}${port && port !== 80 ? `:${port}` : ''}`;
        const loginUrl = `${baseUrl}/api/admin/login`;
        const catalogUrl = `${baseUrl}/api/admin/catalog`;

        let cookie;
        try {
            const loginRes = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username || 'liuzhenyu',
                    password: password || 'Lzy_08032211',
                }),
            });

            if (!loginRes.ok) {
                throw createHttpError(502, `远端服务器认证失败：${loginRes.status} ${loginRes.statusText}`);
            }

            const setCookie = loginRes.headers.get('set-cookie');
            if (!setCookie) {
                throw createHttpError(502, '远端服务器未返回会话 cookie。');
            }
            cookie = setCookie.split(',')[0].split(';')[0];
        } catch (err) {
            if (err.status) {
                throw err;
            }
            throw createHttpError(502, `无法连接远端服务器 ${host}：${err.message}`);
        }

        let remoteData;
        try {
            const catalogRes = await fetch(catalogUrl, {
                method: 'GET',
                headers: { Cookie: cookie },
            });

            if (!catalogRes.ok) {
                throw createHttpError(502, `获取远端 catalog 失败：${catalogRes.status} ${catalogRes.statusText}`);
            }

            remoteData = await catalogRes.json();
        } catch (err) {
            if (err.status) {
                throw err;
            }
            throw createHttpError(502, `读取远端 catalog 数据失败：${err.message}`);
        }

        if (!Array.isArray(remoteData.providers) || !Array.isArray(remoteData.models)) {
            throw createHttpError(502, '远端返回的 catalog 数据格式无效。');
        }

        const normalizedSubscription = buildLegacySubscriptionFallback(remoteData);

        await this.catalogAdminService.replaceSnapshot({
            providers: remoteData.providers,
            models: remoteData.models,
            externalModels: remoteData.externalModels || [],
            externalModelTargets: remoteData.externalModelTargets || [],
            admins: remoteData.admins || [],
            paymentSettings: remoteData.paymentSettings || [],
            users: normalizedSubscription.users,
            userApiKeys: remoteData.userApiKeys || [],
            walletLedger: Array.isArray(remoteData.walletLedger)
                ? remoteData.walletLedger
                : undefined,
            rechargeOrders: remoteData.rechargeOrders || [],
            subscriptionSettings: Array.isArray(remoteData.subscriptionSettings)
                ? remoteData.subscriptionSettings
                : undefined,
            subscriptionPlans: normalizedSubscription.subscriptionPlans,
            subscriptionPlanModelLimits: normalizedSubscription.subscriptionPlanModelLimits,
            subscriptionOrders: normalizedSubscription.subscriptionOrders,
            subscriptionModelLimits: Array.isArray(remoteData.subscriptionModelLimits)
                ? remoteData.subscriptionModelLimits
                : undefined,
        });

        return {
            providers: remoteData.providers.length,
            models: remoteData.models.length,
            externalModels: (remoteData.externalModels || []).length,
            externalModelTargets: (remoteData.externalModelTargets || []).length,
            admins: (remoteData.admins || []).length,
            paymentSettings: (remoteData.paymentSettings || []).length,
            users: normalizedSubscription.users.length,
            userApiKeys: (remoteData.userApiKeys || []).length,
            walletLedger: Array.isArray(remoteData.walletLedger) ? remoteData.walletLedger.length : 0,
            rechargeOrders: (remoteData.rechargeOrders || []).length,
            subscriptionSettings: (remoteData.subscriptionSettings || []).length,
            subscriptionPlans: (normalizedSubscription.subscriptionPlans || []).length,
            subscriptionPlanModelLimits: (normalizedSubscription.subscriptionPlanModelLimits || []).length,
            subscriptionOrders: (normalizedSubscription.subscriptionOrders || []).length,
            subscriptionModelLimits: (remoteData.subscriptionModelLimits || []).length,
        };
    }
}

module.exports = {
    RemoteSyncService,
};
