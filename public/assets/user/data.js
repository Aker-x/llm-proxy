export function createUserDataModule({
  elements,
  helpers,
}) {
  const {
    proxyBaseUrlValue,
    userIdentity,
  } = elements;
  const {
    renderApiKeys,
    renderAvailableModels,
    renderBillingSummary,
    renderRecentRequests,
    renderRechargeOrders,
    renderSubscriptionOrders,
    renderSubscriptionOverview,
    requestJson,
    state,
  } = helpers;

  function getUserState() {
    return state.get();
  }

  function setUserState(nextPartial) {
    state.set(nextPartial);
  }

  async function loadCurrentUser() {
    const data = await requestJson('/api/user/me');
    setUserState({ currentUser: data.username || '' });
    if (userIdentity) {
      userIdentity.textContent = `\u5f53\u524d\u767b\u5f55\uff1a${data.username}`;
    }
  }

  async function loadBilling() {
    const data = await requestJson('/api/user/billing');
    setUserState({ billing: data || {} });
    const { billing } = getUserState();
    renderBillingSummary(billing);
    renderRechargeOrders(billing.orders || []);
  }

  async function loadSubscription() {
    const data = await requestJson('/api/user/subscription');
    setUserState({ subscription: data || {} });
    const { subscription } = getUserState();
    renderSubscriptionOverview(subscription);
    renderSubscriptionOrders(subscription.orders || []);
  }

  async function loadUserStats() {
    const data = await requestJson('/api/user/stats');
    setUserState({
      recentRequests: data.recentRequests || [],
      summary: data.summary || {},
    });
    renderRecentRequests(getUserState().recentRequests);
  }

  async function loadApiKeys() {
    const data = await requestJson('/api/user/api-keys');
    setUserState({ apiKeys: data.apiKeys || [] });
    renderApiKeys(getUserState().apiKeys);
  }

  async function loadAvailableModels() {
    const data = await requestJson('/api/public/models');
    setUserState({ models: data.models || [] });
    renderAvailableModels(getUserState().models);
    if (proxyBaseUrlValue) {
      proxyBaseUrlValue.textContent = `${window.location.origin}/v1`;
    }
  }

  async function refreshAllData() {
    await Promise.all([
      loadCurrentUser(),
      loadBilling(),
      loadSubscription(),
      loadUserStats(),
      loadAvailableModels(),
      loadApiKeys(),
    ]);
  }

  return {
    loadApiKeys,
    loadAvailableModels,
    loadBilling,
    loadCurrentUser,
    loadSubscription,
    loadUserStats,
    refreshAllData,
  };
}
