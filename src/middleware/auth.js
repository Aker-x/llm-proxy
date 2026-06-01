const crypto = require('crypto');

function getBearerToken(req) {
    const authorization = String(req.headers.authorization || '').trim();
    if (!authorization.toLowerCase().startsWith('bearer ')) {
        return '';
    }

    return authorization.slice(7).trim();
}

function getApiKeyToken(req) {
    const bearerToken = getBearerToken(req);
    if (bearerToken) {
        return bearerToken;
    }

    return String(req.headers['x-api-key'] || '').trim();
}

function getOrCreateRequestId(req) {
    if (req.requestId) {
        return req.requestId;
    }

    const headerValue = String(req.headers['x-request-id'] || '').trim();
    req.requestId = headerValue || crypto.randomUUID();
    return req.requestId;
}

function getClientIp(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();

    return forwardedFor || req.socket?.remoteAddress || req.ip || 'unknown';
}

function getUserAgent(req) {
    return String(req.headers['user-agent'] || '').trim() || 'unknown';
}

function maskToken(token) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
        return '(missing)';
    }

    if (normalizedToken.length <= 12) {
        return `${normalizedToken.slice(0, 4)}...`;
    }

    return `${normalizedToken.slice(0, 8)}...${normalizedToken.slice(-4)}`;
}

function attachRequestContext(req, res) {
    const requestId = getOrCreateRequestId(req);
    req.clientIp = req.clientIp || getClientIp(req);
    res.setHeader('X-Proxy-Request-Id', requestId);
    return requestId;
}

function createAuthMiddleware({
    sessionService,
    adminLookup,
    userLookup,
    apiKeyAuthService,
    waitForBootstrapReady = async () => undefined,
}) {
    async function isValidSession(session) {
        if (!session) {
            return false;
        }

        if (session.role === 'admin') {
            return Boolean(await adminLookup(session.username));
        }

        if (session.role === 'user') {
            return Boolean(await userLookup(session.username));
        }

        return false;
    }

    return {
        async requireAuthenticated(req, res, next) {
            attachRequestContext(req, res);
            await waitForBootstrapReady();

            const auth = await sessionService.getSessionFromRequest(req);
            if (!auth || !(await isValidSession(auth.session))) {
                return res.status(401).json({ error: 'Unauthorized', requestId: req.requestId });
            }

            req.sessionToken = auth.token;
            req.currentSession = auth.session;
            next();
        },

        async requireApiAccess(req, res, next) {
            const requestId = attachRequestContext(req, res);
            await waitForBootstrapReady();

            const sessionAuth = await sessionService.getSessionFromRequest(req);
            if (sessionAuth && (await isValidSession(sessionAuth.session))) {
                req.sessionToken = sessionAuth.token;
                req.currentSession = sessionAuth.session;
                console.info(
                    `[${requestId}] API access granted via session `
                    + `user=${sessionAuth.session.username} method=${req.method} path=${req.originalUrl} ip=${req.clientIp}`
                );
                return next();
            }

            const apiKeyToken = getApiKeyToken(req);
            const apiKeyAuth = await apiKeyAuthService.authenticate(apiKeyToken);
            if (!apiKeyAuth) {
                console.warn(
                    `[${requestId}] API key auth failed `
                    + `method=${req.method} path=${req.originalUrl} ip=${req.clientIp} `
                    + `token=${maskToken(apiKeyToken)} userAgent="${getUserAgent(req)}"`
                );
                return res.status(401).json({ error: 'Unauthorized', requestId });
            }

            req.currentSession = apiKeyAuth;
            req.apiKeyAuth = apiKeyAuth;
            Promise.resolve(apiKeyAuth.touchLastUsedAt()).catch(() => undefined);
            console.info(
                `[${requestId}] API key auth success `
                + `user=${apiKeyAuth.username} apiKeyId=${apiKeyAuth.apiKeyId} `
                + `apiKeyName="${apiKeyAuth.apiKeyName}" method=${req.method} path=${req.originalUrl} `
                + `ip=${req.clientIp} token=${maskToken(apiKeyToken)}`
            );
            return next();
        },

        async requireAdmin(req, res, next) {
            attachRequestContext(req, res);
            await waitForBootstrapReady();

            const auth = await sessionService.getSessionFromRequest(req, { role: 'admin' });
            if (!auth || !(await isValidSession(auth.session)) || auth.session.role !== 'admin') {
                return res.status(401).json({ error: 'Unauthorized', requestId: req.requestId });
            }

            req.sessionToken = auth.token;
            req.adminSession = auth.session;
            next();
        },

        async requireUser(req, res, next) {
            attachRequestContext(req, res);
            await waitForBootstrapReady();

            const auth = await sessionService.getSessionFromRequest(req, { role: 'user' });
            if (!auth || !(await isValidSession(auth.session)) || auth.session.role !== 'user') {
                return res.status(401).json({ error: 'Unauthorized', requestId: req.requestId });
            }

            req.sessionToken = auth.token;
            req.userSession = auth.session;
            next();
        },
    };
}

module.exports = {
    createAuthMiddleware,
};
