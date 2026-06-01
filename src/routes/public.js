const express = require('express');

function createPublicRoutes({ publicController }) {
    const router = express.Router();

    router.get('/api/public/models', publicController.getModels);

    return router;
}

module.exports = {
    createPublicRoutes,
};
