const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

const htmlChecks = [
    { file: 'public/index.html', expectedScript: '/assets/auth.js' },
    { file: 'public/admin-login.html', expectedScript: '/assets/admin/login.js' },
    { file: 'public/admin.html', expectedScript: '/assets/admin.js' },
    { file: 'public/user.html', expectedScript: '/assets/user.js' },
];

const requiredFiles = [
    'public/assets/shared/api.js',
    'public/assets/shared/form-ui.js',
    'public/assets/shared/format.js',
    'public/assets/shared/action-ui.js',
    'public/assets/shared/clipboard.js',
    'public/assets/admin/login.js',
    'public/assets/admin/users-stats.js',
    'public/assets/admin/catalog-ui.js',
    'public/assets/admin/catalog-actions.js',
    'public/assets/admin/account-actions.js',
    'public/assets/admin/account-ui.js',
    'public/assets/admin/remote-sync.js',
    'public/assets/admin/shell-actions.js',
    'public/assets/admin/data.js',
    'public/assets/admin/bootstrap.js',
    'public/assets/admin/catalog-state.js',
    'public/assets/user/rendering.js',
    'public/assets/user/actions.js',
    'public/assets/user/data.js',
];

function readFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function verifyHtmlEntries() {
    for (const { file, expectedScript } of htmlChecks) {
        const content = readFile(file);
        const moduleScriptPattern = new RegExp(`<script[^>]+type=["']module["'][^>]+src=["']${expectedScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i');
        assert(
            moduleScriptPattern.test(content),
            `${file} does not contain module script ${expectedScript}`
        );
    }
}

function verifyRequiredFiles() {
    for (const relativePath of requiredFiles) {
        assert(
            fs.existsSync(path.join(projectRoot, relativePath)),
            `Missing required file: ${relativePath}`
        );
    }
}

function verifySyntax() {
    const files = [
        'public/assets/auth.js',
        'public/assets/admin.js',
        'public/assets/user.js',
        ...requiredFiles,
    ];

    for (const relativePath of files) {
        execFileSync('node', ['--check', relativePath], {
            cwd: projectRoot,
            stdio: 'pipe',
        });
    }
}

function verifyRefactorMarkers() {
    const adminJs = readFile('public/assets/admin.js');
    const userJs = readFile('public/assets/user.js');

    assert(
        adminJs.includes("createCatalogActions"),
        'admin.js is missing createCatalogActions integration'
    );
    assert(
        adminJs.includes("createAccountActions"),
        'admin.js is missing createAccountActions integration'
    );
    assert(
        adminJs.includes("createRemoteSyncActions"),
        'admin.js is missing createRemoteSyncActions integration'
    );
    assert(
        adminJs.includes("createAdminDataModule"),
        'admin.js is missing createAdminDataModule integration'
    );
    assert(
        userJs.includes("createUserRenderingModule"),
        'user.js is missing createUserRenderingModule integration'
    );
    assert(
        userJs.includes("createUserActions"),
        'user.js is missing createUserActions integration'
    );
    assert(
        userJs.includes("createUserDataModule"),
        'user.js is missing createUserDataModule integration'
    );
}

function main() {
    verifyHtmlEntries();
    verifyRequiredFiles();
    verifySyntax();
    verifyRefactorMarkers();
    console.log('Frontend structure verification passed.');
}

main();
