require('../src/bootstrap/load-env');

const fs = require('fs');
const path = require('path');
const { createPgPool } = require('../src/db/pg-pool');

async function main() {
    const migrationPath = path.join(__dirname, 'postgres', '001_runtime_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const pool = createPgPool();

    try {
        await pool.query(sql);
        console.log(`Applied migration: ${migrationPath}`);
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
