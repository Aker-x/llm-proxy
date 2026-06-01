const os = require('os');
const path = require('path');
const cors = require('cors');
const express = require('express');
const {
    ADMIN_SESSION_COOKIE_NAME,
    DEFAULT_PORT,
    DEFAULT_SESSION_TTL_HOURS,
    USER_SESSION_COOKIE_NAME,
} = require('./config/constants');
const { createRuntimeInfra } = require('./bootstrap/create-runtime-infra');
const { ensureInitialState } = require('./bootstrap/ensure-initial-state');
const { getDataRetentionConfig } = require('./config/infrastructure');
const { publicDir } = require('./config/paths');
const { createAdminController } = require('./controllers/admin-controller');
const { createAuthController } = require('./controllers/auth-controller');
const { createBillingController } = require('./controllers/billing-controller');
const { createPagesController } = require('./controllers/pages-controller');
const { createProxyController } = require('./controllers/proxy-controller');
const { createPublicController } = require('./controllers/public-controller');
const { createUserController } = require('./controllers/user-controller');
const { createAuthMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { createAdminRoutes } = require('./routes/admin');
const { createAuthRoutes } = require('./routes/auth');
const { createBillingRoutes } = require('./routes/billing');
const { createPageRoutes } = require('./routes/pages');
const { createProxyRoutes } = require('./routes/proxy');
const { createPublicRoutes } = require('./routes/public');
const { createUserRoutes } = require('./routes/user');
const { AccountService } = require('./services/account-service');
const { AuthManagementService } = require('./services/auth-management-service');
const { BillingService } = require('./services/billing-service');
const { CatalogAdminService } = require('./services/catalog-admin-service');
const { RemoteSyncService } = require('./services/remote-sync-service');
const { PaymentConfigService } = require('./services/payment-config-service');
const { ProxyService } = require('./services/proxy-service');
const { PgStatsService } = require('./services/pg-stats-service');
const { SubscriptionService } = require('./services/subscription-service');
const { DataRetentionService } = require('./services/data-retention-service');
const { ensureDirExists } = require('./utils/file-utils');

const UNBOUNDED_BODY_LIMIT = Number.POSITIVE_INFINITY;

function createApp({ port = DEFAULT_PORT } = {}) {
    ensureDirExists(publicDir);
    ensureDirExists(path.join(publicDir, 'assets'));
    const instanceId = String(process.env.INSTANCE_ID || os.hostname()).trim() || 'unknown';

    const runtimeInfra = createRuntimeInfra({
        cookieNames: {
            admin: ADMIN_SESSION_COOKIE_NAME,
            user: USER_SESSION_COOKIE_NAME,
        },
        getSessionTtlMs: () => DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000,
    });
    const dataRetentionConfig = getDataRetentionConfig();
    const bootstrapReadyPromise = ensureInitialState({
        adminRepository: runtimeInfra.repositories.adminRepository,
        userRepository: runtimeInfra.repositories.userRepository,
        paymentSettingsRepository: runtimeInfra.repositories.paymentSettingsRepository,
    });

    const statsService = new PgStatsService({
        usageStatsRepository: runtimeInfra.repositories.usageStatsRepository,
    });
    const paymentConfigService = new PaymentConfigService({
        paymentSettingsRepository: runtimeInfra.repositories.paymentSettingsRepository,
    });
    const accountService = new AccountService({
        adminRepository: runtimeInfra.repositories.adminRepository,
        userRepository: runtimeInfra.repositories.userRepository,
        apiKeyRepository: runtimeInfra.repositories.apiKeyRepository,
    });
    const authManagementService = new AuthManagementService();
    const catalogAdminService = new CatalogAdminService({
        pool: runtimeInfra.pgPool,
        providerRepository: runtimeInfra.repositories.providerRepository,
        externalModelRepository: runtimeInfra.repositories.externalModelRepository,
        modelRepository: runtimeInfra.repositories.modelRepository,
        modelResolutionService: runtimeInfra.services.modelResolutionService,
    });
    const remoteSyncService = new RemoteSyncService({ catalogAdminService });
    const billingService = new BillingService({
        paymentConfigService,
        userLookup: (username) => runtimeInfra.repositories.userRepository.getByUsername(username),
        rechargeOrderRepository: runtimeInfra.repositories.rechargeOrderRepository,
        billingRepository: runtimeInfra.repositories.billingRepository,
    });
    const subscriptionService = new SubscriptionService({
        subscriptionRepository: runtimeInfra.repositories.subscriptionRepository,
        userLookup: (username) => runtimeInfra.repositories.userRepository.getByUsername(username),
    });
    const sessionService = runtimeInfra.services.sessionService;
    const dataRetentionService = new DataRetentionService({
        usageStatsRepository: runtimeInfra.repositories.usageStatsRepository,
        billingRepository: runtimeInfra.repositories.billingRepository,
        instanceId,
        config: dataRetentionConfig,
    });
    const proxyService = new ProxyService({
        statsService,
        modelResolutionService: runtimeInfra.services.modelResolutionService,
        requestAccountingService: runtimeInfra.services.requestAccountingService,
        paymentConfigService,
        userLookup: (username) => runtimeInfra.repositories.userRepository.getByUsername(username),
        subscriptionService,
        catalogAdminService,
        userRateLimitScheduler: (username) => runtimeInfra.repositories.userRepository.reserveUpstreamRateLimitSlot(username),
        waitForBootstrapReady: () => bootstrapReadyPromise,
        redisClient: runtimeInfra.redisClient,
    });
    const auth = createAuthMiddleware({
        sessionService,
        adminLookup: (username) => runtimeInfra.repositories.adminRepository.getByUsername(username),
        userLookup: (username) => runtimeInfra.repositories.userRepository.getByUsername(username),
        apiKeyAuthService: runtimeInfra.services.apiKeyAuthService,
        waitForBootstrapReady: () => bootstrapReadyPromise,
    });
    const pagesController = createPagesController({ publicDir });
    const publicController = createPublicController({
        modelResolutionService: runtimeInfra.services.modelResolutionService,
        waitForBootstrapReady: () => bootstrapReadyPromise,
    });
    const authController = createAuthController({
        accountService,
        sessionService,
    });
    const billingController = createBillingController({ billingService, subscriptionService });
    const adminController = createAdminController({
        accountService,
        proxyService,
        sessionService,
        statsService,
        userRepository: runtimeInfra.repositories.userRepository,
        billingService,
        subscriptionService,
        catalogAdminService,
        remoteSyncService,
        authManagementService,
        paymentConfigService,
    });
    const userController = createUserController({
        statsService,
        accountService,
        sessionService,
    });
    const proxyController = createProxyController({ proxyService });
    const app = express();

    // Trust proxy so req.secure reflects the original client connection protocol
    // (Nginx sets X-Forwarded-Proto; this is needed for correct Secure cookie flag)
    if (String(process.env.TRUST_PROXY || 'true').toLowerCase() !== 'false') {
        app.set('trust proxy', 1);
    }

    app.set('etag', false);
    app.use(cors({
        exposedHeaders: ['X-Proxy-Instance', 'X-Proxy-Request-Id'],
    }));
    app.use((req, res, next) => {
        res.setHeader('X-Proxy-Instance', instanceId);
        next();
    });
    app.use('/api', (req, res, next) => {
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        next();
    });
    // Match the reference proxy: do not impose a proxy-side request body cap here.
    app.use(express.json({ limit: UNBOUNDED_BODY_LIMIT }));
    app.use(express.urlencoded({ extended: false, limit: UNBOUNDED_BODY_LIMIT }));
    app.use(express.static(publicDir));

    app.use(createPageRoutes({ pagesController }));
    app.use(createPublicRoutes({ publicController }));
    app.use(createAuthRoutes({ auth, authController }));
    app.use(createAdminRoutes({ adminController, auth }));
    app.use(createUserRoutes({ auth, userController }));
    app.use(createBillingRoutes({ auth, billingController }));
    app.use(createProxyRoutes({ auth, proxyController }));

    app.use(errorHandler);

    bootstrapReadyPromise
        .then(() => {
            dataRetentionService.start();
        })
        .catch((error) => {
            console.error(
                `[retention] Skipping retention startup due to bootstrap failure: `
                + `${error.stack || error.message}`
            );
        });

    return {
        app,
        services: {
            proxyService,
            billingService,
            subscriptionService,
            accountService,
            authManagementService,
            paymentConfigService,
            catalogAdminService,
            sessionService,
            statsService,
            dataRetentionService,
            bootstrapReadyPromise,
            runtimeInfra,
        },
    };
}

module.exports = {
    createApp,
};
