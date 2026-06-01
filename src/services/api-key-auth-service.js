class ApiKeyAuthService {
    constructor({ apiKeyRepository }) {
        this.apiKeyRepository = apiKeyRepository;
    }

    async authenticate(secret) {
        const normalizedSecret = String(secret || '').trim();
        if (!normalizedSecret) {
            return null;
        }

        const apiKeyRecord = await this.apiKeyRepository.findByApiKey(normalizedSecret);
        if (!apiKeyRecord) {
            return null;
        }

        return {
            username: apiKeyRecord.username,
            role: 'user',
            apiKeyId: apiKeyRecord.id,
            apiKeyName: apiKeyRecord.name,
            touchLastUsedAt: async () => {
                await this.apiKeyRepository.touchLastUsedAt(apiKeyRecord.id);
            },
        };
    }
}

module.exports = {
    ApiKeyAuthService,
};
