const { dependencies = {} } = require('../package.json');

function verifyRuntime({ dependenciesOnly = false } = {}) {
    const failures = [];
    const names = Object.keys(dependencies);
    for (const name of names) {
        try {
            // Load the package, including its transitive imports; resolving a path is insufficient.
            require(name);
        } catch (error) {
            failures.push(`${name}: ${error.message}`);
        }
    }
    if (failures.length) {
        throw new Error(`Runtime dependencies are missing or cannot load:\n${failures.join('\n')}`);
    }
    if (!dependenciesOnly) {
        // Importing the entrypoint does not start the server or connect to the database.
        const { main } = require('../src/server');
        if (typeof main !== 'function') throw new Error('Application entrypoint is invalid.');
        const { createPgPool } = require('../src/db/pg-pool');
        if (typeof createPgPool !== 'function') throw new Error('Migration database module is invalid.');
    }
    console.log(`Runtime check passed: ${names.length} production dependencies${dependenciesOnly ? '' : ' and application entrypoint'}.`);
}

if (require.main === module) {
    try {
        verifyRuntime({ dependenciesOnly: process.argv.includes('--dependencies-only') });
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { verifyRuntime };
