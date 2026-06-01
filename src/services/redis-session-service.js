const crypto = require('crypto');
const { connectRedisClient } = require('../db/redis-client');

class RedisSessionService {
    constructor({ cookieNames, cookieName, getSessionTtlMs, redisClient }) {
        const fallbackCookieName = String(cookieName || '').trim() || 'admin_session';
        this.cookieNames = {
            admin: String(cookieNames?.admin || fallbackCookieName).trim() || fallbackCookieName,
            user: String(cookieNames?.user || cookieNames?.admin || fallbackCookieName).trim() || fallbackCookieName,
        };
        this.getSessionTtlMs = getSessionTtlMs;
        this.redisClient = redisClient;
    }

    getCookieName(role) {
        const normalizedRole = String(role || '').trim().toLowerCase();
        return this.cookieNames[normalizedRole] || this.cookieNames.admin;
    }

    getCookieNamesForLookup(role) {
        if (role) {
            return [this.getCookieName(role)];
        }

        return [
            this.getCookieName('user'),
            this.getCookieName('admin'),
        ].filter((cookieName, index, items) => items.indexOf(cookieName) === index);
    }

    getSessionKey(token) {
        return `${this.redisClient.keyPrefix}sessions:${token}`;
    }

    parseCookies(cookieHeader = '') {
        return cookieHeader
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .reduce((result, part) => {
                const separatorIndex = part.indexOf('=');
                if (separatorIndex === -1) {
                    return result;
                }

                const key = decodeURIComponent(part.slice(0, separatorIndex));
                const value = decodeURIComponent(part.slice(separatorIndex + 1));
                result[key] = value;
                return result;
            }, {});
    }

    setSessionCookie(res, token, roleOrOptions = {}, maybeOptions = {}) {
        const role = typeof roleOrOptions === 'string' ? roleOrOptions : '';
        const options = typeof roleOrOptions === 'string' ? maybeOptions : roleOrOptions;
        const maxAgeSeconds = Math.floor(this.getSessionTtlMs() / 1000);
        const secureFlag = options.secure ? '; Secure' : '';
        const cookieName = this.getCookieName(role);
        res.setHeader(
            'Set-Cookie',
            `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`
        );
    }

    clearSessionCookie(res, roleOrOptions = {}, maybeOptions = {}) {
        const role = typeof roleOrOptions === 'string' ? roleOrOptions : '';
        const options = typeof roleOrOptions === 'string' ? maybeOptions : roleOrOptions;
        const secureFlag = options.secure ? '; Secure' : '';
        const cookieNames = role
            ? [this.getCookieName(role)]
            : this.getCookieNamesForLookup();

        res.setHeader(
            'Set-Cookie',
            cookieNames.map((cookieName) => (
                `${cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secureFlag}`
            ))
        );
    }

    async createSession(username, role) {
        await connectRedisClient(this.redisClient);

        const token = crypto.randomBytes(32).toString('hex');
        const ttlMs = this.getSessionTtlMs();
        const expiresAt = Date.now() + ttlMs;

        await this.redisClient.set(this.getSessionKey(token), JSON.stringify({
            username,
            role,
            expiresAt,
        }), {
            PX: ttlMs,
        });

        return token;
    }

    async deleteSession(token) {
        await connectRedisClient(this.redisClient);
        await this.redisClient.del(this.getSessionKey(token));
    }

    async deleteSessionsForUser(username, role) {
        await connectRedisClient(this.redisClient);

        for await (const keys of this.redisClient.scanIterator({
            MATCH: `${this.redisClient.keyPrefix}sessions:*`,
        })) {
            for (const key of (Array.isArray(keys) ? keys : [keys])) {
                const payload = await this.redisClient.get(key);
                if (!payload) {
                    continue;
                }

                const session = JSON.parse(payload);
                const sameUsername = session.username === username;
                const sameRole = role ? session.role === role : true;
                if (sameUsername && sameRole) {
                    await this.redisClient.del(key);
                }
            }
        }
    }

    async getSessionFromRequest(req, { role } = {}) {
        await connectRedisClient(this.redisClient);

        const cookies = this.parseCookies(req.headers.cookie);
        for (const cookieName of this.getCookieNamesForLookup(role)) {
            const token = cookies[cookieName];
            if (!token) {
                continue;
            }

            const payload = await this.redisClient.get(this.getSessionKey(token));
            if (!payload) {
                continue;
            }

            const session = JSON.parse(payload);
            if (Number(session.expiresAt || 0) <= Date.now()) {
                await this.deleteSession(token);
                continue;
            }

            return {
                token,
                session,
                cookieName,
            };
        }

        return null;
    }
}

module.exports = {
    RedisSessionService,
};
