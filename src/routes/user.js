const express = require('express');

function createUserRoutes({ auth, userController }) {
    const router = express.Router();

    router.get('/api/user/stats', auth.requireUser, userController.getStats);
    router.put('/api/user/password', auth.requireUser, userController.updatePassword);
    router.get('/api/user/api-keys', auth.requireUser, userController.getApiKeys);
    router.post('/api/user/api-keys', auth.requireUser, userController.createApiKey);
    router.delete('/api/user/api-keys/:keyId', auth.requireUser, userController.deleteApiKey);

    return router;
}

module.exports = {
    createUserRoutes,
};
