const { getDefaultPgPool } = require('../db/pg-pool');
const { getDefaultRedisClient } = require('../db/redis-client');
const { PgAdminRepository } = require('../repositories/pg/admin-repository');
const { PgApiKeyRepository } = require('../repositories/pg/api-key-repository');
const { PgBillingRepository } = require('../repositories/pg/billing-repository');
const { PgExternalModelRepository } = require('../repositories/pg/external-model-repository');
const { PgModelRepository } = require('../repositories/pg/model-repository');
const { PgPaymentSettingsRepository } = require('../repositories/pg/payment-settings-repository');
const { PgProviderRepository } = require('../repositories/pg/provider-repository');
const { PgRechargeOrderRepository } = require('../repositories/pg/recharge-order-repository');
const { PgRequestRepository } = require('../repositories/pg/request-repository');
const { PgSessionRepository } = require('../repositories/pg/session-repository');
const { PgStatsEventRepository } = require('../repositories/pg/stats-event-repository');
const { PgSubscriptionRepository } = require('../repositories/pg/subscription-repository');
const { PgUsageStatsRepository } = require('../repositories/pg/usage-stats-repository');
const { PgUserRepository } = require('../repositories/pg/user-repository');
const { ApiKeyAuthService } = require('../services/api-key-auth-service');
const { RedisSessionService } = require('../services/redis-session-service');
const { RequestAccountingService } = require('../services/request-accounting-service');
const { ModelResolutionService } = require('../services/model-resolution-service');

function createRuntimeInfra({
    pgPool = getDefaultPgPool(),
    redisClient = getDefaultRedisClient(),
    cookieNames,
    cookieName,
    getSessionTtlMs,
} = {}) {
    const repositories = {
        adminRepository: new PgAdminRepository({ pool: pgPool }),
        userRepository: new PgUserRepository({ pool: pgPool }),
        apiKeyRepository: new PgApiKeyRepository({ pool: pgPool }),
        paymentSettingsRepository: new PgPaymentSettingsRepository({ pool: pgPool }),
        providerRepository: new PgProviderRepository({ pool: pgPool }),
        rechargeOrderRepository: new PgRechargeOrderRepository({ pool: pgPool }),
        externalModelRepository: new PgExternalModelRepository({ pool: pgPool }),
        modelRepository: new PgModelRepository({ pool: pgPool }),
        sessionRepository: new PgSessionRepository({ pool: pgPool }),
        billingRepository: new PgBillingRepository({ pool: pgPool }),
        requestRepository: new PgRequestRepository({ pool: pgPool }),
        statsEventRepository: new PgStatsEventRepository({ pool: pgPool }),
        subscriptionRepository: new PgSubscriptionRepository({ pool: pgPool }),
        usageStatsRepository: new PgUsageStatsRepository({ pool: pgPool }),
    };

    const services = {
        modelResolutionService: new ModelResolutionService({
            providerRepository: repositories.providerRepository,
            externalModelRepository: repositories.externalModelRepository,
            modelRepository: repositories.modelRepository,
            redisClient,
        }),
        apiKeyAuthService: new ApiKeyAuthService({
            apiKeyRepository: repositories.apiKeyRepository,
        }),
        sessionService: new RedisSessionService({
            cookieNames,
            cookieName,
            getSessionTtlMs,
            redisClient,
        }),
        requestAccountingService: new RequestAccountingService({
            billingRepository: repositories.billingRepository,
            requestRepository: repositories.requestRepository,
            statsEventRepository: repositories.statsEventRepository,
        }),
    };

    return {
        pgPool,
        redisClient,
        repositories,
        services,
    };
}

module.exports = {
    createRuntimeInfra,
};
