const {
    normalizeConnectivityStatus,
    normalizeExternalModelConfig,
    normalizeModelConfig,
    normalizeProviderConfig,
    sanitizeAdminExternalModel,
    sanitizeAdminModel,
    sanitizeAdminProvider,
    validateExternalModelPayload,
    validateModelPayload,
    validateProviderPayload,
} = require('../schemas/config-schema');
const { withPgTransaction } = require('../repositories/pg/shared');
const { createHttpError } = require('../utils/http-error');
const { normalizeProviderId, normalizeStoredId } = require('../utils/normalizers');

function mapProviderRow(row = {}) {
    return {
        id: row.id,
        apiBaseUrl: row.api_base_url,
        apiKey: row.api_key,
    };
}

function mapModelRow(row = {}) {
    return {
        id: row.id,
        providerId: row.provider_id,
        upstreamModel: row.upstream_model,
        upstreamApi: row.upstream_api,
        enabled: row.enabled !== false,
        connectivityStatus: {
            status: row.connectivity_status || 'unknown',
            testedAt: row.connectivity_tested_at || '',
            message: row.connectivity_message || '',
            statusCode: Number(row.connectivity_status_code || 0),
            latencyMs: Number(row.connectivity_latency_ms || 0),
        },
    };
}

function mapExternalModelRow(row = {}) {
    return {
        name: row.name,
        strategy: row.strategy || 'round_robin',
        pricing: {
            currency: row.pricing_currency || 'USD',
            inputPerMillionTokens: Number(row.input_per_million_tokens || 0),
            outputPerMillionTokens: Number(row.output_per_million_tokens || 0),
            cachedInputPerMillionTokens: Number(row.cached_input_per_million_tokens || 0),
            cacheCreationPerMillionTokens: Number(row.cache_creation_per_million_tokens || 0),
            thinkingPerMillionTokens: Number(
                row.thinking_per_million_tokens
                || row.output_per_million_tokens
                || 0
            ),
            imagePerUnit: Number(row.image_per_unit || 0),
            requestFlatFee: Number(row.request_flat_fee || 0),
            priceMultiplier: Number(row.price_multiplier || 1.5),
        },
        updatedAt: row.updated_at,
    };
}

function mapAdminRow(row = {}) {
    return {
        username: row.username,
        password: row.password,
        updatedAt: row.updated_at,
    };
}

function mapPaymentSettingRow(row = {}) {
    return {
        id: row.id,
        enabled: row.enabled,
        mode: row.mode,
        qrImagePath: row.qr_image_path,
        appId: row.app_id,
        privateKey: row.private_key,
        privateKeyPath: row.private_key_path,
        alipayPublicKey: row.alipay_public_key,
        alipayPublicKeyPath: row.alipay_public_key_path,
        gateway: row.gateway,
        publicBaseUrl: row.public_base_url,
        keyType: row.key_type,
        minRechargeUsd: Number(row.min_recharge_usd || 0),
        minRechargeCny: Number(row.min_recharge_cny || 0),
        cnyPerUsd: Number(row.cny_per_usd || 0),
        updatedAt: row.updated_at,
    };
}

function mapUserRow(row = {}) {
    return {
        username: row.username,
        password: row.password,
        balanceUsd: Number(row.balance_usd || 0),
        totalRechargedUsd: Number(row.total_recharged_usd || 0),
        totalSpentUsd: Number(row.total_spent_usd || 0),
        lastRechargedAt: row.last_recharged_at,
        subscriptionStatus: row.subscription_status || 'inactive',
        subscriptionStartedAt: row.subscription_started_at || null,
        subscriptionExpiresAt: row.subscription_expires_at || null,
        subscriptionPlanId: row.subscription_plan_id || '',
        updatedAt: row.updated_at,
    };
}

function mapUserApiKeyRow(row = {}) {
    return {
        id: row.id,
        username: row.username,
        name: row.name,
        apiKey: row.api_key,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
    };
}

function mapWalletLedgerRow(row = {}) {
    return {
        id: String(row.id),
        username: row.username,
        requestId: row.request_id,
        entryType: row.entry_type,
        amountUsd: Number(row.amount_usd || 0),
        balanceAfterUsd: Number(row.balance_after_usd || 0),
        createdAt: row.created_at,
    };
}

function mapRechargeOrderRow(row = {}) {
    return {
        id: row.id,
        username: row.username,
        outTradeNo: row.out_trade_no,
        paymentMethod: row.payment_method,
        status: row.status,
        amountUsd: Number(row.amount_usd || 0),
        amountCny: Number(row.amount_cny || 0),
        cnyPerUsd: Number(row.cny_per_usd || 0),
        subject: row.subject,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        paidAt: row.paid_at,
        tradeNo: row.trade_no,
        buyerLogonId: row.buyer_logon_id,
        tradeStatus: row.trade_status,
        customerNote: row.customer_note,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
        failureReason: row.failure_reason,
    };
}

function mapSubscriptionSettingRow(row = {}) {
    return {
        id: row.id,
        enabled: row.enabled !== false,
        quotaConsumptionEnabled: row.quota_consumption_enabled !== false,
        monthlyPriceCny: Number(row.monthly_price_cny || 0),
        updatedAt: row.updated_at,
    };
}

