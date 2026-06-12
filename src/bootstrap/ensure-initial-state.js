const {
    buildInitialAdmins,
    buildInitialUsers,
    createDefaultPaymentsConfig,
} = require('../schemas/config-schema');

async function ensureInitialState({
    adminRepository,
    userRepository,
    paymentSettingsRepository,
    rateLimitSettingsRepository,
}) {
    const [admins, users, paymentSettings, rateLimitSettings] = await Promise.all([
        adminRepository.listAll(),
        userRepository.listAll(),
        paymentSettingsRepository.getById('alipay'),
        rateLimitSettingsRepository ? rateLimitSettingsRepository.getById('default') : Promise.resolve(null),
    ]);

    if (!admins.length) {
        for (const admin of buildInitialAdmins()) {
            await adminRepository.upsert(admin);
        }
    }

    if (!users.length) {
        for (const user of buildInitialUsers()) {
            const wallet = user.wallet || {};
            await userRepository.upsert({
                username: user.username,
                password: user.password,
                balanceUsd: wallet.balanceUsd || 0,
                totalRechargedUsd: wallet.totalRechargedUsd || 0,
                totalSpentUsd: wallet.totalSpentUsd || 0,
                lastRechargedAt: wallet.lastRechargedAt || null,
            });
        }
    }

    if (!paymentSettings) {
        await paymentSettingsRepository.upsertAlipay(createDefaultPaymentsConfig().alipay);
    }

    if (rateLimitSettingsRepository && !rateLimitSettings) {
        await rateLimitSettingsRepository.upsertDefault({
            enabled: false,
            requestsPerMinute: 60,
        });
    }
}

module.exports = {
    ensureInitialState,
};
