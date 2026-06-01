const { chatCompletionsApi } = require('./chat-completions-api');
const { responsesApi } = require('./responses-api');
const { responsesCompactApi } = require('./responses-compact-api');
const { messagesApi } = require('./messages-api');

const proxyApis = new Map([
    [chatCompletionsApi.id, chatCompletionsApi],
    [responsesApi.id, responsesApi],
    [responsesCompactApi.id, responsesCompactApi],
    [messagesApi.id, messagesApi],
]);

function getProxyApi(apiId) {
    return proxyApis.get(apiId) || null;
}

module.exports = {
    getProxyApi,
};
