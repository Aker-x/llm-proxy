async function withPgTransaction(pool, callback) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // Preserve the original error when rollback fails.
        }

        throw error;
    } finally {
        client.release();
    }
}

function normalizeNumericString(value, fallbackValue = 0) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return Number(fallbackValue).toFixed(6);
    }

    return numericValue.toFixed(6);
}

module.exports = {
    normalizeNumericString,
    withPgTransaction,
};
