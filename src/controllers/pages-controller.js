const path = require('path');

function createPagesController({ publicDir }) {
    return {
        getHome(_req, res) {
            res.sendFile(path.join(publicDir, 'index.html'));
        },

        getUserPage(_req, res) {
            res.sendFile(path.join(publicDir, 'user.html'));
        },

        getAdminPage(_req, res) {
            res.sendFile(path.join(publicDir, 'admin.html'));
        },

        redirectAdminLogin(_req, res) {
            res.redirect('/');
        },
    };
}

module.exports = {
    createPagesController,
};
