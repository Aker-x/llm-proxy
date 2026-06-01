function createUserController({ statsService, accountService, sessionService }) {
    return {
        async getStats(req, res) {
            res.json(await statsService.getUserStats(req.userSession.username));
        },

        async getApiKeys(req, res) {
            res.json({
                apiKeys: await accountService.listUserApiKeys(req.userSession.username),
            });
        },

        async createApiKey(req, res) {
            const result = await accountService.createUserApiKey(req.userSession.username, req.body);
            res.json({
                ok: true,
                apiKey: result.apiKey,
                secret: result.secret,
            });
        },

        async deleteApiKey(req, res) {
            await accountService.deleteUserApiKey(req.userSession.username, req.params.keyId);
            res.json({ ok: true });
        },

        async updatePassword(req, res) {
            await accountService.updateUserOwnPassword(req.userSession.username, req.body);
            await sessionService.deleteSessionsForUser(req.userSession.username, 'user');
            sessionService.clearSessionCookie(res, 'user', { secure: req.secure });
            res.json({
                ok: true,
                requireRelogin: true,
            });
        },
    };
}

module.exports = {
    createUserController,
};
