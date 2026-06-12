const { createHttpError } = require('../utils/http-error');

function normalizeRequestsPerMinute(value, fallbackValue = 60) {
    const numericValue = Number(value ?? fallbackValue);
    if (!Number.isFinite(numericValue) || numericValue < 1 || !Number.isInteger(numericValue)) {
        throw createHttpError(400, 'Requests per minute must be a positive integer.');
    }

    if (numericValue > 100000) {
        throw createHttpError(400, 'Requests per minute cannot exceed 100000.');
    }

    return numericValue;
}

class UpstreamRateLimitService {
    constructor({ rateLimitSettingsRepository }) {
        this.rateLimitSettingsRepository = rateLimitSettingsRepository;
    }

    async getAdminSettings() {
        const row = await this.rateLimitSettingsRepository.getById('default');
        return {
            enabled: Boolean(row?.enabled),
            requestsPerMinute: normalizeRequestsPerMinute(row?.requests_per_minute || 60),
            updatedAt: row?.updated_at || null,
        };
    }

    async updateAdminSettings(payload = {}) {
        const current = await this.getAdminSettings();
        const next = {
            ...current,
        };

        if (payload.enabled !== undefined) {
            next.enabled = Boolean(payload.enabled);
        }

        if (payload.requestsPerMinute !== undefined || payload.requestsPerMinute === null) {
            if (payload.requestsPerMinute === null || payload.requestsPerMinute === '') {
                if (next.enabled) {
                    throw createHttpError(400, 'Requests per minute is required when rate limiting is enabled.');
                }
            } else {
                next.requestsPerMinute = normalizeRequestsPerMinute(payload.requestsPerMinute, current.requestsPerMinute);
            }
        }

        if (next.enabled) {
            next.requestsPerMinute = normalizeRequestsPerMinute(next.requestsPerMinute, 60);
        }

        const saved = await this.rateLimitSettingsRepository.upsertDefault({
            enabled: next.enabled,
            requestsPerMinute: next.requestsPerMinute,
        });

        return {
            enabled: Boolean(saved?.enabled),
            requestsPerMinute: normalizeRequestsPerMinute(saved?.requests_per_minute || next.requestsPerMinute),
            updatedAt: saved?.updated_at || null,
        };
    }
}

module.exports = {
    UpstreamRateLimitService,
    normalizeRequestsPerMinute,
};
