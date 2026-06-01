require('./bootstrap/load-env');

const os = require('os');
const { DEFAULT_PORT } = require('./config/constants');
const { createApp } = require('./app');

function getLocalIpv4Addresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const entries of Object.values(interfaces)) {
        for (const entry of entries || []) {
            const isIpv4 = entry?.family === 'IPv4' || entry?.family === 4;
            if (!isIpv4 || entry.internal || !entry.address) {
                continue;
            }

            if (!addresses.includes(entry.address)) {
                addresses.push(entry.address);
            }
        }
    }

    return addresses;
}

async function main() {
    const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;
    const { app, services } = createApp({ port: requestedPort });
    await services.bootstrapReadyPromise;

    const listenPort = requestedPort || DEFAULT_PORT;
    app.listen(listenPort, '0.0.0.0', () => {
        console.log(`LLM proxy server listening on all interfaces at http://0.0.0.0:${listenPort}`);
        console.log(`Local access: http://127.0.0.1:${listenPort}`);

        const lanAddresses = getLocalIpv4Addresses();
        if (lanAddresses.length) {
            console.log('LAN access:');
            for (const address of lanAddresses) {
                console.log(`  http://${address}:${listenPort}`);
            }
        }
    });
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    main,
};
