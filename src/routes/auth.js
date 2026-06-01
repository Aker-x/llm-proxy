const express = require('express');

function createAuthRoutes({ auth, authController }) {
    const router = express.Router();

    router.post('/api/register', authController.register);
    router.post('/api/login', authController.login);
    router.post('/api/admin/login', authController.adminLogin);
    router.post('/api/admin/logout', auth.requireAdmin, authController.adminLogout);
    router.post('/api/logout', auth.requireAuthenticated, authController.logout);
    router.get('/api/admin/me', auth.requireAdmin, authController.getAdminMe);
    router.get('/api/user/me', auth.requireUser, authController.getUserMe);

    return router;
}

module.exports = {
    createAuthRoutes,
};
