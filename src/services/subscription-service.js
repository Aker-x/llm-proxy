const crypto = require('crypto');
const { createHttpError } = require('../utils/http-error');

const DEFAULT_SUBSCRIPTION_TIMEZONE = 'Asia/Shanghai';

function roundCny(value) {
    const numericValue = Number(value || 0);
    return Number(numericValue.toFixed(2));
}

function toNonNegativeInteger(value, fallbackValue = 0) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return fallbackValue;
    }

    return Math.floor(numericValue);
}

function addMonths(isoValue, months = 1) {
    const baseDate = new Date(isoValue || Date.now());
    if (!Number.isFinite(baseDate.getTime())) {
        return new Date().toISOString();
    }

    const nextDate = new Date(baseDate.getTime());
    const originalDay = nextDate.getUTCDate();
    nextDate.setUTCDate(1);
    nextDate.setUTCMonth(nextDate.getUTCMonth() + Number(months || 0));

    const maxDay = new Date(Date.UTC(
        nextDate.getUTCFullYear(),
        nextDate.getUTCMonth() + 1,
        0
    )).getUTCDate();
    nextDate.setUTCDate(Math.min(originalDay, maxDay));

    return nextDate.toISOString();
}

function isActiveSubscription(row = {}) {
    if (String(row.subscription_status || '').trim() !== 'active') {
        return false;
    }

    if (!row.subscription_expires_at) {
        return false;
    }

    const expiresAt = new Date(row.subscription_expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function mapSettings(row = {}) {
    return {
        enabled: row.enabled !== false,
        quotaConsumptionEnabled: row.quota_consumption_enabled !== false,
        updatedAt: row.updated_at || null,
    };
}

function mapOrder(row = {}) {
    return {
        id: row.id,
        username: row.username,
        planId: row.plan_id || '',
        planName: row.snapshot_plan_name || '',
        status: String(row.status || 'pending'),
        months: toNonNegativeInteger(row.months || 1, 1) || 1,
        amountCny: roundCny(row.amount_cny),
        snapshotMonthlyPriceCny: roundCny(row.snapshot_monthly_price_cny),
        subject: row.subject || '',
        customerNote: row.customer_note || '',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        reviewedBy: row.reviewed_by || '',
        reviewedAt: row.reviewed_at || null,
        reviewNote: row.review_note || '',
        failureReason: row.failure_reason || '',
        approvedStartedAt: row.approved_started_at || null,
        approvedExpiresAt: row.approved_expires_at || null,
    };
}

function mapSubscriptionState(row = {}) {
    const subscriptionStatus = String(row.subscription_status || 'inactive').trim() || 'inactive';
    const startedAt = row.subscription_started_at || null;
    const expiresAt = row.subscription_expires_at || null;

    return {
        status: subscriptionStatus,
        active: isActiveSubscription(row),
        startedAt,
        expiresAt,
        planId: row.subscription_plan_id || '',
        planName: row.subscription_plan_name || '',
        planDescription: row.subscription_plan_description || '',
        monthlyPriceCny: roundCny(row.subscription_monthly_price_cny || 0),
    };
}

function mapPlan(row = {}) {
    return {
        id: row.id || '',
        name: row.name || '',
        description: row.description || '',
        enabled: row.enabled !== false,
        monthlyPriceCny: roundCny(row.monthly_price_cny || 0),
        sortOrder: toNonNegativeInteger(row.sort_order || 0),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
    };
}

function mapPlanLimit(row = {}) {
    const dailyRequestLimit = toNonNegativeInteger(row.daily_request_limit);
    return {
        planId: row.plan_id || '',
        planName: row.plan_name || '',
        planEnabled: row.plan_enabled !== false,
        sortOrder: toNonNegativeInteger(row.sort_order || 0),
        externalModelName: row.external_model_name || '',
        strategy: row.strategy || '',
        dailyRequestLimit,
        updatedAt: row.updated_at || null,
    };
}

function mapUserModelPreference(row = {}) {
    return {
        username: row.username || '',
        planId: row.plan_id || '',
        externalModelName: row.external_model_name || '',
        allowBalanceFallback: row.allow_balance_fallback !== false,
        updatedAt: row.updated_at || null,
    };
}

function decorateLimitUsage(limit, requestCount = 0, options = {}) {
    const requestsToday = toNonNegativeInteger(requestCount);
    const isUnlimited = Number(limit.dailyRequestLimit) === 0;
    const quotaConsumptionEnabled = options.quotaConsumptionEnabled !== false;

    return {
        ...limit,
        quotaConsumptionEnabled,
        quotaConsumptionPaused: !quotaConsumptionEnabled,
        requestsToday,
        remainingToday: isUnlimited || !quotaConsumptionEnabled
            ? null
            : Math.max(0, limit.dailyRequestLimit - requestsToday),
        unlimited: isUnlimited,
    };
}

function buildPreferenceMap(rows = []) {
    const preferences = new Map();
    for (const row of rows) {
        const preference = mapUserModelPreference(row);
        if (!preference.externalModelName) {
            continue;
        }

        preferences.set(preference.externalModelName, preference);
    }

    return preferences;
}

function buildUsageMap(usageRows = []) {
    const usageByUsername = new Map();
    for (const row of usageRows) {
        const username = String(row.username || '').trim();
        const planId = String(row.plan_id || '').trim();
        const externalModelName = String(row.external_model_name || '').trim();

        if (!username || !planId || !externalModelName) {
            continue;
        }

        if (!usageByUsername.has(username)) {
            usageByUsername.set(username, new Map());
        }
        const planMap = usageByUsername.get(username);
        if (!planMap.has(planId)) {
            planMap.set(planId, new Map());
        }

        planMap.get(planId).set(externalModelName, toNonNegativeInteger(row.request_count));
    }

    return usageByUsername;
}

function groupPlanLimits(planRows = [], limitRows = []) {
    const plans = planRows.map(mapPlan);
    const planById = new Map(plans.map((plan) => [plan.id, {
        ...plan,
        modelLimits: [],
    }]));

    for (const row of limitRows) {
        const limit = mapPlanLimit(row);
        const plan = planById.get(limit.planId);
        if (!plan) {
            continue;
        }

        plan.modelLimits.push({
            externalModelName: limit.externalModelName,
            strategy: limit.strategy,
            dailyRequestLimit: limit.dailyRequestLimit,
            updatedAt: limit.updatedAt,
        });
    }

    return plans.map((plan) => planById.get(plan.id));
}

class SubscriptionService {
    constructor({
        subscriptionRepository,
        userLookup,
        timezone = DEFAULT_SUBSCRIPTION_TIMEZONE,
    }) {
        this.subscriptionRepository = subscriptionRepository;
        this.userLookup = userLookup;
        this.timezone = timezone;
        this.lastQuotaReservationSweepAt = 0;
    }

    async sweepStaleDailyUsageReservationsIfNeeded() {
        if (typeof this.subscriptionRepository.releaseStaleDailyUsageReservations !== 'function') {
            return;
        }

        const now = Date.now();
        if (now - this.lastQuotaReservationSweepAt < 60_000) {
            return;
        }

        this.lastQuotaReservationSweepAt = now;
        try {
            const released = await this.subscriptionRepository.releaseStaleDailyUsageReservations({
                olderThanMinutes: 360,
            });
            if (released > 0) {
                console.warn(`[subscription] Released ${released} stale quota reservations.`);
            }
        } catch (error) {
            console.warn(`[subscription] Failed to release stale quota reservations: ${error.stack || error.message}`);
        }
    }

    async getSettings() {
        const row = await this.subscriptionRepository.getSettings();
        return mapSettings(row || {
            enabled: true,
            quota_consumption_enabled: true,
            updated_at: null,
        });
    }

    async getUserOverview(username) {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const [settingsRow, subscriptionRow, orderRows, planRows, planLimitRows] = await Promise.all([
            this.subscriptionRepository.getSettings(),
            this.subscriptionRepository.getUserSubscription(username),
            this.subscriptionRepository.listOrdersByUsername(username),
            this.subscriptionRepository.listPlans({ enabledOnly: true }),
            this.subscriptionRepository.listPlanModelLimits(),
        ]);

        const settings = mapSettings(settingsRow || {
            enabled: true,
            quota_consumption_enabled: true,
        });
        const subscription = mapSubscriptionState(subscriptionRow || {});
        const plans = groupPlanLimits(planRows, planLimitRows).filter((plan) => plan.enabled);
        let currentPlan = null;

        if (subscription.active && subscription.planId) {
            const currentPlanRow = await this.subscriptionRepository.getPlanById(subscription.planId);
            if (currentPlanRow) {
                const currentPlanLimits = planLimitRows
                    .map(mapPlanLimit)
                    .filter((item) => item.planId === subscription.planId);

                const [usageRows, preferenceRows] = await Promise.all([
                    this.subscriptionRepository.getDailyUsageCountsByUsername({
                        usernames: [username],
                        timezone: this.timezone,
                    }),
                    this.subscriptionRepository.listUserModelPreferences({
                        username,
                        planId: subscription.planId,
                    }),
                ]);
                const userUsageMap = buildUsageMap(usageRows).get(username) || new Map();
                const planUsageMap = userUsageMap.get(subscription.planId) || new Map();
                const preferenceMap = buildPreferenceMap(preferenceRows);

                currentPlan = {
                    ...mapPlan(currentPlanRow),
                    modelLimits: currentPlanLimits.map((limit) => decorateLimitUsage({
                        ...limit,
                        allowBalanceFallback: preferenceMap.get(limit.externalModelName)?.allowBalanceFallback !== false,
                    }, planUsageMap.get(limit.externalModelName) || 0, {
                        quotaConsumptionEnabled: settings.quotaConsumptionEnabled,
                    })),
                };
            }
        }

        return {
            settings,
            subscription,
            currentPlan,
            plans,
            orders: orderRows.map(mapOrder),
            timezone: this.timezone,
        };
    }

    async getAdminOverview() {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const [settingsRow, planRows, planLimitRows, orderRows, subscriberRows] = await Promise.all([
            this.subscriptionRepository.getSettings(),
            this.subscriptionRepository.listPlans(),
            this.subscriptionRepository.listPlanModelLimits(),
            this.subscriptionRepository.listAllOrders(),
            this.subscriptionRepository.listActiveSubscribers(),
        ]);

        const settings = mapSettings(settingsRow || {
            enabled: true,
            quota_consumption_enabled: true,
        });
        const usernames = subscriberRows.map((row) => row.username).filter(Boolean);
        const usageRows = await this.subscriptionRepository.getDailyUsageCountsByUsername({
            usernames,
            timezone: this.timezone,
        });

        const usageByUsername = buildUsageMap(usageRows);
        const plans = groupPlanLimits(planRows, planLimitRows);
        const planMap = new Map(plans.map((plan) => [plan.id, plan]));

        return {
            settings,
            plans,
            orders: orderRows.map(mapOrder),
            subscribers: subscriberRows.map((row) => {
                const subscription = mapSubscriptionState(row);
                const userPlanUsageMap = usageByUsername.get(row.username) || new Map();
                const currentPlan = planMap.get(subscription.planId) || null;
                const currentPlanUsageMap = currentPlan ? (userPlanUsageMap.get(subscription.planId) || new Map()) : new Map();

                return {
                    username: row.username,
                    ...subscription,
                    currentPlan: currentPlan
                        ? {
                            id: currentPlan.id,
                            name: currentPlan.name,
                            description: currentPlan.description,
                            monthlyPriceCny: currentPlan.monthlyPriceCny,
                        }
                        : null,
                    usage: currentPlan
                        ? currentPlan.modelLimits.map((limit) => decorateLimitUsage(
                            limit,
                            currentPlanUsageMap.get(limit.externalModelName) || 0,
                            { quotaConsumptionEnabled: settings.quotaConsumptionEnabled }
                        ))
                        : [],
                };
            }),
            timezone: this.timezone,
        };
    }

    async updateSettings(payload = {}) {
        await this.subscriptionRepository.expireStaleSubscriptions();
        const currentSettings = await this.getSettings();

        const settingsRow = await this.subscriptionRepository.upsertSettings({
            enabled: Object.prototype.hasOwnProperty.call(payload, 'enabled')
                ? payload.enabled !== false
                : currentSettings.enabled !== false,
            quotaConsumptionEnabled: Object.prototype.hasOwnProperty.call(payload, 'quotaConsumptionEnabled')
                ? payload.quotaConsumptionEnabled !== false
                : currentSettings.quotaConsumptionEnabled !== false,
        });

        return {
            settings: mapSettings(settingsRow),
        };
    }

    async createPlan(payload = {}) {
        const name = String(payload.name || '').trim();
        if (!name) {
            throw createHttpError(400, 'Subscription plan name is required.');
        }

        const monthlyPriceCny = roundCny(payload.monthlyPriceCny);
        if (!Number.isFinite(monthlyPriceCny) || monthlyPriceCny <= 0) {
            throw createHttpError(400, 'Subscription plan price must be greater than 0.');
        }

        const sortOrder = toNonNegativeInteger(payload.sortOrder || 0);
        const plan = await this.subscriptionRepository.createPlan({
            id: crypto.randomUUID(),
            name,
            description: String(payload.description || '').trim(),
            enabled: payload.enabled !== false,
            monthlyPriceCny,
            sortOrder,
        });

        await this.subscriptionRepository.replacePlanModelLimits(plan.id, Array.isArray(payload.modelLimits) ? payload.modelLimits : []);
        return this.getAdminOverview();
    }

    async updatePlan(planId, payload = {}) {
        const existingPlan = await this.subscriptionRepository.getPlanById(planId);
        if (!existingPlan) {
            throw createHttpError(404, 'Subscription plan not found.');
        }

        const name = String(payload.name || '').trim();
        if (!name) {
            throw createHttpError(400, 'Subscription plan name is required.');
        }

        const monthlyPriceCny = roundCny(payload.monthlyPriceCny);
        if (!Number.isFinite(monthlyPriceCny) || monthlyPriceCny <= 0) {
            throw createHttpError(400, 'Subscription plan price must be greater than 0.');
        }

        await this.subscriptionRepository.updatePlan(planId, {
            name,
            description: String(payload.description || '').trim(),
            enabled: payload.enabled !== false,
            monthlyPriceCny,
            sortOrder: toNonNegativeInteger(payload.sortOrder || 0),
        });
        await this.subscriptionRepository.replacePlanModelLimits(planId, Array.isArray(payload.modelLimits) ? payload.modelLimits : []);
        return this.getAdminOverview();
    }

    async deletePlan(planId) {
        const result = await this.subscriptionRepository.deletePlan(planId);
        if (!result?.deleted) {
            if (result?.activeSubscribers) {
                throw createHttpError(409, 'This subscription plan still has active subscribers.');
            }
            if (result?.pendingOrders) {
                throw createHttpError(409, 'This subscription plan still has pending subscription orders.');
            }
            throw createHttpError(404, 'Subscription plan not found.');
        }

        return this.getAdminOverview();
    }

    async createSubscriptionOrder({ username, planId, customerNote }) {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const user = await this.userLookup(username);
        if (!user) {
            throw createHttpError(404, 'User not found.');
        }

        const settings = await this.getSettings();
        if (!settings.enabled) {
            throw createHttpError(503, '订阅入口暂未开启，请稍后再试。');
        }

        const normalizedPlanId = String(planId || '').trim();
        if (!normalizedPlanId) {
            throw createHttpError(400, 'Subscription plan is required.');
        }

        const planRow = await this.subscriptionRepository.getPlanById(normalizedPlanId);
        if (!planRow || planRow.enabled === false) {
            throw createHttpError(404, 'Subscription plan not found or unavailable.');
        }

        const plan = mapPlan(planRow);
        const now = new Date().toISOString();
        const order = await this.subscriptionRepository.createOrder({
            id: crypto.randomUUID(),
            username,
            planId: plan.id,
            status: 'pending',
            months: 1,
            amountCny: plan.monthlyPriceCny,
            snapshotMonthlyPriceCny: plan.monthlyPriceCny,
            snapshotPlanName: plan.name,
            subject: `Subscription request for ${username}: ${plan.name}`,
            customerNote: String(customerNote || '').trim(),
            createdAt: now,
            updatedAt: now,
            reviewedBy: '',
            reviewedAt: null,
            reviewNote: '',
            failureReason: '',
            approvedStartedAt: null,
            approvedExpiresAt: null,
        });

        return {
            order: mapOrder(order),
            plan,
        };
    }

    async approveOrder({ orderId, reviewedBy, reviewNote }) {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const order = await this.subscriptionRepository.getOrderById(orderId);
        if (!order) {
            throw createHttpError(404, 'Subscription order not found.');
        }

        const plan = await this.subscriptionRepository.getPlanById(order.plan_id);
        if (!plan) {
            throw createHttpError(404, 'Subscription plan not found.');
        }

        const subscription = await this.subscriptionRepository.getUserSubscription(order.username);
        const nowIso = new Date().toISOString();
        const currentSubscriptionActive = isActiveSubscription(subscription || {});
        const samePlan = currentSubscriptionActive
            && String(subscription.subscription_plan_id || '').trim() === String(order.plan_id || '').trim();
        const orderStartedAt = samePlan
            ? (subscription.subscription_expires_at || nowIso)
            : nowIso;
        const userStartedAt = samePlan
            ? (subscription.subscription_started_at || nowIso)
            : nowIso;
        const expiresAt = addMonths(orderStartedAt, Number(order.months || 1));

        const result = await this.subscriptionRepository.approveOrder({
            orderId,
            reviewedBy: String(reviewedBy || '').trim(),
            reviewedAt: nowIso,
            reviewNote: String(reviewNote || '').trim(),
            userStartedAt,
            orderStartedAt,
            expiresAt,
        });

        if (!result) {
            throw createHttpError(404, 'Subscription order not found.');
        }

        if (result.rejected) {
            throw createHttpError(400, 'Subscription order is already rejected.');
        }

        return {
            order: mapOrder(result.order),
            subscription: {
                status: 'active',
                active: true,
                startedAt: userStartedAt,
                expiresAt,
                planId: plan.id,
                planName: plan.name,
                planDescription: plan.description || '',
                monthlyPriceCny: roundCny(plan.monthly_price_cny || plan.monthlyPriceCny || 0),
            },
        };
    }

    async rejectOrder({ orderId, reviewedBy, reviewNote, reason }) {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const result = await this.subscriptionRepository.rejectOrder({
            orderId,
            reviewedBy: String(reviewedBy || '').trim(),
            reviewedAt: new Date().toISOString(),
            reviewNote: String(reviewNote || '').trim(),
            failureReason: String(reason || reviewNote || 'Rejected by admin.').trim(),
        });

        if (!result) {
            throw createHttpError(404, 'Subscription order not found.');
        }

        if (result.alreadyApproved) {
            throw createHttpError(400, 'Approved subscription orders cannot be rejected.');
        }

        return {
            order: mapOrder(result.order),
        };
    }

    async updateUserModelPreference({ username, externalModelName, allowBalanceFallback }) {
        await this.subscriptionRepository.expireStaleSubscriptions();

        const subscriptionRow = await this.subscriptionRepository.getUserSubscription(username);
        const subscription = mapSubscriptionState(subscriptionRow || {});
        if (!subscription.active || !subscription.planId) {
            throw createHttpError(400, '当前没有生效中的订阅方案，暂时无法设置该选项。');
        }

        const normalizedExternalModelName = String(externalModelName || '').trim();
        if (!normalizedExternalModelName) {
            throw createHttpError(400, '请选择要设置的订阅模型。');
        }

        const limitRow = await this.subscriptionRepository.getPlanLimitByExternalModelName(
            subscription.planId,
            normalizedExternalModelName
        );
        if (!limitRow) {
            throw createHttpError(404, '当前订阅方案未包含该模型。');
        }

        if (toNonNegativeInteger(limitRow.daily_request_limit) === 0) {
            throw createHttpError(400, '该模型在当前订阅中为不限量，无需设置余额续用。');
        }

        await this.subscriptionRepository.upsertUserModelPreference({
            username,
            planId: subscription.planId,
            externalModelName: normalizedExternalModelName,
            allowBalanceFallback: allowBalanceFallback !== false,
        });

        return this.getUserOverview(username);
    }

    async resolveUsageAccess({
        username,
        externalModelName,
        requestId = null,
        reserveQuota = Boolean(requestId),
    }) {
        if (!username) {
            return {
                mode: 'balance',
                subscription: null,
                appliedLimit: null,
            };
        }

        await this.sweepStaleDailyUsageReservationsIfNeeded();
        await this.subscriptionRepository.expireStaleSubscriptions();
        const subscriptionRow = await this.subscriptionRepository.getUserSubscription(username);
        const subscription = mapSubscriptionState(subscriptionRow || {});
        if (!subscription.active || !subscription.planId) {
            return {
                mode: 'balance',
                subscription,
                appliedLimit: null,
            };
        }

        const normalizedExternalModelName = String(externalModelName || '').trim();
        if (!normalizedExternalModelName) {
            return {
                mode: 'balance',
                subscription,
                appliedLimit: null,
            };
        }

        const limitRow = await this.subscriptionRepository.getPlanLimitByExternalModelName(
            subscription.planId,
            normalizedExternalModelName
        );
        if (!limitRow) {
            return {
                mode: 'balance',
                subscription,
                appliedLimit: null,
            };
        }

        const preferenceRow = await this.subscriptionRepository.getUserModelPreference({
            username,
            planId: subscription.planId,
            externalModelName: normalizedExternalModelName,
        });
        const allowBalanceFallback = preferenceRow
            ? preferenceRow.allow_balance_fallback !== false
            : true;
        const dailyRequestLimit = toNonNegativeInteger(limitRow.daily_request_limit);
        const settings = await this.getSettings();
        const quotaConsumptionEnabled = settings.quotaConsumptionEnabled !== false;
        if (dailyRequestLimit === 0 || !quotaConsumptionEnabled) {
            const requestsToday = await this.subscriptionRepository.getDailyUsageCountForPlanExternalModel({
                username,
                planId: subscription.planId,
                externalModelName: normalizedExternalModelName,
                timezone: this.timezone,
            });

            return {
                mode: 'subscription',
                subscription,
                appliedLimit: {
                    planId: subscription.planId,
                    planName: subscription.planName,
                    externalModelName: normalizedExternalModelName,
                    dailyRequestLimit,
                    requestsToday,
                    remainingToday: null,
                    unlimited: dailyRequestLimit === 0,
                    quotaConsumptionEnabled,
                    quotaConsumptionPaused: !quotaConsumptionEnabled,
                    subscriptionExhausted: false,
                    allowBalanceFallback,
                },
            };
        }

        if (
            reserveQuota
            && requestId
            && typeof this.subscriptionRepository.reserveDailyUsage === 'function'
        ) {
            const reservation = await this.subscriptionRepository.reserveDailyUsage({
                requestId,
                username,
                planId: subscription.planId,
                externalModelName: normalizedExternalModelName,
                dailyRequestLimit,
                timezone: this.timezone,
            });

            if (reservation?.reserved) {
                return {
                    mode: 'subscription',
                    subscription,
                    quotaReservation: reservation,
                    appliedLimit: {
                        planId: subscription.planId,
                        planName: subscription.planName,
                        externalModelName: normalizedExternalModelName,
                        dailyRequestLimit,
                        requestsToday: reservation.requestsToday,
                        inflightToday: reservation.inflightCount,
                        remainingToday: reservation.remainingToday,
                        unlimited: false,
                        quotaConsumptionEnabled: true,
                        quotaConsumptionPaused: false,
                        subscriptionExhausted: false,
                        allowBalanceFallback,
                    },
                };
            }

            return {
                mode: allowBalanceFallback ? 'balance' : 'blocked',
                subscription,
                appliedLimit: {
                    planId: subscription.planId,
                    planName: subscription.planName,
                    externalModelName: normalizedExternalModelName,
                    dailyRequestLimit,
                    requestsToday: reservation?.requestsToday || 0,
                    inflightToday: reservation?.inflightCount || 0,
                    remainingToday: 0,
                    unlimited: false,
                    quotaConsumptionEnabled: true,
                    quotaConsumptionPaused: false,
                    subscriptionExhausted: true,
                    allowBalanceFallback,
                },
            };
        }

        const requestsToday = await this.subscriptionRepository.getDailyUsageCountForPlanExternalModel({
            username,
            planId: subscription.planId,
            externalModelName: normalizedExternalModelName,
            timezone: this.timezone,
        });

        if (requestsToday < dailyRequestLimit) {
            return {
                mode: 'subscription',
                subscription,
                appliedLimit: {
                    planId: subscription.planId,
                    planName: subscription.planName,
                    externalModelName: normalizedExternalModelName,
                    dailyRequestLimit,
                    requestsToday,
                    remainingToday: Math.max(0, dailyRequestLimit - requestsToday),
                    unlimited: false,
                    quotaConsumptionEnabled: true,
                    quotaConsumptionPaused: false,
                    subscriptionExhausted: false,
                    allowBalanceFallback,
                },
            };
        }

        return {
            mode: allowBalanceFallback ? 'balance' : 'blocked',
            subscription,
            appliedLimit: {
                planId: subscription.planId,
                planName: subscription.planName,
                externalModelName: normalizedExternalModelName,
                dailyRequestLimit,
                requestsToday,
                remainingToday: 0,
                unlimited: false,
                quotaConsumptionEnabled: true,
                quotaConsumptionPaused: false,
                subscriptionExhausted: true,
                allowBalanceFallback,
            },
        };
    }

    async completeUsageReservation({ quotaReservation, success }) {
        if (
            !quotaReservation?.requestId
            || typeof this.subscriptionRepository.completeDailyUsageReservation !== 'function'
        ) {
            return null;
        }

        return this.subscriptionRepository.completeDailyUsageReservation({
            requestId: quotaReservation.requestId,
            consume: success === true,
        });
    }
}

module.exports = {
    DEFAULT_SUBSCRIPTION_TIMEZONE,
    SubscriptionService,
};
