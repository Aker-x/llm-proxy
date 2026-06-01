class PgPaymentSettingsRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getById(id) {
        const result = await this.pool.query(`
            SELECT
                id,
                enabled,
                mode,
                qr_image_path,
                app_id,
                private_key,
                private_key_path,
                alipay_public_key,
                alipay_public_key_path,
                gateway,
                public_base_url,
                key_type,
                min_recharge_usd,
                min_recharge_cny,
                cny_per_usd,
                updated_at
            FROM payment_settings
            WHERE id = $1
        `, [id]);

        return result.rows[0] || null;
    }

    async upsertAlipay(config) {
        const result = await this.pool.query(`
            INSERT INTO payment_settings (
                id,
                enabled,
                mode,
                qr_image_path,
                app_id,
                private_key,
                private_key_path,
                alipay_public_key,
                alipay_public_key_path,
                gateway,
                public_base_url,
                key_type,
                min_recharge_usd,
                min_recharge_cny,
                cny_per_usd,
                updated_at
            ) VALUES (
                'alipay',
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12::numeric,
                $13::numeric,
                $14::numeric,
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                enabled = EXCLUDED.enabled,
                mode = EXCLUDED.mode,
                qr_image_path = EXCLUDED.qr_image_path,
                app_id = EXCLUDED.app_id,
                private_key = EXCLUDED.private_key,
                private_key_path = EXCLUDED.private_key_path,
                alipay_public_key = EXCLUDED.alipay_public_key,
                alipay_public_key_path = EXCLUDED.alipay_public_key_path,
                gateway = EXCLUDED.gateway,
                public_base_url = EXCLUDED.public_base_url,
                key_type = EXCLUDED.key_type,
                min_recharge_usd = EXCLUDED.min_recharge_usd,
                min_recharge_cny = EXCLUDED.min_recharge_cny,
                cny_per_usd = EXCLUDED.cny_per_usd,
                updated_at = NOW()
            RETURNING
                id,
                enabled,
                mode,
                qr_image_path,
                app_id,
                private_key,
                private_key_path,
                alipay_public_key,
                alipay_public_key_path,
                gateway,
                public_base_url,
                key_type,
                min_recharge_usd,
                min_recharge_cny,
                cny_per_usd,
                updated_at
        `, [
            Boolean(config.enabled),
            String(config.mode || 'manual_qr'),
            String(config.qrImagePath || '/assets/images/alipay-receive-qr.jpg'),
            String(config.appId || ''),
            String(config.privateKey || ''),
            String(config.privateKeyPath || ''),
            String(config.alipayPublicKey || ''),
            String(config.alipayPublicKeyPath || ''),
            String(config.gateway || 'https://openapi.alipay.com/gateway.do'),
            String(config.publicBaseUrl || ''),
            String(config.keyType || 'PKCS8'),
            Number(config.minRechargeUsd || 1).toFixed(6),
            Number(config.minRechargeCny || 10).toFixed(6),
            Number(config.cnyPerUsd || 7).toFixed(6),
        ]);

        return result.rows[0] || null;
    }
}

module.exports = {
    PgPaymentSettingsRepository,
};
