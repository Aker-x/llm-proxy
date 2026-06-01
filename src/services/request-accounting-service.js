const crypto = require('crypto');

class RequestAccountingService {
    constructor({ billingRepository, requestRepository, statsEventRepository }) {
        this.billingRepository = billingRepository;
        this.requestRepository = requestRepository;
        this.statsEventRepository = statsEventRepository;
    }

    createRequestId() {
        return crypto.randomUUID();
    }

    async reserve({
        requestId = this.createRequestId(),
        username,
        routeId = null,
        providerId,
        modelId,
        reservedAmountUsd,
    }) {
        return this.billingRepository.reserveFunds({
            requestId,
            username,
            routeId,
            providerId,
            modelId,
            reservedAmountUsd,
        });
    }

    async settle({
        requestId,
        username,
        success,
        actualAmountUsd,
        requestSummary,
        statsEvent,
    }) {
        const reservation = await this.billingRepository.settleReservation({
            requestId,
            username,
            providerId: requestSummary?.providerId || statsEvent?.providerId || null,
            modelId: requestSummary?.billingModelId || requestSummary?.modelId || statsEvent?.modelId || null,
            actualAmountUsd,
            success,
        });

        if (requestSummary) {
            await this.requestRepository.createRecentRequest(requestSummary);
        }

        if (statsEvent) {
            await this.statsEventRepository.create(statsEvent);
        }

        return reservation;
    }

    async recordUsageOnly({
        requestSummary,
        statsEvent,
    }) {
        if (requestSummary) {
            await this.requestRepository.createRecentRequest(requestSummary);
        }

        if (statsEvent) {
            await this.statsEventRepository.create(statsEvent);
        }

        return {
            recorded: true,
            requestId: requestSummary?.requestId || statsEvent?.requestId || null,
        };
    }
}

module.exports = {
    RequestAccountingService,
};
