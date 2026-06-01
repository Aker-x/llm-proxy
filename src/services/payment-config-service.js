const { createDefaultPaymentsConfig } = require('../schemas/config-schema');
const { createHttpError } = require('../utils/http-error');

function roundPaymentAmount(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return fallback;
    }

    return Number(numericValue.toFixed(6));
}

class PaymentConfigService {
    constructor({ paymentSettingsRepository }) {
        this.paymentSettingsRepository = paymentSettingsRepository;
    }

    async getAlipayConfig() {
        const defaults = createDefaultPaymentsConfig().alipay;
        const row = await this.paymentSettingsRepository.getById('alipay');
        if (!row) {
            return defaults;
        }

        return {
            enabled: Boolean(row.enabled),
            mode: row.mode || defaults.mode,
            qrImagePath: row.qr_image_path || defaults.qrImagePath,
            appId: row.app_id || '',
            privateKey: row.private_key || '',
            privateKeyPath: row.private_key_path || '',
            alipayPublicKey: row.alipay_public_key || '',
            alipayPublicKeyPath: row.alipay_public_key_path || '',
            gateway: row.gateway || defaults.gateway,
            publicBaseUrl: row.public_base_url || '',
            keyType: row.key_type || defaults.keyType,
            minRechargeUsd: Number(row.min_recharge_usd || defaults.minRechargeUsd || 1),
            minRechargeCny: roundPaymentAmount(
                row.min_recharge_cny,
                roundPaymentAmount(Number(row.min_recharge_usd || defaults.minRechargeUsd || 1)
                    * Number(row.cny_per_usd || defaults.cnyPerUsd || 7), 10)
            ),
            cnyPerUsd: Number(row.cny_per_usd || defaults.cnyPerUsd || 7),
        };
    }

    async getBillingConfig() {
        const alipayConfig = await this.getAlipayConfig();
        return {
            currency: 'USD',
            rechargeEnabled: Boolean(alipayConfig.enabled),
            minimumRechargeUsd: roundPaymentAmount(
                Number(alipayConfig.minRechargeCny || 10) / Number(alipayConfig.cnyPerUsd || 7),
                1
            ),
            minimumRechargeCny: roundPaymentAmount(alipayConfig.minRechargeCny, 10),
            cnyPerUsd: Number(Number(alipayConfig.cnyPerUsd || 7).toFixed(6)) || 7,
            paymentChannel: 'Alipay',
            paymentMode: String(alipayConfig.mode || 'manual_qr'),
            qrImagePath: String(alipayConfig.qrImagePath || '/assets/images/alipay-receive-qr.jpg'),
        };
    }

    async getAdminPaymentSettings() {
        const row = await this.paymentSettingsRepository.getById('alipay');
        const alipayConfig = await this.getAlipayConfig();
        const minRechargeCny = roundPaymentAmount(alipayConfig.minRechargeCny, 10);
        return {
            enabled: Boolean(alipayConfig.enabled),
            minRechargeUsd: roundPaymentAmount(minRechargeCny / Number(alipayConfig.cnyPerUsd || 7), 1),
            minRechargeCny,
            cnyPerUsd: Number(Number(alipayConfig.cnyPerUsd || 7).toFixed(6)) || 7,
            updatedAt: row?.updated_at || null,
        };
    }

    async updateAdminPaymentSettings(payload = {}) {
        const currentConfig = await this.getAlipayConfig();
        const nextConfig = {
            ...currentConfig,
        };

        if (payload.enabled !== undefined) {
            nextConfig.enabled = Boolean(payload.enabled);
        }

        if (payload.minRechargeCny !== undefined || payload.minRechargeUsd !== undefined) {
            const minRechargeCny = Number(payload.minRechargeCny ?? payload.minRechargeUsd);
            if (!Number.isFinite(minRechargeCny) || minRechargeCny <= 0) {
                throw createHttpError(400, 'Minimum recharge amount must be greater than 0.');
            }
            nextConfig.minRechargeCny = Number(minRechargeCny.toFixed(6));
        }

        if (payload.cnyPerUsd !== undefined) {
            const cnyPerUsd = Number(payload.cnyPerUsd);
            if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) {
                throw createHttpError(400, 'CNY per USD must be greater than 0.');
            }
            nextConfig.cnyPerUsd = Number(cnyPerUsd.toFixed(6));
        }

        nextConfig.minRechargeUsd = roundPaymentAmount(
            Number(nextConfig.minRechargeCny || 10) / Number(nextConfig.cnyPerUsd || 7),
            1
        );

        const saved = await this.paymentSettingsRepository.upsertAlipay(nextConfig);
        const minRechargeCny = roundPaymentAmount(saved?.min_recharge_cny || nextConfig.minRechargeCny, 10);
        const cnyPerUsd = Number(Number(saved?.cny_per_usd || nextConfig.cnyPerUsd || 7).toFixed(6)) || 7;

        return {
            enabled: Boolean(saved?.enabled),
            minRechargeUsd: roundPaymentAmount(minRechargeCny / cnyPerUsd, 1),
            minRechargeCny,
            cnyPerUsd,
            updatedAt: saved?.updated_at || null,
        };
    }
}

module.exports = {
    PaymentConfigService,
};
