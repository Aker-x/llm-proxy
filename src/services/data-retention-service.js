class DataRetentionService {
    constructor({
        usageStatsRepository,
        billingRepository,
        instanceId = '',
        config = {},
    }) {
        this.usageStatsRepository = usageStatsRepository;
        this.billingRepository = billingRepository;
        this.instanceId = String(instanceId || '').trim();
        this.config = {
            enabled: config.enabled !== false,
            recentRequestsRetentionDays: Number(config.recentRequestsRetentionDays || 0),
            statsEventsRetentionDays: Number(config.statsEventsRetentionDays || 0),
            completedReservationsRetentionDays: Number(config.completedReservationsRetentionDays || 0),
            intervalMs: Number(config.intervalMs || 0),
            runOnInstanceId: String(config.runOnInstanceId || '').trim(),
        };
        this.intervalHandle = null;
        this.currentRunPromise = null;
    }

    shouldRunOnThisInstance() {
        if (!this.config.enabled) {
            return false;
        }

        const configuredInstanceId = this.config.runOnInstanceId;
        const explicitInstanceId = String(process.env.INSTANCE_ID || '').trim();

        if (!configuredInstanceId) {
            return true;
        }

        if (!explicitInstanceId) {
            return true;
        }

        return explicitInstanceId === configuredInstanceId;
    }

    start() {
        if (!this.shouldRunOnThisInstance()) {
            console.info(
                `[retention] Skipping data retention on instance "${this.instanceId || 'unknown'}".`
            );
            return;
        }

        void this.runCleanup({ reason: 'startup' });

        if (this.config.intervalMs <= 0) {
            return;
        }

        this.intervalHandle = setInterval(() => {
            void this.runCleanup({ reason: 'scheduled' });
        }, this.config.intervalMs);

        if (typeof this.intervalHandle.unref === 'function') {
            this.intervalHandle.unref();
        }
    }

    stop() {
        if (!this.intervalHandle) {
            return;
        }

        clearInterval(this.intervalHandle);
        this.intervalHandle = null;
    }

    runCleanup({ reason = 'scheduled' } = {}) {
        if (!this.shouldRunOnThisInstance()) {
            return Promise.resolve(null);
        }

        if (this.currentRunPromise) {
            return this.currentRunPromise;
        }

        this.currentRunPromise = this._runCleanup({ reason })
            .catch((error) => {
                console.error(
                    `[retention] Cleanup failed on instance "${this.instanceId || 'unknown'}": `
                    + `${error.stack || error.message}`
                );
                return null;
            })
            .finally(() => {
                this.currentRunPromise = null;
            });

        return this.currentRunPromise;
    }

    async _runCleanup({ reason }) {
        const startedAt = Date.now();
        const result = {
            recentRequestsDeleted: 0,
            statsEventsDeleted: 0,
            completedReservationsDeleted: 0,
        };

        if (this.config.recentRequestsRetentionDays > 0) {
            result.recentRequestsDeleted = await this.usageStatsRepository.deleteRecentRequestsOlderThan(
                this.buildCutoffIso(this.config.recentRequestsRetentionDays)
            );
        }

        if (this.config.statsEventsRetentionDays > 0) {
            result.statsEventsDeleted = await this.usageStatsRepository.deleteStatsEventsOlderThan(
                this.buildCutoffIso(this.config.statsEventsRetentionDays)
            );
        }

        if (this.config.completedReservationsRetentionDays > 0) {
            result.completedReservationsDeleted = await this.billingRepository.deleteCompletedReservationsOlderThan(
                this.buildCutoffIso(this.config.completedReservationsRetentionDays)
            );
        }

        const durationMs = Date.now() - startedAt;
        const totalDeleted = result.recentRequestsDeleted
            + result.statsEventsDeleted
            + result.completedReservationsDeleted;

        if (reason === 'startup' || totalDeleted > 0) {
            console.info(
                `[retention] Cleanup ${reason} completed `
                + `instance=${this.instanceId || 'unknown'} `
                + `recent_requests=${result.recentRequestsDeleted} `
                + `stats_events=${result.statsEventsDeleted} `
                + `request_reservations=${result.completedReservationsDeleted} `
                + `durationMs=${durationMs}`
            );
        }

        return result;
    }

    buildCutoffIso(retentionDays) {
        return new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000)).toISOString();
    }
}

module.exports = {
    DataRetentionService,
};
