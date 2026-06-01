function createAuthController({ accountService, sessionService }) {
    async function authenticate(username, password, { adminOnly = false } = {}) {
        const admin = await accountService.getAdminByUsername(username);
        if (admin && password === admin.password) {
            return { role: 'admin', username: admin.username };
        }

        if (adminOnly) {
            return null;
        }

        const user = await accountService.getUserByUsername(username);
        if (user && password === user.password) {
            return { role: 'user', username: user.username };
        }

        return null;
    }

    return {
        async register(req, res) {
            const user = await accountService.createUser(req.body);
            const token = await sessionService.createSession(user.username, 'user');
            sessionService.setSessionCookie(res, token, 'user', { secure: req.secure });
            return res.status(201).json({
                ok: true,
                role: 'user',
                username: user.username,
                redirectTo: '/user',
            });
        },

        async login(req, res) {
            const username = String(req.body?.username || '').trim();
            const password = String(req.body?.password || '');

            if (!username || !password) {
                sessionService.clearSessionCookie(res, { secure: req.secure });
                return res.status(400).json({ error: 'Username and password are required.' });
            }

            const account = await authenticate(username, password);

            if (account) {
                const token = await sessionService.createSession(account.username, account.role);
                sessionService.setSessionCookie(res, token, account.role, { secure: req.secure });
                return res.json({
                    ok: true,
                    role: account.role,
                    username: account.username,
                    redirectTo: account.role === 'admin' ? '/admin' : '/user',
                });
            }

            sessionService.clearSessionCookie(res, { secure: req.secure });
            return res.status(401).json({ error: 'Invalid username or password.' });
        },

        async adminLogin(req, res) {
            const username = String(req.body?.username || '').trim();
            const password = String(req.body?.password || '');
            const account = await authenticate(username, password, { adminOnly: true });

            if (account) {
                const token = await sessionService.createSession(account.username, 'admin');
                sessionService.setSessionCookie(res, token, 'admin', { secure: req.secure });
                return res.json({ ok: true, role: 'admin', username: account.username, redirectTo: '/admin' });
            }

            sessionService.clearSessionCookie(res, 'admin', { secure: req.secure });
            return res.status(401).json({ error: 'Invalid username or password.' });
        },

        async adminLogout(req, res) {
            await sessionService.deleteSession(req.sessionToken);
            sessionService.clearSessionCookie(res, 'admin', { secure: req.secure });
            res.json({ ok: true });
        },

        async logout(req, res) {
            await sessionService.deleteSession(req.sessionToken);
            sessionService.clearSessionCookie(res, req.currentSession?.role || '', { secure: req.secure });
            res.json({ ok: true });
        },

        getAdminMe(req, res) {
            res.json({ ok: true, username: req.adminSession.username });
        },

        getUserMe(req, res) {
            res.json({ ok: true, username: req.userSession.username });
        },
    };
}

module.exports = {
    createAuthController,
};