function mapSubscriptionOrderRow(row = {}) {
    return {
        id: row.id,
        username: row.username,
        planId: row.plan_id || '',
        planName: row.snapshot_plan_name || '',
        status: row.status,
        months: Number(row.months || 1),
        amountCny: Number(row.amount_cny || 0),
        snapshotMonthlyPriceCny: Number(row.snapshot_monthly_price_cny || 0),
        subject: row.subject,
        customerNote: row.customer_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        reviewNote: row.review_note,
        failureReason: row.failure_reason,
        approvedStartedAt: row.approved_started_at,
        approvedExpiresAt: row.approved_expires_at,
    };
}

function mapSubscriptionPlanRow(row = {}) {
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        enabled: row.enabled !== false,
        monthlyPriceCny: Number(row.monthly_price_cny || 0),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSubscriptionPlanModelLimitRow(row = {}) {
    return {
        planId: row.plan_id,
        externalModelName: row.external_model_name,
        dailyRequestLimit: Number(row.daily_request_limit || 0),
        updatedAt: row.updated_at,
    };
}

function mapSubscriptionModelLimitRow(row = {}) {
    return {
        externalModelName: row.external_model_name,
        dailyRequestLimit: Number(row.daily_request_limit || 0),
        updatedAt: row.updated_at,
    };
}

class CatalogAdminService {
    constructor({
        pool,
        providerRepository,
        modelRepository,
        externalModelRepository,
        modelResolutionService,
    }) {
        this.pool = pool;
        this.providerRepository = providerRepository;
        this.modelRepository = modelRepository;
        this.externalModelRepository = externalModelRepository;
        this.modelResolutionService = modelResolutionService;
    }

    async loadSnapshot() {
        const [
            providerRows,
            modelRows,
            externalModelRows,
            externalModelTargetRows,
            adminRows,
            paymentSettingRows,
            userRows,
            userApiKeyRows,
            walletLedgerRows,
            rechargeOrderRows,
            subscriptionSettingRows,
            subscriptionPlanRows,
            subscriptionPlanModelLimitRows,
            subscriptionOrderRows,
            subscriptionModelLimitRows,
        ] = await Promise.all([
            this.providerRepository.listAll(),
            this.modelRepository.listAll(),
            this.externalModelRepository.listAll(),
            this.externalModelRepository.listTargets(),
            this.pool.query('SELECT * FROM admins ORDER BY username'),
            this.pool.query('SELECT * FROM payment_settings ORDER BY id'),
            this.pool.query('SELECT * FROM users ORDER BY username'),
            this.pool.query('SELECT * FROM user_api_keys ORDER BY created_at'),
            this.pool.query('SELECT * FROM wallet_ledger ORDER BY id'),
            this.pool.query('SELECT * FROM recharge_orders ORDER BY created_at'),
            this.pool.query('SELECT * FROM subscription_settings ORDER BY id'),
            this.pool.query('SELECT * FROM subscription_plans ORDER BY sort_order, created_at, id'),
            this.pool.query('SELECT * FROM subscription_plan_model_limits ORDER BY plan_id, external_model_name'),
            this.pool.query('SELECT * FROM subscription_orders ORDER BY created_at'),
            this.pool.query('SELECT * FROM subscription_model_limits ORDER BY external_model_name'),
        ]);

        return {
            providers: providerRows.map(mapProviderRow),
            models: modelRows.map(mapModelRow),
            externalModels: externalModelRows.map(mapExternalModelRow),
            externalModelTargets: externalModelTargetRows,
            admins: adminRows.rows.map(mapAdminRow),
            paymentSettings: paymentSettingRows.rows.map(mapPaymentSettingRow),
            users: userRows.rows.map(mapUserRow),
            userApiKeys: userApiKeyRows.rows.map(mapUserApiKeyRow),
            walletLedger: walletLedgerRows.rows.map(mapWalletLedgerRow),
            rechargeOrders: rechargeOrderRows.rows.map(mapRechargeOrderRow),
            subscriptionSettings: subscriptionSettingRows.rows.map(mapSubscriptionSettingRow),
            subscriptionPlans: subscriptionPlanRows.rows.map(mapSubscriptionPlanRow),
            subscriptionPlanModelLimits: subscriptionPlanModelLimitRows.rows.map(mapSubscriptionPlanModelLimitRow),
            subscriptionOrders: subscriptionOrderRows.rows.map(mapSubscriptionOrderRow),
            subscriptionModelLimits: subscriptionModelLimitRows.rows.map(mapSubscriptionModelLimitRow),
        };
    }

    findProviderById(providers, providerId) {
        const normalizedId = normalizeStoredId(providerId);
        return providers.find((item) => item.id === normalizedId)
            || providers.find((item) => normalizeProviderId(item.id) === normalizeProviderId(normalizedId))
            || null;
    }

    findModelById(models, modelId) {
        const normalizedId = normalizeStoredId(modelId);
        return models.find((item) => item.id === normalizedId)
            || models.find((item) => normalizeProviderId(item.id) === normalizeProviderId(normalizedId))
            || null;
    }

    findExternalModelByName(externalModels, name) {
        const normalizedName = String(name || '').trim();
        return externalModels.find((item) => String(item.name || '').trim() === normalizedName) || null;
    }

    removeTargetsForMissingModels(externalModelTargets, models) {
        const modelIds = new Set(models.map((model) => model.id));
        return externalModelTargets.filter((target) => modelIds.has(target.modelId));
    }

    removeExternalModelsWithoutTargets(externalModels, externalModelTargets) {
        const externalModelNames = new Set(externalModelTargets.map((target) => target.externalModelName));
        return externalModels.filter((item) => externalModelNames.has(item.name));
    }

    collectSubscriptionPlanReferences(snapshot, externalModelNames = []) {
        const normalizedNames = new Set(
            (Array.isArray(externalModelNames) ? externalModelNames : [])
                .map((item) => String(item || '').trim())
                .filter(Boolean)
        );
        if (normalizedNames.size === 0) {
            return [];
        }

        const planNameById = new Map(
            (snapshot.subscriptionPlans || []).map((plan) => [
                String(plan.id || '').trim(),
                String(plan.name || '').trim() || String(plan.id || '').trim() || 'unknown plan',
            ])
        );
        const blockedMap = new Map();

        for (const limit of snapshot.subscriptionPlanModelLimits || []) {
            const externalModelName = String(limit.externalModelName || '').trim();
            if (!normalizedNames.has(externalModelName)) {
                continue;
            }

            if (!blockedMap.has(externalModelName)) {
                blockedMap.set(externalModelName, new Set());
            }

            const planId = String(limit.planId || '').trim();
            blockedMap.get(externalModelName).add(
                planNameById.get(planId) || planId || 'unknown plan'
            );
        }

        return Array.from(blockedMap.entries()).map(([externalModelName, planNames]) => ({
            externalModelName,
            planNames: Array.from(planNames).sort((left, right) => left.localeCompare(right)),
        }));
    }

    assertExternalModelsNotReferenced(snapshot, externalModelNames = [], actionDescription = 'remove these external models') {
        const references = this.collectSubscriptionPlanReferences(snapshot, externalModelNames);
        if (references.length === 0) {
            return;
        }

        const details = references
            .map((item) => `${item.externalModelName} (${item.planNames.join(', ')})`)
            .join('; ');
        throw createHttpError(
            409,
            `Cannot ${actionDescription} because they are still used by subscription plans: ${details}.`
        );
    }

    remapExternalModelTargetsModelIds(externalModelTargets, modelIdMap) {
        return externalModelTargets.map((target) => (
            modelIdMap.has(target.modelId)
                ? { ...target, modelId: modelIdMap.get(target.modelId) }
                : target
        ));
    }

    remapExternalModelReferences(items = [], fromExternalModelName, toExternalModelName) {
        const fromName = String(fromExternalModelName || '').trim();
        const toName = String(toExternalModelName || '').trim();
        if (!fromName || !toName || fromName === toName) {
            return Array.isArray(items) ? items : [];
        }

        return (Array.isArray(items) ? items : []).map((item) => (
            String(item.externalModelName || '').trim() === fromName
                ? { ...item, externalModelName: toName }
                : item
        ));
    }

    async replaceSnapshot({
        providers,
        models,
        externalModels,
        externalModelTargets,
        admins,
        paymentSettings,
        users,
        userApiKeys,
        walletLedger,
        rechargeOrders,
        subscriptionSettings,
        subscriptionPlans,
        subscriptionPlanModelLimits,
        subscriptionOrders,
        subscriptionModelLimits,
    }) {
        const normalizedTargets = this.removeTargetsForMissingModels(externalModelTargets, models);
        const normalizedExternalModels = this.removeExternalModelsWithoutTargets(externalModels, normalizedTargets);

        await withPgTransaction(this.pool, async (client) => {
            for (const provider of providers) {
                await client.query(`
                    INSERT INTO providers (id, api_base_url, api_key, updated_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        api_base_url = EXCLUDED.api_base_url,
                        api_key = EXCLUDED.api_key,
                        updated_at = NOW()
                `, [
                    provider.id,
                    provider.apiBaseUrl,
                    provider.apiKey,
                ]);
            }

            for (const model of models) {
                await client.query(`
                    INSERT INTO models (
                        id,
                        provider_id,
                        upstream_model,
                        upstream_api,
                        enabled,
                        connectivity_status,
                        connectivity_tested_at,
                        connectivity_message,
                        connectivity_status_code,
                        connectivity_latency_ms
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        provider_id = EXCLUDED.provider_id,
                        upstream_model = EXCLUDED.upstream_model,
                        upstream_api = EXCLUDED.upstream_api,
                        enabled = EXCLUDED.enabled,
                        connectivity_status = EXCLUDED.connectivity_status,
                        connectivity_tested_at = EXCLUDED.connectivity_tested_at,
                        connectivity_message = EXCLUDED.connectivity_message,
                        connectivity_status_code = EXCLUDED.connectivity_status_code,
                        connectivity_latency_ms = EXCLUDED.connectivity_latency_ms
                `, [
                    model.id,
                    model.providerId,
                    model.upstreamModel,
                    model.upstreamApi,
                    model.enabled !== false,
                    model.connectivityStatus?.status || 'unknown',
                    model.connectivityStatus?.testedAt || null,
                    model.connectivityStatus?.message || '',
                    Number(model.connectivityStatus?.statusCode || 0),
                    Number(model.connectivityStatus?.latencyMs || 0),
                ]);
            }

            for (const externalModel of normalizedExternalModels) {
                await client.query(`
                    INSERT INTO external_models (
                        name,
                        strategy,
                        pricing_currency,
                        input_per_million_tokens,
                        output_per_million_tokens,
                        cached_input_per_million_tokens,
                        cache_creation_per_million_tokens,
                        thinking_per_million_tokens,
                        image_per_unit,
                        request_flat_fee,
                        price_multiplier,
                        updated_at
                    )
                    VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11::numeric, NOW())
                    ON CONFLICT (name) DO UPDATE SET
                        strategy = EXCLUDED.strategy,
                        pricing_currency = EXCLUDED.pricing_currency,
                        input_per_million_tokens = EXCLUDED.input_per_million_tokens,
                        output_per_million_tokens = EXCLUDED.output_per_million_tokens,
                        cached_input_per_million_tokens = EXCLUDED.cached_input_per_million_tokens,
                        cache_creation_per_million_tokens = EXCLUDED.cache_creation_per_million_tokens,
                        thinking_per_million_tokens = EXCLUDED.thinking_per_million_tokens,
                        image_per_unit = EXCLUDED.image_per_unit,
                        request_flat_fee = EXCLUDED.request_flat_fee,
                        price_multiplier = EXCLUDED.price_multiplier,
                        updated_at = NOW()
                `, [
                    externalModel.name,
                    externalModel.strategy || 'round_robin',
                    externalModel.pricing?.currency || 'USD',
                    Number(externalModel.pricing?.inputPerMillionTokens || 0).toFixed(6),
                    Number(externalModel.pricing?.outputPerMillionTokens || 0).toFixed(6),
                    Number(externalModel.pricing?.cachedInputPerMillionTokens || 0).toFixed(6),
                    Number(externalModel.pricing?.cacheCreationPerMillionTokens || 0).toFixed(6),
                    Number(
                        externalModel.pricing?.thinkingPerMillionTokens
                        || externalModel.pricing?.outputPerMillionTokens
                        || 0
                    ).toFixed(6),
                    Number(externalModel.pricing?.imagePerUnit || 0).toFixed(6),
                    Number(externalModel.pricing?.requestFlatFee || 0).toFixed(6),
                    Number(externalModel.pricing?.priceMultiplier || 1).toFixed(4),
                ]);
            }

            await client.query('DELETE FROM external_model_targets');
            for (const target of normalizedTargets) {
                await client.query(`
                    INSERT INTO external_model_targets (
                        external_model_name,
                        model_id,
                        priority,
                        weight,
                        enabled,
                        updated_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW())
                `, [
                    target.externalModelName,
                    target.modelId,
                    Number(target.priority ?? 100),
                    Number(target.weight ?? 1),
                    target.enabled !== false,
                ]);
            }

            await client.query('DELETE FROM external_models WHERE NOT (name = ANY($1::text[]))', [normalizedExternalModels.map((item) => item.name)]);
            await client.query('DELETE FROM models WHERE NOT (id = ANY($1::text[]))', [models.map((model) => model.id)]);
            await client.query('DELETE FROM providers WHERE NOT (id = ANY($1::text[]))', [providers.map((provider) => provider.id)]);

            // --- Admin tables (only touch when explicitly provided, i.e. from remote sync) ---

            // admins: upsert (only when admins param is explicitly passed)
            if (admins !== undefined) {
                for (const admin of admins) {
                    await client.query(`
                        INSERT INTO admins (username, password, updated_at)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (username) DO UPDATE SET
                            password = EXCLUDED.password,
                            updated_at = EXCLUDED.updated_at
                    `, [admin.username, admin.password, admin.updatedAt || new Date()]);
                }
                await client.query('DELETE FROM admins WHERE NOT (username = ANY($1::text[]))', [admins.map((a) => a.username)]);
            }

            // payment_settings: upsert (only when explicitly passed)
            if (paymentSettings !== undefined) {
                for (const ps of paymentSettings) {
                    await client.query(`
                        INSERT INTO payment_settings (
                            id, enabled, mode, qr_image_path, app_id, private_key, private_key_path,
                            alipay_public_key, alipay_public_key_path, gateway, public_base_url,
                            key_type, min_recharge_usd, min_recharge_cny, cny_per_usd, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::numeric,$14::numeric,$15::numeric,$16)
                        ON CONFLICT (id) DO UPDATE SET
                            enabled=EXCLUDED.enabled, mode=EXCLUDED.mode, qr_image_path=EXCLUDED.qr_image_path,
                            app_id=EXCLUDED.app_id, private_key=EXCLUDED.private_key, private_key_path=EXCLUDED.private_key_path,
                            alipay_public_key=EXCLUDED.alipay_public_key, alipay_public_key_path=EXCLUDED.alipay_public_key_path,
                            gateway=EXCLUDED.gateway, public_base_url=EXCLUDED.public_base_url,
                            key_type=EXCLUDED.key_type, min_recharge_usd=EXCLUDED.min_recharge_usd,
                            min_recharge_cny=EXCLUDED.min_recharge_cny,
                            cny_per_usd=EXCLUDED.cny_per_usd, updated_at=EXCLUDED.updated_at
                    `, [
                        ps.id, ps.enabled, ps.mode, ps.qrImagePath, ps.appId, ps.privateKey, ps.privateKeyPath,
                        ps.alipayPublicKey, ps.alipayPublicKeyPath, ps.gateway, ps.publicBaseUrl,
                        ps.keyType, Number(ps.minRechargeUsd || 0).toFixed(6),
                        Number(ps.minRechargeCny || (Number(ps.minRechargeUsd || 0) * Number(ps.cnyPerUsd || 0)) || 10).toFixed(6),
                        Number(ps.cnyPerUsd || 0).toFixed(6),
                        ps.updatedAt || new Date(),
                    ]);
                }
                await client.query('DELETE FROM payment_settings WHERE NOT (id = ANY($1::text[]))', [paymentSettings.map((ps) => ps.id)]);
            }

            // users: delete + re-insert (only when explicitly passed)
            // NOTE: wallet_ledger and request_reservations have ON DELETE NO ACTION FKs to users,
            // so they must be cleared before deleting users.
            if (users !== undefined) {
                await client.query('DELETE FROM wallet_ledger');
                await client.query('DELETE FROM request_reservations');
                await client.query('DELETE FROM users');
                for (const user of users) {
                    await client.query(`
                        INSERT INTO users (
                            username,
                            password,
                            balance_usd,
                            total_recharged_usd,
                            total_spent_usd,
                            last_recharged_at,
                            subscription_status,
                            subscription_started_at,
                            subscription_expires_at,
                            subscription_plan_id,
                            updated_at
                        )
                        VALUES ($1, $2, $3::numeric, $4::numeric, $5::numeric, $6, $7, $8, $9, $10, $11)
                    `, [
                        user.username,
                        user.password,
                        Number(user.balanceUsd || 0).toFixed(6),
                        Number(user.totalRechargedUsd || 0).toFixed(6),
                        Number(user.totalSpentUsd || 0).toFixed(6),
                        user.lastRechargedAt || null,
                        user.subscriptionStatus || 'inactive',
                        user.subscriptionStartedAt || null,
                        user.subscriptionExpiresAt || null,
                        user.subscriptionPlanId || null,
                        user.updatedAt || new Date(),
                    ]);
                }
            }

            if (walletLedger !== undefined) {
                await client.query('DELETE FROM wallet_ledger');
                for (const entry of walletLedger) {
                    await client.query(`
                        INSERT INTO wallet_ledger (
                            id,
                            username,
                            request_id,
                            entry_type,
                            amount_usd,
                            balance_after_usd,
                            created_at
                        ) VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7)
                    `, [
                        entry.id,
                        entry.username,
                        entry.requestId || null,
                        entry.entryType,
                        Number(entry.amountUsd || 0).toFixed(6),
                        Number(entry.balanceAfterUsd || 0).toFixed(6),
                        entry.createdAt || new Date(),
                    ]);
                }
            }

            // user_api_keys: replace all (only when explicitly passed)
            if (userApiKeys !== undefined) {
                await client.query('DELETE FROM user_api_keys');
                for (const key of userApiKeys) {
                    await client.query(`
                        INSERT INTO user_api_keys (id, username, name, api_key, created_at, last_used_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [key.id, key.username, key.name, key.apiKey, key.createdAt || new Date(), key.lastUsedAt || null]);
                }
            }

            // recharge_orders: replace all (only when explicitly passed)
            if (rechargeOrders !== undefined) {
                await client.query('DELETE FROM recharge_orders');
                for (const order of rechargeOrders) {
                    await client.query(`
                        INSERT INTO recharge_orders (
                            id, username, out_trade_no, payment_method, status, amount_usd, amount_cny,
                            cny_per_usd, subject, created_at, updated_at, paid_at, trade_no,
                            buyer_logon_id, trade_status, customer_note, reviewed_by, reviewed_at,
                            review_note, failure_reason
                        ) VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                    `, [
                        order.id, order.username, order.outTradeNo, order.paymentMethod, order.status,
                        Number(order.amountUsd || 0).toFixed(6), Number(order.amountCny || 0).toFixed(2),
                        Number(order.cnyPerUsd || 0).toFixed(6),
                        order.subject, order.createdAt || new Date(), order.updatedAt || new Date(),
                        order.paidAt || null, order.tradeNo, order.buyerLogonId,
                        order.tradeStatus, order.customerNote, order.reviewedBy,
                        order.reviewedAt || null, order.reviewNote, order.failureReason,
                    ]);
                }
            }

            if (subscriptionSettings !== undefined) {
                await client.query('DELETE FROM subscription_settings');
                for (const setting of subscriptionSettings) {
                    await client.query(`
                        INSERT INTO subscription_settings (
                            id,
                            enabled,
                            quota_consumption_enabled,
                            monthly_price_cny,
                            updated_at
                        ) VALUES ($1, $2, $3, $4::numeric, $5)
                    `, [
                        setting.id,
                        setting.enabled !== false,
                        setting.quotaConsumptionEnabled !== false,
                        Number(setting.monthlyPriceCny || 0).toFixed(2),
                        setting.updatedAt || new Date(),
                    ]);
                }
            }

            if (subscriptionOrders !== undefined) {
                await client.query('DELETE FROM subscription_orders');
            }

            if (subscriptionPlans !== undefined || subscriptionPlanModelLimits !== undefined) {
                await client.query('DELETE FROM subscription_plan_model_limits');
            }

            if (subscriptionPlans !== undefined) {
                await client.query('DELETE FROM subscription_plans');
                for (const plan of subscriptionPlans) {
                    await client.query(`
                        INSERT INTO subscription_plans (
                            id,
                            name,
                            description,
                            enabled,
                            monthly_price_cny,
                            sort_order,
                            created_at,
                            updated_at
                        ) VALUES ($1, $2, $3, $4, $5::numeric, $6, $7, $8)
                    `, [
                        plan.id,
                        plan.name,
                        plan.description || '',
                        plan.enabled !== false,
                        Number(plan.monthlyPriceCny || 0).toFixed(2),
                        Number(plan.sortOrder || 0),
                        plan.createdAt || new Date(),
                        plan.updatedAt || new Date(),
                    ]);
                }
            }

            if (subscriptionPlanModelLimits !== undefined) {
                for (const limit of subscriptionPlanModelLimits) {
                    await client.query(`
                        INSERT INTO subscription_plan_model_limits (
                            plan_id,
                            external_model_name,
                            daily_request_limit,
                            updated_at
                        ) VALUES ($1, $2, $3, $4)
                    `, [
                        limit.planId,
                        limit.externalModelName,
                        Number(limit.dailyRequestLimit || 0),
                        limit.updatedAt || new Date(),
                    ]);
                }
            }

            if (subscriptionModelLimits !== undefined) {
                await client.query('DELETE FROM subscription_model_limits');
                for (const limit of subscriptionModelLimits) {
                    await client.query(`
                        INSERT INTO subscription_model_limits (
                            external_model_name,
                            daily_request_limit,
                            updated_at
                        ) VALUES ($1, $2, $3)
                    `, [
                        limit.externalModelName || limit.modelId,
                        Number(limit.dailyRequestLimit || 0),
                        limit.updatedAt || new Date(),
                    ]);
                }
            }

            if (subscriptionOrders !== undefined) {
                for (const order of subscriptionOrders) {
                    await client.query(`
                        INSERT INTO subscription_orders (
                            id,
                            username,
                            plan_id,
                            status,
                            months,
                            amount_cny,
                            snapshot_monthly_price_cny,
                            snapshot_plan_name,
                            subject,
                            customer_note,
                            created_at,
                            updated_at,
                            reviewed_by,
                            reviewed_at,
                            review_note,
                            failure_reason,
                            approved_started_at,
                            approved_expires_at
                        ) VALUES (
                            $1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10,
                            $11, $12, $13, $14, $15, $16, $17, $18
                        )
                    `, [
                        order.id,
                        order.username,
                        order.planId || null,
                        order.status,
                        Number(order.months || 1),
                        Number(order.amountCny || 0).toFixed(2),
                        Number(order.snapshotMonthlyPriceCny || 0).toFixed(2),
                        order.planName || '',
                        order.subject,
                        order.customerNote || '',
                        order.createdAt || new Date(),
                        order.updatedAt || new Date(),
                        order.reviewedBy || '',
                        order.reviewedAt || null,
                        order.reviewNote || '',
                        order.failureReason || '',
                        order.approvedStartedAt || null,
                        order.approvedExpiresAt || null,
                    ]);
                }
            }
        });

        this.modelResolutionService.invalidateCache();
    }

    async getAdminCatalogResponse() {
        const snapshot = await this.loadSnapshot();
        return {
            providers: snapshot.providers.map(sanitizeAdminProvider),
            models: snapshot.models.map((model) => sanitizeAdminModel(model, snapshot.providers)),
            externalModels: snapshot.externalModels.map((externalModel) => sanitizeAdminExternalModel(
                externalModel,
                snapshot.externalModelTargets,
                snapshot.models,
                snapshot.providers
            )),
        };
    }

    async exportCatalog() {
        return this.loadSnapshot();
    }

    async createProvider(payload) {
        const snapshot = await this.loadSnapshot();
        const error = validateProviderPayload(payload, { requireApiKey: true });
        if (error) {
            throw createHttpError(400, error);
        }

        const provider = normalizeProviderConfig(payload);
        if (snapshot.providers.some((item) => normalizeProviderId(item.id) === normalizeProviderId(provider.id))) {
            throw createHttpError(400, 'Provider id already exists.');
        }

        await this.replaceSnapshot({
            providers: [...snapshot.providers, provider],
            models: snapshot.models,
            externalModels: snapshot.externalModels,
            externalModelTargets: snapshot.externalModelTargets,
        });

        return sanitizeAdminProvider(provider);
    }

    async updateProvider(providerId, payload) {
        const snapshot = await this.loadSnapshot();
        const currentProvider = this.findProviderById(snapshot.providers, providerId);
        if (!currentProvider) {
            throw createHttpError(404, 'Provider not found.');
        }

        const mergedPayload = {
            ...currentProvider,
            ...payload,
            apiKey: String(payload?.apiKey || currentProvider.apiKey),
        };
        const error = validateProviderPayload(mergedPayload, { requireApiKey: false });
        if (error) {
            throw createHttpError(400, error);
        }

        const updatedProvider = normalizeProviderConfig(mergedPayload);
        if (
            normalizeProviderId(updatedProvider.id) !== normalizeProviderId(currentProvider.id)
            && snapshot.providers.some((item) => normalizeProviderId(item.id) === normalizeProviderId(updatedProvider.id))
        ) {
            throw createHttpError(400, 'Provider id already exists.');
        }

        const providers = snapshot.providers.map((provider) => (
            provider.id === currentProvider.id ? updatedProvider : provider
        ));
        const remappedModelIds = new Map();
        const models = snapshot.models.map((model) => {
            if (model.providerId !== currentProvider.id) {
                return model;
            }

            const remappedModel = normalizeModelConfig({
                ...model,
                providerId: updatedProvider.id,
            }, providers);
            remappedModelIds.set(model.id, remappedModel.id);
            return remappedModel;
        });
        const externalModelTargets = this.remapExternalModelTargetsModelIds(
            snapshot.externalModelTargets,
            remappedModelIds
        );

        await this.replaceSnapshot({
            providers,
            models,
            externalModels: snapshot.externalModels,
            externalModelTargets,
        });
        return sanitizeAdminProvider(updatedProvider);
    }

    async deleteProvider(providerId) {
        const snapshot = await this.loadSnapshot();
        const provider = this.findProviderById(snapshot.providers, providerId);
        if (!provider) {
            throw createHttpError(404, 'Provider not found.');
        }

        const models = snapshot.models.filter((model) => model.providerId !== provider.id);
        const externalModelTargets = this.removeTargetsForMissingModels(snapshot.externalModelTargets, models);
        const externalModels = this.removeExternalModelsWithoutTargets(snapshot.externalModels, externalModelTargets);
        const remainingExternalModelNames = new Set(externalModels.map((item) => item.name));
        const removedExternalModelNames = snapshot.externalModels
            .map((item) => item.name)
            .filter((item) => !remainingExternalModelNames.has(item));

        this.assertExternalModelsNotReferenced(
            snapshot,
            removedExternalModelNames,
            `delete provider "${provider.id}"`
        );

        await this.replaceSnapshot({
            providers: snapshot.providers.filter((item) => item.id !== provider.id),
            models,
            externalModels,
            externalModelTargets,
        });
    }

    async createModel(payload) {
        const snapshot = await this.loadSnapshot();
        const error = validateModelPayload(payload, { providers: snapshot.providers });
        if (error) {
            throw createHttpError(400, error);
        }

        const model = normalizeModelConfig(payload, snapshot.providers);
        if (!model) {
            throw createHttpError(400, 'Model payload is invalid.');
        }

        if (snapshot.models.some((item) => item.id === model.id)) {
            throw createHttpError(400, 'Model already exists for this provider and upstream API.');
        }

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models: [...snapshot.models, model],
            externalModels: snapshot.externalModels,
            externalModelTargets: snapshot.externalModelTargets,
        });

        return sanitizeAdminModel(model, snapshot.providers);
    }

    async updateModel(modelId, payload) {
        const snapshot = await this.loadSnapshot();
        const currentModel = this.findModelById(snapshot.models, modelId);
        if (!currentModel) {
            throw createHttpError(404, 'Model not found.');
        }

        const mergedPayload = {
            ...currentModel,
            ...payload,
        };
        const error = validateModelPayload(mergedPayload, { providers: snapshot.providers });
        if (error) {
            throw createHttpError(400, error);
        }

        const updatedModel = normalizeModelConfig(mergedPayload, snapshot.providers);
        if (!updatedModel) {
            throw createHttpError(400, 'Model payload is invalid.');
        }

        if (
            updatedModel.id !== currentModel.id
            && snapshot.models.some((item) => item.id === updatedModel.id)
        ) {
            throw createHttpError(400, 'Model already exists for this provider and upstream API.');
        }

        const modelIdMap = new Map([[currentModel.id, updatedModel.id]]);
        const externalModelTargets = this.remapExternalModelTargetsModelIds(
            snapshot.externalModelTargets,
            modelIdMap
        );
        const models = snapshot.models.map((model) => (
            model.id === currentModel.id ? updatedModel : model
        ));

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models,
            externalModels: snapshot.externalModels,
            externalModelTargets,
        });

        return sanitizeAdminModel(updatedModel, snapshot.providers);
    }

    async deleteModel(modelId) {
        const snapshot = await this.loadSnapshot();
        const model = this.findModelById(snapshot.models, modelId);
        if (!model) {
            throw createHttpError(404, 'Model not found.');
        }

        const models = snapshot.models.filter((item) => item.id !== model.id);
        const externalModelTargets = this.removeTargetsForMissingModels(snapshot.externalModelTargets, models);
        const externalModels = this.removeExternalModelsWithoutTargets(snapshot.externalModels, externalModelTargets);
        const remainingExternalModelNames = new Set(externalModels.map((item) => item.name));
        const removedExternalModelNames = snapshot.externalModels
            .map((item) => item.name)
            .filter((item) => !remainingExternalModelNames.has(item));

        this.assertExternalModelsNotReferenced(
            snapshot,
            removedExternalModelNames,
            `delete model "${model.id}"`
        );

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models,
            externalModels,
            externalModelTargets,
        });
    }

    async createExternalModel(payload) {
        const snapshot = await this.loadSnapshot();
        const error = validateExternalModelPayload(payload, { models: snapshot.models });
        if (error) {
            throw createHttpError(400, error);
        }

        const externalModel = normalizeExternalModelConfig(payload, snapshot.models);
        if (!externalModel) {
            throw createHttpError(400, 'External model payload is invalid.');
        }

        if (this.findExternalModelByName(snapshot.externalModels, externalModel.name)) {
            throw createHttpError(400, 'External model name already exists.');
        }

        const nextExternalModels = [
            ...snapshot.externalModels,
            {
                name: externalModel.name,
                strategy: externalModel.strategy,
                pricing: externalModel.pricing,
            },
        ];
        const nextExternalModelTargets = [
            ...snapshot.externalModelTargets.filter((target) => target.externalModelName !== externalModel.name),
            ...externalModel.targets,
        ];

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models: snapshot.models,
            externalModels: nextExternalModels,
            externalModelTargets: nextExternalModelTargets,
        });

        return sanitizeAdminExternalModel(
            externalModel,
            nextExternalModelTargets,
            snapshot.models,
            snapshot.providers
        );
    }

    async updateExternalModel(name, payload) {
        const snapshot = await this.loadSnapshot();
        const currentExternalModel = this.findExternalModelByName(snapshot.externalModels, name);
        if (!currentExternalModel) {
            throw createHttpError(404, 'External model not found.');
        }

        const currentTargets = snapshot.externalModelTargets.filter((target) => target.externalModelName === currentExternalModel.name);
        const mergedPayload = {
            ...currentExternalModel,
            ...payload,
            name: payload?.name || currentExternalModel.name,
            modelIds: Array.isArray(payload?.modelIds)
                ? payload.modelIds
                : currentTargets.map((target) => target.modelId),
            targets: Array.isArray(payload?.targets)
                ? payload.targets
                : (Array.isArray(payload?.modelIds) ? undefined : currentTargets),
        };
        const error = validateExternalModelPayload(mergedPayload, { models: snapshot.models });
        if (error) {
            throw createHttpError(400, error);
        }

        const updatedExternalModel = normalizeExternalModelConfig(mergedPayload, snapshot.models);
        if (!updatedExternalModel) {
            throw createHttpError(400, 'External model payload is invalid.');
        }

        if (
            updatedExternalModel.name !== currentExternalModel.name
            && this.findExternalModelByName(snapshot.externalModels, updatedExternalModel.name)
        ) {
            throw createHttpError(400, 'External model name already exists.');
        }

        const externalModels = snapshot.externalModels.map((item) => (
            item.name === currentExternalModel.name
                ? {
                    name: updatedExternalModel.name,
                    strategy: updatedExternalModel.strategy,
                    pricing: updatedExternalModel.pricing,
                }
                : item
        ));
        const externalModelTargets = [
            ...snapshot.externalModelTargets.filter((target) => target.externalModelName !== currentExternalModel.name),
            ...updatedExternalModel.targets,
        ];
        const subscriptionPlanModelLimits = this.remapExternalModelReferences(
            snapshot.subscriptionPlanModelLimits,
            currentExternalModel.name,
            updatedExternalModel.name
        );
        const subscriptionModelLimits = this.remapExternalModelReferences(
            snapshot.subscriptionModelLimits,
            currentExternalModel.name,
            updatedExternalModel.name
        );

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models: snapshot.models,
            externalModels,
            externalModelTargets,
            subscriptionPlanModelLimits,
            subscriptionModelLimits,
        });

        return sanitizeAdminExternalModel(
            updatedExternalModel,
            externalModelTargets,
            snapshot.models,
            snapshot.providers
        );
    }

    async deleteExternalModel(name) {
        const snapshot = await this.loadSnapshot();
        const externalModel = this.findExternalModelByName(snapshot.externalModels, name);
        if (!externalModel) {
            throw createHttpError(404, 'External model not found.');
        }

        this.assertExternalModelsNotReferenced(
            snapshot,
            [externalModel.name],
            `delete external model "${externalModel.name}"`
        );

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models: snapshot.models,
            externalModels: snapshot.externalModels.filter((item) => item.name !== externalModel.name),
            externalModelTargets: snapshot.externalModelTargets.filter((target) => target.externalModelName !== externalModel.name),
        });
    }

    async updateModelConnectivityStatus(modelId, status = {}) {
        const snapshot = await this.loadSnapshot();
        const currentModel = this.findModelById(snapshot.models, modelId);
        if (!currentModel) {
            throw createHttpError(404, 'Model not found.');
        }

        const updatedModel = {
            ...currentModel,
            connectivityStatus: normalizeConnectivityStatus({
                ...currentModel.connectivityStatus,
                ...status,
            }),
        };

        await this.replaceSnapshot({
            providers: snapshot.providers,
            models: snapshot.models.map((model) => (
                model.id === currentModel.id ? updatedModel : model
            )),
            externalModels: snapshot.externalModels,
            externalModelTargets: snapshot.externalModelTargets,
        });

        return sanitizeAdminModel(updatedModel, snapshot.providers);
    }
}

module.exports = {
    CatalogAdminService,
};
