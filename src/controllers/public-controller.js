function createPublicController({ modelResolutionService, waitForBootstrapReady = async () => undefined }) {
    return {
        async getModels(_req, res) {
            await waitForBootstrapReady();
            const modelEntries = await modelResolutionService.getModelCatalogEntries();
            res.json({
                models: modelEntries.map(({ externalModel }) => ({
                    id: externalModel.name,
                    name: externalModel.name,
                    strategy: externalModel.strategy,
                    pricing: externalModel.pricing,
                    displayPricing: externalModel.pricing
                        ? { ...externalModel.pricing, priceMultiplier: 1 }
                        : null,
                })),
            });
        },
    };
}

module.exports = {
    createPublicController,
};
