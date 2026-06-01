const express = require('express');

function createProxyRoutes({ auth, proxyController }) {
    const router = express.Router();

    router.get('/v1/models', auth.requireApiAccess, proxyController.getModels);
    router.get('/v1/models/:modelId', auth.requireApiAccess, proxyController.getModel);
    router.post('/v1/messages/count_tokens', auth.requireApiAccess, proxyController.countMessageTokens);
    router.post('/v1/chat/completions', auth.requireApiAccess, proxyController.createChatCompletion);
    router.post('/v1/responses', auth.requireApiAccess, proxyController.createResponse);
    router.post('/v1/responses/compact', auth.requireApiAccess, proxyController.createResponseCompact);
    router.post('/v1/messages', auth.requireApiAccess, proxyController.createMessage);

    return router;
}

module.exports = {
    createProxyRoutes,
};
