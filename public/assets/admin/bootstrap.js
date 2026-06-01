export function bootstrapAdminPage({
  elements,
  helpers,
}) {
  const {
    adminIdentity,
    adminRecentRequestsBody,
    adminUsersBody,
    externalModelsBody,
    modelsBody,
    providersBody,
    rechargeRequestsBody,
    subscriberUsageBody,
    subscriptionOrdersBody,
    todayUsersStatsBody,
    usersStatsBody,
  } = elements;
  const {
    ensureAdminSession,
    initTableSort,
    refreshAdminData,
    renderManagedUsers,
    renderProviderTables,
    renderRecentRequests,
    renderRechargeRequests,
    renderSubscriberUsage,
    renderTodayUserStats,
    renderSubscriptionOrders,
    renderSubscriptionSettings,
    renderUserStats,
    resets,
    state,
    syncAdminNavWithScroll,
  } = helpers;

  if (!adminIdentity) {
    return;
  }

  Promise.all([ensureAdminSession(), refreshAdminData()])
    .then(() => {
      resets.resetUserForm();
      resets.resetProviderForm();
      resets.resetModelForm();
      resets.resetExternalModelForm();
      syncAdminNavWithScroll();
      initTableSort('adminUsersBody', adminUsersBody, () => renderManagedUsers(state.get().currentUsers));
      initTableSort('rechargeRequestsBody', rechargeRequestsBody, () => renderRechargeRequests(state.get().currentStats?.rechargeOrders || []));
      initTableSort('subscriptionOrdersBody', subscriptionOrdersBody, () => renderSubscriptionOrders(state.get().currentSubscription?.orders || []));
      initTableSort('subscriberUsageBody', subscriberUsageBody, () => renderSubscriberUsage(state.get().currentSubscription?.subscribers || []));
      initTableSort('usersStatsBody', usersStatsBody, () => renderUserStats(state.get().currentStats?.userModelUsage || state.get().currentStats?.users || []));
      initTableSort('todayUsersStatsBody', todayUsersStatsBody, () => renderTodayUserStats(state.get().currentStats?.todayUserModelUsage || []));
      initTableSort('adminRecentRequestsBody', adminRecentRequestsBody, () => renderRecentRequests(state.get().currentStats?.recentRequests || []));
      initTableSort('providersBody', providersBody, () => renderProviderTables());
      initTableSort('modelsBody', modelsBody, () => renderProviderTables());
      initTableSort('externalModelsBody', externalModelsBody, () => renderProviderTables());
      renderSubscriptionSettings();
    })
    .catch(() => {
      window.location.href = '/';
    });
}
