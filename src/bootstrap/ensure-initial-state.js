const {
    buildInitialAdmins,
    buildInitialUsers,
    createDefaultPaymentsConfig,
} = require('../schemas/config-schema');

async function ensureInitialState({
    adminRepository,
    userRepository,
    paymentSettingsRepository,
}) {
    const [admins, users, paymentSettings] = await Promise.all([
        adminRepository.listAll(),
        userRepository.listAll(),
        paymentSettingsRepository.getById('alipay'),
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
}

module.exports = {
    ensureInitialState,
};
