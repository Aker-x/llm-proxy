const { responsesApi } = require('./responses-api');

const responsesCompactApi = {
    id: 'responses_compact',
    label: 'response compact',
    prepareRequest(options) {
        return responsesApi.prepareRequest({
            ...options,
            endpointPath: 'responses/compact',
        });
    },
    extractResponseMetadata: responsesApi.extractResponseMetadata,
};

module.exports = {
    responsesCompactApi,
};
