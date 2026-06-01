const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnv() {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const explicitEnvFile = String(process.env.ENV_FILE || '').trim();
    const envPath = explicitEnvFile
        ? path.resolve(projectRoot, explicitEnvFile)
        : path.join(projectRoot, '.env');

    if (!fs.existsSync(envPath)) {
        return;
    }

    dotenv.config({ path: envPath });
}

loadEnv();

module.exports = {
    loadEnv,
};
