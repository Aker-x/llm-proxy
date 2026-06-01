export function createUsersStatsModule({
  adminRecentRequestsBody,
  adminUsersBody,
  applyTableSort,
  escapeHtml,
  formatDateTime,
  formatMoney,
  formatNumber,
  getStatusBadge,
  rechargeRequestsBody,
  renderTableActionButton,
  todayUsersStatsBody,
  usersStatsBody,
}) {
  function getRoleBadge(role) {
    return getStatusBadge(role === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237', role === 'admin' ? 'warning' : 'muted');
  }

  function renderUpstreamRateLimitCell(item = {}) {
    if (item.role !== 'user') {
      return '<span class="muted">-</span>';
    }

    if (item.upstreamRateLimitEnabled !== true) {
      return '<div class="rate-limit-cell"><span class="muted">\u672a\u5f00\u542f</span></div>';
    }

    const intervalSeconds = Number(item.upstreamRateLimitIntervalSeconds || 60);
    const scheduledAt = item.upstreamRateLimitLastRequestAt
      ? new Date(item.upstreamRateLimitLastRequestAt).getTime()
      : 0;
    const scheduledLabel = Number.isFinite(scheduledAt) && scheduledAt > Date.now()
      ? '\u961f\u5217\u6392\u5230'
      : '\u6700\u8fd1\u653e\u884c';
    const lastRequestText = item.upstreamRateLimitLastRequestAt
      ? `${scheduledLabel}\uff1a${formatDateTime(item.upstreamRateLimitLastRequestAt)}`
      : '\u6682\u65e0\u4e0a\u6e38\u8bf7\u6c42';

    return `
      <div class="rate-limit-cell">
        ${getStatusBadge(`1 \u6b21 / ${formatNumber(intervalSeconds)} \u79d2`, 'warning')}
        <span class="rate-limit-note">${escapeHtml(lastRequestText)}</span>
      </div>
    `;
  }

  function getModelLabel(item = {}) {
    return item.modelName || item.modelId || '-';
  }

  function getModelUsageText(item = {}) {
    return `${getModelLabel(item)}\uff1a${formatNumber(item.requests || 0)} \u6b21 / ${formatMoney(item.totalCost || 0, item.currency || 'USD')}`;
  }

  function getModelUsageSummary(item = {}) {
    const models = Array.isArray(item.models) ? item.models : [];
    if (!models.length) {
      return '';
    }

    return models.map(getModelUsageText).join(' ');
  }

  function renderModelUsage(models = [], currency = 'USD') {
    if (!models.length) {
      return '<span class="muted">\u6682\u65e0\u7528\u91cf</span>';
    }

    return `
      <div class="model-usage-list">
        ${models.map((model) => `
          <div class="model-usage-item">
            <span class="model-usage-name">${escapeHtml(getModelLabel(model))}</span>
            <span class="model-usage-value">${formatNumber(model.requests || 0)} \u6b21 / ${formatMoney(model.totalCost || 0, model.currency || currency || 'USD')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function withModelUsageSortFields(items = []) {
    return items.map((item) => ({
      ...item,
      modelUsageSummary: getModelUsageSummary(item),
    }));
  }

  function renderUserUsageTable({
    body,
    emptyColspan,
    emptyMessage,
    includeActions = false,
    items = [],
    tableId,
  }) {
    if (!body) {
      return;
    }

    if (!items.length) {
      body.innerHTML = `<tr><td colspan="${emptyColspan}" class="table-note">${emptyMessage}</td></tr>`;
      return;
    }

    const sorted = applyTableSort(withModelUsageSortFields(items), tableId);
    body.innerHTML = sorted
      .map((item) => `
      <tr>
        <td>${escapeHtml(item.username)}</td>
        <td>${getRoleBadge(item.role)}</td>
        <td>${renderModelUsage(item.models || [], item.currency || 'USD')}</td>
        <td>${formatNumber(item.requests)}</td>
        <td>${formatNumber(item.successRequests)}</td>
        <td>${formatNumber(item.failedRequests)}</td>
        <td>${formatMoney(item.totalCost, item.currency || 'USD')}</td>
        <td>${escapeHtml(formatDateTime(item.lastUsedAt))}</td>
        ${includeActions ? `<td class="action-cell">
          <div class="table-actions">
            ${renderTableActionButton({
              action: 'reset-user-cost',
              label: `\u91cd\u7f6e ${item.username} \u7684\u7528\u91cf\u7edf\u8ba1`,
              icon: 'reset',
              tone: 'is-danger',
              attrs: { username: item.username },
            })}
          </div>
        </td>` : ''}
      </tr>
    `)
      .join('');
  }

  function renderUserStats(items) {
    renderUserUsageTable({
      body: usersStatsBody,
      emptyColspan: 9,
      emptyMessage: '\u6682\u65e0\u8d26\u53f7\u7edf\u8ba1\u6570\u636e\u3002',
      includeActions: true,
      items,
      tableId: 'usersStatsBody',
    });
  }

  function renderTodayUserStats(items) {
    renderUserUsageTable({
      body: todayUsersStatsBody,
      emptyColspan: 8,
      emptyMessage: '\u6682\u65e0\u4eca\u65e5\u8d26\u53f7\u7528\u91cf\u3002',
      items,
      tableId: 'todayUsersStatsBody',
    });
  }

  function renderRechargeRequests(items) {
    if (!rechargeRequestsBody) {
      return;
    }

    if (!items.length) {
      rechargeRequestsBody.innerHTML = '<tr><td colspan="8" class="table-note">\u6682\u65e0\u5145\u503c\u7533\u8bf7\u3002</td></tr>';
      return;
    }

    const sorted = applyTableSort(items, 'rechargeRequestsBody');
    rechargeRequestsBody.innerHTML = sorted
      .map((item) => `
      <tr>
        <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
        <td>${escapeHtml(item.username)}</td>
        <td>${getStatusBadge(
          item.status === 'paid' ? '\u5df2\u901a\u8fc7' : (item.status === 'failed' ? '\u5df2\u62d2\u7edd' : '\u5f85\u5ba1\u6838'),
          item.status === 'paid' ? 'success' : (item.status === 'failed' ? 'danger' : 'info')
        )}</td>
        <td>${formatMoney(item.amountUsd, 'USD')}</td>
        <td>${formatMoney(item.amountCny, 'CNY')}</td>
        <td>${escapeHtml(item.customerNote || '-')}</td>
        <td>${escapeHtml(item.reviewedBy || '-')}</td>
        <td class="action-cell">
          <div class="table-actions">
            ${item.status === 'pending' ? renderTableActionButton({
              action: 'approve-recharge',
              label: `\u901a\u8fc7 ${item.username} \u7684\u5145\u503c\u7533\u8bf7`,
              icon: 'approve',
              tone: 'is-success',
              attrs: { 'order-id': item.id },
            }) : ''}
            ${item.status === 'pending' ? renderTableActionButton({
              action: 'reject-recharge',
              label: `\u62d2\u7edd ${item.username} \u7684\u5145\u503c\u7533\u8bf7`,
              icon: 'reject',
              tone: 'is-danger',
              attrs: { 'order-id': item.id },
            }) : ''}
          </div>
        </td>
      </tr>
    `)
      .join('');
  }

  function renderManagedUsers(items, options = {}) {
    if (!adminUsersBody) {
      return;
    }

    if (!items.length) {
      const emptyMessage = options.isFiltered
        ? `\u6ca1\u6709\u627e\u5230\u5339\u914d\u201c${escapeHtml(options.query || '')}\u201d\u7684\u8d26\u53f7\u3002`
        : '\u6682\u65e0\u8d26\u53f7\u3002';
      adminUsersBody.innerHTML = `<tr><td colspan="7" class="table-note">${emptyMessage}</td></tr>`;
      return;
    }

    const sorted = applyTableSort(items, 'adminUsersBody');
    adminUsersBody.innerHTML = sorted
      .map((item) => `
        <tr>
          <td>${escapeHtml(item.username)}</td>
          <td>${getStatusBadge(item.role === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237', item.role === 'admin' ? 'warning' : 'muted')}</td>
          <td>${item.role === 'user' ? formatNumber(item.apiKeyCount) : '-'}</td>
          <td>${item.role === 'user' ? formatMoney(item.totalRechargedUsd, 'USD') : '-'}</td>
          <td>${item.role === 'user' ? formatMoney(item.balanceUsd, 'USD') : '-'}</td>
          <td>${renderUpstreamRateLimitCell(item)}</td>
          <td class="action-cell">
            <div class="table-actions">
              ${item.role === 'user' ? renderTableActionButton({
                action: 'credit-user',
                label: `\u4fee\u6539 ${item.username} \u7684\u4f59\u989d`,
                icon: 'credit',
                attrs: { username: item.username },
              }) : ''}
              ${item.role === 'user' ? renderTableActionButton({
                action: 'rate-limit-user',
                label: `\u8bbe\u7f6e ${item.username} \u7684\u4e0a\u6e38\u9650\u901f`,
                icon: 'power',
                attrs: { username: item.username },
              }) : ''}
              ${renderTableActionButton({
                action: 'edit-user',
                label: `\u91cd\u7f6e ${item.username} \u7684\u5bc6\u7801`,
                icon: 'edit',
                attrs: { username: item.username },
              })}
              ${renderTableActionButton({
                action: 'delete-user',
                label: `\u5220\u9664 ${item.username}`,
                icon: 'delete',
                tone: 'is-danger',
                attrs: { username: item.username },
              })}
            </div>
          </td>
        </tr>
      `)
      .join('');
  }

  function renderRecentRequests(items) {
    if (!adminRecentRequestsBody) {
      return;
    }

    if (!items.length) {
      adminRecentRequestsBody.innerHTML = '<tr><td colspan="7" class="table-note">\u6682\u65e0\u6700\u8fd1\u8bf7\u6c42\u3002</td></tr>';
      return;
    }

    const sorted = applyTableSort(items, 'adminRecentRequestsBody').slice(0, 12);
    adminRecentRequestsBody.innerHTML = sorted
      .map((item) => `
      <tr>
        <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
        <td>${escapeHtml(item.username || '-')}</td>
        <td>${escapeHtml(item.providerName || item.providerId)}</td>
        <td>${escapeHtml(item.modelName || item.modelId)}</td>
        <td>${getStatusBadge(item.success ? '\u6210\u529f' : '\u5931\u8d25', item.success ? 'success' : 'danger')}</td>
        <td>${formatMoney(item.totalCost, item.currency || 'USD')}</td>
        <td>${formatNumber(item.latencyMs)} ms</td>
      </tr>
    `)
      .join('');
  }

  return {
    renderManagedUsers,
    renderRecentRequests,
    renderRechargeRequests,
    renderTodayUserStats,
    renderUserStats,
  };
}
