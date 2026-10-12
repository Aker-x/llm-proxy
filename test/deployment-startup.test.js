const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function findBash() {
    if (process.platform !== 'win32') return '/bin/bash';
    try {
        const gitPath = execFileSync('where.exe', ['git'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
        const bashPath = path.resolve(path.dirname(gitPath), '..', 'bin', 'bash.exe');
        return fs.existsSync(bashPath) ? bashPath : null;
    } catch {
        return null;
    }
}

const bash = findBash();
for (const migrationExit of [0, 1]) {
    test(`deployment migration exit ${migrationExit} controls application restart`, { skip: !bash }, () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-proxy-deployment-'));
        try {
            const scriptDir = path.join(root, 'scripts');
            const binDir = path.join(root, 'bin');
            fs.mkdirSync(scriptDir);
            fs.mkdirSync(binDir);
            fs.copyFileSync(path.join(__dirname, '../scripts/start-multi-instance.sh'), path.join(scriptDir, 'start.sh'));
            fs.copyFileSync(path.join(__dirname, 'fixtures/deploy-fake-docker.sh'), path.join(binDir, 'docker'));
            fs.writeFileSync(path.join(root, '.env.deploy'), '');
            fs.writeFileSync(path.join(root, 'docker-compose.deploy.yml'), '');
            const env = { ...process.env };
            const originalPath = env.PATH || env.Path || '';
            delete env.Path;
            Object.assign(env, {
                PATH: `${binDir}${path.delimiter}${originalPath}`,
                MODE: 'dev',
                ENV_FILE: '.env.deploy',
                DEV_COMPOSE_FILE: 'docker-compose.deploy.yml',
                DEPLOY_TEST_DOCKER_LOG: path.join(root, 'docker.log'),
                DEPLOY_TEST_MIGRATION_EXIT: String(migrationExit),
            });
            execFileSync(bash, ['-c', 'chmod +x "$1"', 'test', path.join(binDir, 'docker')], { env });
            const result = spawnSync(bash, [path.join(scriptDir, 'start.sh')], { env, encoding: 'utf8', timeout: 15000 });
            assert.equal(result.error, undefined);
            assert.equal(result.status, migrationExit, result.stdout + result.stderr);
            const calls = fs.readFileSync(path.join(root, 'docker.log'), 'utf8').split(/\r?\n/);
            const migration = calls.findIndex((line) => /up .*--no-deps migrate$/.test(line));
            const restart = calls.findIndex((line) => /up .*app-1 app-2 app-3 nginx$/.test(line));
            assert.ok(migration >= 0, 'Migration must run before the applications');
            if (migrationExit) {
                assert.equal(restart, -1, 'A migration failure must not recreate application containers');
                assert.match(result.stdout, /Migration details: test failure/);
            } else {
                assert.ok(restart > migration, 'Applications restart only after migration succeeds');
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
}
