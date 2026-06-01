const { normalizeStoredId } = require('../../utils/normalizers');

class PgExternalModelRepository {
    constructor({ pool }) {
        this.pool = pool;
    }

    async getByName(name) {
        const result = await this.pool.query(`
            SELECT
                name,
                strategy,
                pricing_currency,
                input_per_million_tokens,
                output_per_million_tokens,
                cached_input_per_million_tokens,
                cache_creation_per_million_tokens,
                thinking_per_million_tokens,
                image_per_unit,
                request_flat_fee,
                price_multiplier,
                updated_at
            FROM external_models
            WHERE name = $1
        `, [String(name || '').trim()]);

        return result.rows[0] || null;
    }

    async listAll() {
        const result = await this.pool.query(`
            SELECT
                name,
                strategy,
                pricing_currency,
                input_per_million_tokens,
                output_per_million_tokens,
                cached_input_per_million_tokens,
                cache_creation_per_million_tokens,
                thinking_per_million_tokens,
                image_per_unit,
                request_flat_fee,
                price_multiplier,
                updated_at
            FROM external_models
            ORDER BY name
        `);

        return result.rows;
    }

    async upsert(externalModel) {
        const result = await this.pool.query(`
            INSERT INTO external_models (
                name,
                strategy,
                pricing_currency,
                input_per_million_tokens,
                output_per_million_tokens,
                cached_input_per_million_tokens,
                cache_creation_per_million_tokens,
                thinking_per_million_tokens,
                image_per_unit,
                request_flat_fee,
                price_multiplier,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (name) DO UPDATE SET
                strategy = EXCLUDED.strategy,
                pricing_currency = EXCLUDED.pricing_currency,
                input_per_million_tokens = EXCLUDED.input_per_million_tokens,
                output_per_million_tokens = EXCLUDED.output_per_million_tokens,
                cached_input_per_million_tokens = EXCLUDED.cached_input_per_million_tokens,
                cache_creation_per_million_tokens = EXCLUDED.cache_creation_per_million_tokens,
                thinking_per_million_tokens = EXCLUDED.thinking_per_million_tokens,
                image_per_unit = EXCLUDED.image_per_unit,
                request_flat_fee = EXCLUDED.request_flat_fee,
                price_multiplier = EXCLUDED.price_multiplier,
                updated_at = NOW()
            RETURNING
                name,
                strategy,
                pricing_currency,
                input_per_million_tokens,
                output_per_million_tokens,
                cached_input_per_million_tokens,
                cache_creation_per_million_tokens,
                thinking_per_million_tokens,
                image_per_unit,
                request_flat_fee,
                price_multiplier,
                updated_at
        `, [
            String(externalModel.name || '').trim(),
            String(externalModel.strategy || 'round_robin').trim() || 'round_robin',
            String(externalModel.pricing?.currency || 'USD').trim() || 'USD',
            Number(externalModel.pricing?.inputPerMillionTokens || 0),
            Number(externalModel.pricing?.outputPerMillionTokens || 0),
            Number(externalModel.pricing?.cachedInputPerMillionTokens || 0),
            Number(externalModel.pricing?.cacheCreationPerMillionTokens || 0),
            Number(externalModel.pricing?.thinkingPerMillionTokens || 0),
            Number(externalModel.pricing?.imagePerUnit || 0),
            Number(externalModel.pricing?.requestFlatFee || 0),
            Number(externalModel.pricing?.priceMultiplier || 1),
        ]);

        return result.rows[0] || null;
    }

    async deleteByName(name) {
        await this.pool.query('DELETE FROM external_models WHERE name = $1', [String(name || '').trim()]);
    }

    normalizeTarget(target = {}) {
        return {
            externalModelName: String(target.external_model_name || target.externalModelName || '').trim(),
            modelId: normalizeStoredId(target.model_id || target.modelId),
            priority: Number.isFinite(Number(target.priority)) ? Number(target.priority) : 100,
            weight: Number.isFinite(Number(target.weight)) ? Number(target.weight) : 1,
            enabled: target.enabled !== false,
            updatedAt: target.updated_at || target.updatedAt || null,
        };
    }

    async listTargets() {
        const result = await this.pool.query(`
            SELECT external_model_name, model_id, priority, weight, enabled, updated_at
            FROM external_model_targets
            ORDER BY external_model_name, priority, model_id
        `);

        return result.rows.map((row) => this.normalizeTarget(row));
    }

    async replaceTargets(externalModelName, targets = []) {
        const normalizedName = String(externalModelName || '').trim();
        await this.pool.query('DELETE FROM external_model_targets WHERE external_model_name = $1', [normalizedName]);

        for (const target of targets) {
            const normalizedTarget = this.normalizeTarget({
                ...target,
                externalModelName: normalizedName,
            });
            await this.pool.query(`
                INSERT INTO external_model_targets (
                    external_model_name,
                    model_id,
                    priority,
                    weight,
                    enabled,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
            `, [
                normalizedTarget.externalModelName,
                normalizedTarget.modelId,
                normalizedTarget.priority,
                normalizedTarget.weight,
                normalizedTarget.enabled,
            ]);
        }
    }
}

module.exports = {
    PgExternalModelRepository,
};
