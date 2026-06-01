function getExternalModelLabel(item = {}) {
  return item.externalModelName || item.name || '-';
}

export function createUserRenderingModule({
  elements,
  helpers,
}) {
  const {
    alipayQrImage,
    apiKeysBody,
    availableModelsBody,
    createRechargeButton,
    createSubscriptionButton,
    rechargeMeta,
    rechargeOrdersBody,
    subscriptionFallbackPreferences,
    subscriptionLimitSummary,
    subscriptionMeta,
    subscriptionOrdersBody,
    subscriptionPaymentMeta,
    subscriptionPlansList,
    subscriptionQrImage,
    subscriptionSummary,
    updateRechargeAmountHint,
    userRecentRequestsBody,
    userStatsSummary,
  } = elements;
  const {
    applyTableSort,
    escapeHtml,
    formatDateTime,
    formatMoney,
    formatMultiplierCell,
    formatNumber,
    formatPriceWithMultiplier,
    getRechargeStatusBadge,
    getStatusBadge,
    renderTableActionButton,
  } = helpers;

  function formatSubscriptionBalance(item = {}) {
    if (item.quotaConsumptionEnabled === false || item.quotaConsumptionPaused) {
      return `当前优惠期，不消耗今日额度（已用 ${Number(item.requestsToday || 0)}）`;
    }

    if (item.unlimited || Number(item.dailyRequestLimit || 0) === 0) {
      return `今日已用 ${Number(item.requestsToday || 0)} / 不限`;
    }

    return `今日剩余 ${Number(item.remainingToday || 0)} / ${Number(item.dailyRequestLimit || 0)} · ${item.allowBalanceFallback === false ? '用完后暂停' : '用完后走余额'}`;
  }

  function formatPlanLimit(item = {}) {
    if (Number(item.dailyRequestLimit || 0) === 0) {
      return `${getExternalModelLabel(item)}：不限`;
    }

    return `${getExternalModelLabel(item)}：${Number(item.dailyRequestLimit || 0)} 次/天`;
  }

  function renderBillingSummary(billing = {}) {
    if (!userStatsSummary) {
      return;
    }

    const currency = billing.currency || 'USD';
    const items = [
      {
        key: 'spent',
        label: '累计费用',
        value: formatMoney(billing.totalSpentUsd, currency),
        hint: '历史调用已结算支出',
        currency,
      },
      {
        key: 'balance',
        label: '当前余额',
        value: formatMoney(billing.balanceUsd, currency),
        hint: '可用于后续模型调用',
        currency,
      },
    ];

    userStatsSummary.innerHTML = items
      .map((item) => `
      <div class="stat-card user-billing-stat user-billing-stat--${escapeHtml(item.key)}">
        <div class="user-billing-stat-head">
          <div class="stat-label user-billing-stat-label">${escapeHtml(item.label)}</div>
          <span class="user-billing-stat-tag">${escapeHtml(item.currency)}</span>
        </div>
        <div class="stat-value user-billing-stat-value">${escapeHtml(item.value)}</div>
        <div class="user-billing-stat-hint">${escapeHtml(item.hint)}</div>
      </div>
    `)
      .join('');

    const minimumRechargeCny = Number(billing.minimumRechargeCny || 10);

    if (rechargeMeta) {
      if (billing.rechargeEnabled) {
        rechargeMeta.textContent = `最低充值金额 ${formatMoney(minimumRechargeCny, 'CNY')}。固定汇率：${formatMoney(billing.cnyPerUsd, 'CNY')} = 1 USD。该收款仅用于余额充值，不用于订阅开通。`;
      } else {
        rechargeMeta.textContent = '当前暂不支持充值，请先完善支付配置。';
      }
    }

    if (createRechargeButton) {
      createRechargeButton.disabled = !billing.rechargeEnabled;
    }

    if (alipayQrImage) {
      alipayQrImage.src = billing.qrImagePath || '/assets/images/alipay-receive-qr.jpg';
    }

    if (subscriptionQrImage) {
      subscriptionQrImage.src = billing.qrImagePath || '/assets/images/alipay-receive-qr.jpg';
    }

    updateRechargeAmountHint();
  }

  function renderRechargeOrders(orders = []) {
    if (!rechargeOrdersBody) {
      return;
    }

    if (!orders.length) {
      rechargeOrdersBody.innerHTML = '<tr><td colspan="7" class="table-note">暂无充值申请。</td></tr>';
      return;
    }

    rechargeOrdersBody.innerHTML = applyTableSort(orders, 'rechargeOrdersBody')
      .map((order) => `
      <tr>
        <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
        <td>${getRechargeStatusBadge(order.status)}</td>
        <td>${escapeHtml(formatMoney(order.amountCny, 'CNY'))}</td>
        <td>${escapeHtml(formatMoney(order.amountUsd, 'USD'))}</td>
        <td>${escapeHtml(order.customerNote || '-')}</td>
        <td>${escapeHtml(formatDateTime(order.paidAt))}</td>
        <td>${escapeHtml(order.reviewedBy || '-')}</td>
      </tr>
    `)
      .join('');
  }

  function renderSubscriptionPlanCards(subscriptionData = {}) {
    if (!subscriptionPlansList) {
      return;
    }

    const plans = Array.isArray(subscriptionData.plans) ? subscriptionData.plans : [];
    const currentPlan = subscriptionData.currentPlan || null;
    const currentPlanId = currentPlan?.id || subscriptionData.subscription?.planId || '';

    if (!plans.length) {
      subscriptionPlansList.innerHTML = '<div class="empty-state">当前没有可购买的订阅方案。</div>';
      return;
    }

    const rows = plans
      .map((plan, index) => {
        const limits = Array.isArray(plan.modelLimits) ? plan.modelLimits : [];
        const limitHtml = limits.length
          ? limits.map((limit) => `<span class="chip">${escapeHtml(formatPlanLimit(limit))}</span>`).join('')
          : '<span class="chip">未配置额度模型</span>';
        const checked = (plan.id === currentPlanId) || (!currentPlanId && index === 0);
        const inputId = `subscription-plan-choice-${String(plan.id || index).replace(/[^A-Za-z0-9_-]/g, '-')}`;
        const isCurrent = plan.id === currentPlanId;

        return `
          <tr class="${isCurrent ? 'is-current' : ''}">
            <td class="subscription-plan-choice-cell">
              <input
                id="${escapeHtml(inputId)}"
                type="radio"
                name="subscriptionPlanChoice"
                value="${escapeHtml(plan.id || '')}"
                aria-label="选择订阅方案 ${escapeHtml(plan.name || '')}"
                ${checked ? 'checked' : ''}
              />
            </td>
            <td>
              <label class="subscription-plan-cell-label" for="${escapeHtml(inputId)}">
                <span class="subscription-plan-name">${escapeHtml(plan.name || '-')}</span>
                <span class="subscription-plan-desc">${escapeHtml(plan.description || '未填写方案说明')}</span>
              </label>
            </td>
            <td class="subscription-plan-price">${escapeHtml(formatMoney(plan.monthlyPriceCny || 0, 'CNY'))}</td>
            <td><div class="chip-row subscription-plan-limits">${limitHtml}</div></td>
            <td>
              <div class="chip-row subscription-plan-status">
                <span class="chip">${escapeHtml(String(plan.sortOrder || 0))} 号排序</span>
                ${isCurrent ? '<span class="chip">当前生效方案</span>' : '<span class="chip">可立即申请</span>'}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    subscriptionPlansList.innerHTML = `
      <div class="table-shell subscription-plan-table-shell">
        <div class="table-scroll">
          <table class="table-middle subscription-plan-table">
            <thead>
              <tr>
                <th class="subscription-plan-choice-column">选择</th>
                <th>方案</th>
                <th>价格</th>
                <th>模型额度</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSubscriptionOverview(subscriptionData = {}) {
    if (!subscriptionSummary) {
      return;
    }

    const settings = subscriptionData.settings || {};
    const subscription = subscriptionData.subscription || {};
    const currentPlan = subscriptionData.currentPlan || null;
    const limits = Array.isArray(currentPlan?.modelLimits) ? currentPlan.modelLimits : [];
    const unlimitedCount = limits.filter((item) => item.unlimited || Number(item.dailyRequestLimit || 0) === 0).length;

    const items = [
      {
        key: 'subscription-status',
        label: '订阅状态',
        value: subscription.active ? '订阅中' : '未订阅',
        hint: subscription.active
          ? `有效期至 ${formatDateTime(subscription.expiresAt)}`
          : '管理员确认后自动生效',
        currency: 'STATUS',
      },
      {
        key: 'subscription-plan',
        label: '当前方案',
        value: currentPlan?.name || subscription.planName || '未开通',
        hint: currentPlan?.description || '选择方案后转账，再提交订阅申请。',
        currency: 'PLAN',
      },
      {
        key: 'subscription-limits',
        label: '额度概览',
        value: limits.length
          ? `${formatNumber(limits.length)} 个模型`
          : '暂无额度',
        hint: limits.length
          ? `${unlimitedCount ? `${formatNumber(unlimitedCount)} 个不限量，` : ''}额度按模型分别统计，请以下方明细为准`
          : '当前没有生效中的订阅方案额度',
        currency: 'MODELS',
      },
    ];

    subscriptionSummary.innerHTML = items
      .map((item) => `
      <div class="stat-card user-billing-stat user-billing-stat--${escapeHtml(item.key)}">
        <div class="user-billing-stat-head">
          <div class="stat-label user-billing-stat-label">${escapeHtml(item.label)}</div>
          <span class="user-billing-stat-tag">${escapeHtml(item.currency)}</span>
        </div>
        <div class="stat-value user-billing-stat-value">${escapeHtml(item.value)}</div>
        <div class="user-billing-stat-hint">${escapeHtml(item.hint)}</div>
      </div>
    `)
      .join('');

    if (subscriptionMeta) {
      if (settings.enabled && settings.quotaConsumptionEnabled === false) {
        subscriptionMeta.textContent = '当前为订阅优惠期，订阅模型可正常使用，今日额度不会继续消耗。';
      } else {
        subscriptionMeta.textContent = settings.enabled
          ? '订阅覆盖的模型会优先消耗当日订阅额度。你可以按模型单独设置：额度用完后继续按余额计费，或暂停到明天额度重置。'
          : '当前订阅入口已关闭，如需开通请联系管理员。';
      }

      if (subscription.active && subscription.expiresAt) {
        subscriptionMeta.textContent += ` 当前订阅到期时间：${formatDateTime(subscription.expiresAt)}。`;
      }
    }

    if (subscriptionPaymentMeta) {
      subscriptionPaymentMeta.textContent = settings.enabled
        ? '订阅转账与普通余额充值分开处理。订阅款项仅用于开通或续期订阅，不会自动转入余额。'
        : '当前订阅入口已关闭，暂不支持新的订阅转账申请。';
    }

    if (createSubscriptionButton) {
      const hasPlans = Array.isArray(subscriptionData.plans) && subscriptionData.plans.length > 0;
      createSubscriptionButton.disabled = !settings.enabled || !hasPlans;
    }

    if (subscriptionLimitSummary) {
      subscriptionLimitSummary.innerHTML = limits.length
        ? limits.map((item) => `
          <span class="chip">${escapeHtml(getExternalModelLabel(item))}：${escapeHtml(formatSubscriptionBalance(item))}</span>
        `).join('')
        : '<span class="chip">当前没有生效中的订阅额度</span>';
    }

    if (subscriptionFallbackPreferences) {
      const configurableLimits = limits.filter((item) => !item.unlimited && Number(item.dailyRequestLimit || 0) > 0);

      if (!currentPlan || !limits.length) {
        subscriptionFallbackPreferences.innerHTML = '<div class="field-note">开通订阅并生效后，才能按模型设置“额度用完后是否走余额”。</div>';
      } else if (!configurableLimits.length) {
        subscriptionFallbackPreferences.innerHTML = '<div class="field-note">当前方案中的订阅模型都是不限量，无需设置余额续用。</div>';
      } else {
        subscriptionFallbackPreferences.innerHTML = `
          <div class="subscription-fallback-head">
            <h4>额度用完后的处理方式</h4>
            <p>下面的开关按模型单独生效。开启后，订阅额度用完会继续按 token 从余额扣费；关闭后，该模型会暂停到明天额度重置。</p>
          </div>
          ${configurableLimits.map((item) => `
            <label class="subscription-fallback-item">
              <div class="subscription-fallback-copy">
                <strong>${escapeHtml(getExternalModelLabel(item))}</strong>
                <div class="field-note">${escapeHtml(`今日已用 ${Number(item.requestsToday || 0)} / ${Number(item.dailyRequestLimit || 0)}，当前剩余 ${Number(item.remainingToday || 0)}`)}</div>
                <div class="field-note">${escapeHtml(item.allowBalanceFallback === false ? '已关闭余额续用：额度用完后将暂停使用。' : '已开启余额续用：额度用完后会继续按余额计费。')}</div>
              </div>
              <span class="subscription-fallback-toggle">
                <input
                  type="checkbox"
                  data-subscription-fallback-toggle="true"
                  data-external-model-name="${escapeHtml(item.externalModelName || '')}"
                  ${item.allowBalanceFallback === false ? '' : 'checked'}
                />
                <span>${item.allowBalanceFallback === false ? '用完后暂停' : '用完后走余额'}</span>
              </span>
            </label>
          `).join('')}
        `;
      }
    }

    renderSubscriptionPlanCards(subscriptionData);
  }

  function renderSubscriptionOrders(orders = []) {
    if (!subscriptionOrdersBody) {
      return;
    }

    if (!orders.length) {
      subscriptionOrdersBody.innerHTML = '<tr><td colspan="7" class="table-note">暂无订阅申请记录。</td></tr>';
      return;
    }

    subscriptionOrdersBody.innerHTML = applyTableSort(orders, 'subscriptionOrdersBody')
      .map((order) => {
        const note = order.planName
          ? `方案：${order.planName}${order.customerNote ? `；备注：${order.customerNote}` : ''}`
          : (order.customerNote || '-');

        return `
      <tr>
        <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
        <td>${getRechargeStatusBadge(order.status === 'approved' ? 'paid' : (order.status === 'rejected' ? 'failed' : order.status))}</td>
        <td>${escapeHtml(formatMoney(order.amountCny, 'CNY'))}</td>
        <td>${escapeHtml(note)}</td>
        <td>${escapeHtml(formatDateTime(order.approvedStartedAt))}</td>
        <td>${escapeHtml(formatDateTime(order.approvedExpiresAt))}</td>
        <td>${escapeHtml(order.reviewedBy || '-')}</td>
      </tr>
    `;
      })
      .join('');
  }

  function renderApiKeys(apiKeys = []) {
    if (!apiKeysBody) {
      return;
    }

    if (!apiKeys.length) {
      apiKeysBody.innerHTML = '<tr><td colspan="5" class="table-note">暂无 API 密钥。</td></tr>';
      return;
    }

    apiKeysBody.innerHTML = applyTableSort(apiKeys, 'apiKeysBody')
      .map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td><code>${escapeHtml(item.key || '-')}</code></td>
        <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
        <td>${escapeHtml(formatDateTime(item.lastUsedAt))}</td>
        <td class="action-cell">
          <div class="table-actions">
            ${renderTableActionButton({
              action: 'copy-api-key',
              label: `复制 API 密钥 ${item.name}`,
              icon: 'copy',
              tone: 'is-success',
              attrs: { keyValue: item.key || '' },
            })}
            ${renderTableActionButton({
              action: 'delete-api-key',
              label: `删除 API 密钥 ${item.name}`,
              icon: 'delete',
              tone: 'is-danger',
              attrs: { keyId: item.id },
            })}
          </div>
        </td>
      </tr>
    `)
      .join('');
  }

  function renderAvailableModels(models = []) {
    if (!availableModelsBody) {
      return;
    }

    const sorted = applyTableSort(models, 'availableModelsBody');
    availableModelsBody.innerHTML = sorted.length
      ? sorted.map((model) => {
        const pricing = model.pricing || {};
        return `
        <tr>
          <td>
            <code>${escapeHtml(model.name)}</code>
          </td>
          <td>${escapeHtml(pricing.currency || 'USD')}</td>
          <td>${formatPriceWithMultiplier(pricing, 'inputPerMillionTokens', 'inputPer1kTokens')}</td>
          <td>${formatPriceWithMultiplier(pricing, 'outputPerMillionTokens', 'outputPer1kTokens')}</td>
          <td>${formatPriceWithMultiplier(pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens')}</td>
          <td>${formatPriceWithMultiplier(pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens')}</td>
          <td>${formatMultiplierCell(pricing)}</td>
        </tr>
      `;
      }).join('')
      : '<tr><td colspan="8" class="table-note">当前暂无可用模型。</td></tr>';
  }

  function renderRecentRequests(items = []) {
    if (!userRecentRequestsBody) {
      return;
    }

    if (!items.length) {
      userRecentRequestsBody.innerHTML = '<tr><td colspan="9" class="table-note">暂无最近请求。</td></tr>';
      return;
    }

    userRecentRequestsBody.innerHTML = applyTableSort(items, 'userRecentRequestsBody')
      .map((item) => `
      <tr>
        <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
        <td>${escapeHtml(item.modelName || item.modelId)}</td>
        <td>${getStatusBadge(item.success ? '成功' : '失败', item.success ? 'success' : 'danger')}</td>
        <td>${formatNumber(item.inputTokens)}</td>
        <td>${formatNumber(item.outputTokens)}</td>
        <td>${formatNumber(item.cacheReadTokens)}</td>
        <td>${formatNumber(item.cacheCreationTokens)}</td>
        <td>${formatMoney(item.totalCost, item.currency || 'USD')}</td>
        <td>${formatNumber(item.latencyMs)} ms</td>
      </tr>
    `)
      .join('');
  }

  return {
    renderApiKeys,
    renderAvailableModels,
    renderBillingSummary,
    renderRecentRequests,
    renderRechargeOrders,
    renderSubscriptionOrders,
    renderSubscriptionOverview,
  };
}
