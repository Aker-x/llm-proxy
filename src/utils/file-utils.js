const fs = require('fs');

function ensureDirExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function readJsonFile(filePath, fallbackValue) {
    if (!fs.existsSync(filePath)) {
        return fallbackValue;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

module.exports = {
    ensureDirExists,
    readJsonFile,
    writeJsonFile,
};
