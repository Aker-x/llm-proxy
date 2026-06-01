const express = require('express');

function createPageRoutes({ pagesController }) {
    const router = express.Router();

    router.get('/', pagesController.getHome);
    router.get('/user', pagesController.getUserPage);
    router.get('/admin', pagesController.getAdminPage);
    router.get('/admin/login', pagesController.redirectAdminLogin);

    return router;
}

module.exports = {
    createPageRoutes,
};
