export function createAdminDataModule({
  elements,
  helpers,
}) {
  const {
    adminIdentity,
    modelProviderSelect,
  } = elements;
  const {
    compareExternalModels,
    compareModels,
    compareProviders,
    populateProviderSelect,
    renderManagedUsers,
    renderProviderTables,
    renderRecentRequests,
    renderRechargeRequests,
    renderRateLimitSettings,
    renderSubscriberUsage,
    renderTodayUserStats,
    renderSubscriptionOrders,
    renderSubscriptionPlans,
    renderSubscriptionSettings,
    renderUserStats,
    requestJson,
    state,
  } = helpers;

  function getAdminState() {
    return state.get();
  }

  function setAdminState(nextPartial) {
    state.set(nextPartial);
  }

  async function loadProviders() {
    const data = await requestJson('/api/admin/providers');
    const currentProviders = [...(data.providers || [])].sort(compareProviders);
    const currentModels = [...(data.models || [])].sort(compareModels);
    const currentExternalModels = [...(data.externalModels || [])].sort(compareExternalModels);
    const failedModelIds = new Set(
      currentModels
        .filter((model) => model.connectivityStatus?.status === 'failed')
        .map((model) => model.id)
    );

    setAdminState({
      currentExternalModels,
      currentModels,
      currentProviders,
      failedModelIds,
    });

    populateProviderSelect(
      modelProviderSelect,
      modelProviderSelect?.value || currentProviders[0]?.id || ''
    );
    renderProviderTables();
    renderSubscriptionSettings();
  }

  async function loadUsers() {
    const data = await requestJson('/api/admin/users');
    const currentUsers = data.users || [];
    setAdminState({ currentUsers });
    renderManagedUsers(currentUsers);
  }

  async function loadStats() {
    const data = await requestJson('/api/admin/stats');
    setAdminState({ currentStats: data });

    renderRechargeRequests(data.rechargeOrders || []);
    renderUserStats(data.userModelUsage || data.users || []);
    renderTodayUserStats(data.todayUserModelUsage || []);
    renderRecentRequests(data.recentRequests || []);
    renderManagedUsers(getAdminState().currentUsers);
  }

  async function loadSubscription() {
    const data = await requestJson('/api/admin/subscription');
    const currentStats = getAdminState().currentStats || {};

    setAdminState({
      currentSubscription: data || {},
      currentStats: {
        ...currentStats,
        subscription: data || {},
      },
    });

    renderSubscriptionSettings();
    renderSubscriptionPlans(data.plans || []);
    renderSubscriptionOrders(data.orders || []);
    renderSubscriberUsage(data.subscribers || []);
  }

  async function loadRecentRequests() {
    const data = await requestJson('/api/admin/recent-requests');
    const currentStats = getAdminState().currentStats || {};
    const recentRequests = data.recentRequests || [];

    setAdminState({
      currentStats: {
        ...currentStats,
        recentRequests,
      },
    });

    renderRecentRequests(recentRequests);
  }

  async function loadRateLimitSettings() {
    const data = await requestJson('/api/admin/rate-limit-settings');
    renderRateLimitSettings(data || {});
  }

  async function ensureAdminSession() {
    const data = await requestJson('/api/admin/me');
    if (adminIdentity) {
      adminIdentity.textContent = `\u5f53\u524d\u767b\u5f55\uff1a${data.username}`;
    }
  }

  async function refreshAdminData() {
    await Promise.all([loadProviders(), loadUsers(), loadStats(), loadSubscription(), loadRateLimitSettings()]);
  }

  return {
    ensureAdminSession,
    loadProviders,
    loadRecentRequests,
    loadRateLimitSettings,
    loadSubscription,
    loadStats,
    loadUsers,
    refreshAdminData,
  };
}
