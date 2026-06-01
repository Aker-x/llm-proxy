const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.join(projectRoot, 'public');

module.exports = {
    publicDir,
};
