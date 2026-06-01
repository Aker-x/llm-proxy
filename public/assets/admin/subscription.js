function getExternalModelLabel(item = {}) {
  return item.externalModelName || item.name || '-';
}

function formatLimitUsage(item = {}) {
  if (item.quotaConsumptionEnabled === false || item.quotaConsumptionPaused) {
    return '额度消耗已暂停';
  }

  const used = Number(item.requestsToday || 0);
  const limit = Number(item.dailyRequestLimit || 0);
  if (item.unlimited || limit === 0) {
    return `已用 ${used} / 不限`;
  }

  return `剩余 ${Number(item.remainingToday || 0)} / ${limit}，已用 ${used}`;
}

function formatPlanLimit(item = {}) {
  const limit = Number(item.dailyRequestLimit || 0);
  if (limit === 0) {
    return `${getExternalModelLabel(item)}：不限`;
  }

  return `${getExternalModelLabel(item)}：${limit} 次/天`;
}

export function createSubscriptionModule({
  elements,
  helpers,
}) {
  const {
    subscriberUsageBody,
    subscriptionEnabled,
    subscriptionQuotaConsumptionEnabled,
    subscriptionMonthlyPriceCny,
    subscriptionOrdersBody,
    subscriptionPlanCancelEditButton,
    subscriptionPlanDescription,
    subscriptionPlanEditId,
    subscriptionPlanEnabled,
    subscriptionPlanForm,
    subscriptionPlanFormHint,
    subscriptionPlanFormTitle,
    subscriptionPlanLimitsBody,
    subscriptionPlanMonthlyPriceCny,
    subscriptionPlanName,
    subscriptionPlanSortOrder,
    subscriptionPlansBody,
    subscriptionSettingsForm,
  } = elements;
  const {
    applyTableSort,
    escapeHtml,
    formatDateTime,
    formatMoney,
    getStatusBadge,
    refreshAdminData,
    renderTableActionButton,
    requestJson,
    setBusy,
    showMessage,
    state,
  } = helpers;

  function getSubscriptionState() {
    return state.get();
  }

  function getOverview() {
    return getSubscriptionState().currentSubscription || {};
  }

  function getPlans() {
    return Array.isArray(getOverview().plans) ? getOverview().plans : [];
  }

  function getPlanById(planId) {
    return getPlans().find((item) => item.id === planId) || null;
  }

  function readPlanPayload() {
    const limitInputs = Array.from(
      subscriptionPlanLimitsBody?.querySelectorAll('[data-plan-limit-input="true"]') || []
    );
    const modelLimits = limitInputs
      .map((input) => {
        const rawValue = String(input.value || '').trim();
        if (rawValue === '') {
          return null;
        }

        return {
          externalModelName: input.dataset.externalModelName || '',
          dailyRequestLimit: Number(rawValue),
        };
      })
      .filter((item) => item && Number.isFinite(item.dailyRequestLimit) && item.dailyRequestLimit >= 0);

    return {
      name: subscriptionPlanName?.value.trim() || '',
      description: subscriptionPlanDescription?.value.trim() || '',
      enabled: subscriptionPlanEnabled?.checked !== false,
      monthlyPriceCny: Number(subscriptionPlanMonthlyPriceCny?.value || 0),
      sortOrder: Number(subscriptionPlanSortOrder?.value || 0),
      modelLimits,
    };
  }

  function setPlanSubmitLabel(label) {
    const submitButton = subscriptionPlanForm?.querySelector('button[type="submit"]') || null;
    if (!submitButton) {
      return;
    }

    submitButton.textContent = label;
    if (Object.prototype.hasOwnProperty.call(submitButton.dataset, 'originalLabel')) {
      submitButton.dataset.originalLabel = label;
    }
  }

  function renderPlanLimitEditor(plan = null) {
    if (!subscriptionPlanLimitsBody) {
      return;
    }

    const { currentExternalModels = [] } = getSubscriptionState();
    if (!currentExternalModels.length) {
      subscriptionPlanLimitsBody.innerHTML = '<tr><td colspan="3" class="table-note">暂无可配置的外部模型。</td></tr>';
      return;
    }

    const limitByModelName = new Map(
      (plan?.modelLimits || []).map((item) => [item.externalModelName, item])
    );

    subscriptionPlanLimitsBody.innerHTML = currentExternalModels
      .map((model) => {
        const existingLimit = limitByModelName.get(model.name);
        const targetCount = Array.isArray(model.targets) ? model.targets.length : 0;
        return `
          <tr>
            <td>
              ${escapeHtml(getExternalModelLabel(model))}
              <div class="field-note"><code class="table-code">${escapeHtml(model.name || '')}</code></div>
            </td>
            <td>${escapeHtml(model.strategy || 'round_robin')} / ${escapeHtml(String(targetCount))} 个源模型</td>
            <td>
              <input
                type="number"
                min="0"
                step="1"
                value="${escapeHtml(existingLimit ? String(existingLimit.dailyRequestLimit) : '')}"
                placeholder="留空=不纳入，0=不限"
                data-plan-limit-input="true"
                data-external-model-name="${escapeHtml(model.name || '')}"
              />
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function resetPlanForm() {
    if (subscriptionPlanEditId) {
      subscriptionPlanEditId.value = '';
    }
    if (subscriptionPlanName) {
      subscriptionPlanName.value = '';
    }
    if (subscriptionPlanDescription) {
      subscriptionPlanDescription.value = '';
    }
    if (subscriptionPlanMonthlyPriceCny) {
      subscriptionPlanMonthlyPriceCny.value = '500';
    }
    if (subscriptionPlanSortOrder) {
      subscriptionPlanSortOrder.value = '0';
    }
    if (subscriptionPlanEnabled) {
      subscriptionPlanEnabled.checked = true;
    }
    if (subscriptionPlanFormTitle) {
      subscriptionPlanFormTitle.textContent = '创建订阅方案';
    }
    if (subscriptionPlanFormHint) {
      subscriptionPlanFormHint.textContent = '每个方案可组合多个外部模型的每日请求上限。留空表示该模型不纳入方案，填 0 表示不限量。';
    }
    if (subscriptionPlanCancelEditButton) {
      subscriptionPlanCancelEditButton.hidden = true;
    }
    setPlanSubmitLabel('创建订阅方案');

    renderPlanLimitEditor(null);
  }

  function editPlan(planId) {
    const plan = getPlanById(planId);
    if (!plan) {
      showMessage('订阅方案不存在。', true);
      return;
    }

    if (subscriptionPlanEditId) {
      subscriptionPlanEditId.value = plan.id || '';
    }
    if (subscriptionPlanName) {
      subscriptionPlanName.value = plan.name || '';
    }
    if (subscriptionPlanDescription) {
      subscriptionPlanDescription.value = plan.description || '';
    }
    if (subscriptionPlanMonthlyPriceCny) {
      subscriptionPlanMonthlyPriceCny.value = String(plan.monthlyPriceCny || 0);
    }
    if (subscriptionPlanSortOrder) {
      subscriptionPlanSortOrder.value = String(plan.sortOrder || 0);
    }
    if (subscriptionPlanEnabled) {
      subscriptionPlanEnabled.checked = plan.enabled !== false;
    }
    if (subscriptionPlanFormTitle) {
      subscriptionPlanFormTitle.textContent = `编辑订阅方案：${plan.name || ''}`;
    }
    if (subscriptionPlanFormHint) {
      subscriptionPlanFormHint.textContent = '修改后会影响新订单与用户端展示。已生效用户继续按其当前订阅状态和方案限额统计。';
    }
    if (subscriptionPlanCancelEditButton) {
      subscriptionPlanCancelEditButton.hidden = false;
    }
    setPlanSubmitLabel('保存订阅方案');

    renderPlanLimitEditor(plan);
    subscriptionPlanForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSubscriptionSettings() {
    const overview = getOverview();
    if (subscriptionEnabled) {
      subscriptionEnabled.checked = overview.settings?.enabled !== false;
    }
    if (subscriptionQuotaConsumptionEnabled) {
      subscriptionQuotaConsumptionEnabled.checked = overview.settings?.quotaConsumptionEnabled !== false;
    }
    if (subscriptionMonthlyPriceCny) {
      subscriptionMonthlyPriceCny.value = '500';
    }

    const editingPlanId = subscriptionPlanEditId?.value || '';
    if (editingPlanId) {
      const latestPlan = getPlanById(editingPlanId);
      if (latestPlan) {
        editPlan(editingPlanId);
        return;
      }
    }

    resetPlanForm();
  }

  function renderSubscriptionPlans(items = []) {
    if (!subscriptionPlansBody) {
      return;
    }

    if (!items.length) {
      subscriptionPlansBody.innerHTML = '<tr><td colspan="3" class="table-note">暂无订阅方案。</td></tr>';
      return;
    }

    subscriptionPlansBody.innerHTML = items
      .map((plan) => {
        const limits = Array.isArray(plan.modelLimits) ? plan.modelLimits : [];
        const limitHtml = limits.length
          ? limits.map((limit) => `<span class="chip">${escapeHtml(formatPlanLimit(limit))}</span>`).join('')
          : '<span class="chip">未配置额度模型</span>';

        return `
          <tr>
            <td>
              <strong>${escapeHtml(plan.name || '-')}</strong>
              <div class="field-note">${escapeHtml(plan.description || '未填写方案说明')}</div>
            </td>
            <td>
              <div>${escapeHtml(formatMoney(plan.monthlyPriceCny || 0, 'CNY'))}</div>
              <div class="field-note">排序：${escapeHtml(String(plan.sortOrder || 0))}</div>
              <div class="field-note">${escapeHtml(formatDateTime(plan.updatedAt))}</div>
            </td>
            <td>
              <div class="chip-row">${limitHtml}</div>
              <div class="chip-row" style="margin-top: 10px;">
                <span class="chip">${plan.enabled !== false ? '可售' : '已停用'}</span>
              </div>
              <div class="table-actions" style="margin-top: 12px;">
                ${renderTableActionButton({
                  action: 'edit-subscription-plan',
                  label: `编辑订阅方案 ${plan.name || ''}`,
                  icon: 'edit',
                  attrs: { planId: plan.id || '' },
                })}
                ${renderTableActionButton({
                  action: 'delete-subscription-plan',
                  label: `删除订阅方案 ${plan.name || ''}`,
                  icon: 'delete',
                  tone: 'is-danger',
                  attrs: { planId: plan.id || '' },
                })}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderSubscriptionOrders(items = []) {
    if (!subscriptionOrdersBody) {
      return;
    }

    if (!items.length) {
      subscriptionOrdersBody.innerHTML = '<tr><td colspan="8" class="table-note">暂无订阅申请。</td></tr>';
      return;
    }

    const sorted = applyTableSort(items, 'subscriptionOrdersBody');
    subscriptionOrdersBody.innerHTML = sorted
      .map((item) => {
        const note = item.planName
          ? `方案：${item.planName}${item.customerNote ? `；备注：${item.customerNote}` : ''}`
          : (item.customerNote || '-');

        return `
          <tr>
            <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
            <td>${escapeHtml(item.username)}</td>
            <td>${getStatusBadge(
              item.status === 'approved' ? '已通过' : (item.status === 'rejected' ? '已拒绝' : '待审核'),
              item.status === 'approved' ? 'success' : (item.status === 'rejected' ? 'danger' : 'info')
            )}</td>
            <td>${formatMoney(item.amountCny, 'CNY')}</td>
            <td>${escapeHtml(note)}</td>
            <td>${escapeHtml(formatDateTime(item.approvedExpiresAt))}</td>
            <td>${escapeHtml(item.reviewedBy || '-')}</td>
            <td class="action-cell">
              <div class="table-actions">
                ${item.status === 'pending' ? renderTableActionButton({
                  action: 'approve-subscription',
                  label: `通过 ${item.username} 的订阅申请`,
                  icon: 'approve',
                  tone: 'is-success',
                  attrs: { orderId: item.id || '' },
                }) : ''}
                ${item.status === 'pending' ? renderTableActionButton({
                  action: 'reject-subscription',
                  label: `拒绝 ${item.username} 的订阅申请`,
                  icon: 'reject',
                  tone: 'is-danger',
                  attrs: { orderId: item.id || '' },
                }) : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderSubscriberUsage(items = []) {
    if (!subscriberUsageBody) {
      return;
    }

    if (!items.length) {
      subscriberUsageBody.innerHTML = '<tr><td colspan="5" class="table-note">暂无生效中的订阅用户。</td></tr>';
      return;
    }

    const sorted = applyTableSort(items, 'subscriberUsageBody');
    subscriberUsageBody.innerHTML = sorted
      .map((item) => {
        const usageHtml = Array.isArray(item.usage) && item.usage.length
          ? item.usage
            .map((usageItem) => `
              <div class="subscription-usage-item">
                <span class="subscription-usage-name">${escapeHtml(getExternalModelLabel(usageItem))}</span>
                <span class="subscription-usage-value">${escapeHtml(formatLimitUsage(usageItem))}</span>
              </div>
            `)
            .join('')
          : '<span class="muted">当前方案未配置订阅额度</span>';

        return `
          <tr>
            <td>
              <strong>${escapeHtml(item.username)}</strong>
              <div class="field-note">方案：${escapeHtml(item.currentPlan?.name || item.planName || '-')}</div>
              <div class="field-note">${escapeHtml(item.currentPlan?.description || '')}</div>
            </td>
            <td>${getStatusBadge(item.active ? '订阅中' : '已失效', item.active ? 'success' : 'warning')}</td>
            <td>${escapeHtml(formatDateTime(item.startedAt))}</td>
            <td>${escapeHtml(formatDateTime(item.expiresAt))}</td>
            <td><div class="subscription-usage-list">${usageHtml}</div></td>
          </tr>
        `;
      })
      .join('');
  }

  async function submitSubscriptionSettings() {
    return requestJson('/api/admin/subscription/settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: subscriptionEnabled?.checked !== false,
        quotaConsumptionEnabled: subscriptionQuotaConsumptionEnabled?.checked !== false,
      }),
    });
  }

  async function submitSubscriptionPlan() {
    const planId = subscriptionPlanEditId?.value || '';
    const payload = readPlanPayload();
    const url = planId
      ? `/api/admin/subscription/plans/${encodeURIComponent(planId)}`
      : '/api/admin/subscription/plans';

    return requestJson(url, {
      method: planId ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
  }

  function bindSubscriptionActions() {
    if (subscriptionSettingsForm) {
      subscriptionSettingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = subscriptionSettingsForm.querySelector('button[type="submit"]');
        try {
          setBusy(submitButton, true, '保存中...');
          await submitSubscriptionSettings();
          await refreshAdminData();
          showMessage('订阅入口设置已更新。');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (subscriptionPlanForm) {
      subscriptionPlanForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = subscriptionPlanForm.querySelector('button[type="submit"]');
        try {
          setBusy(submitButton, true, '保存中...');
          await submitSubscriptionPlan();
          resetPlanForm();
          await refreshAdminData();
          showMessage('订阅方案已保存。');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (subscriptionPlanCancelEditButton) {
      subscriptionPlanCancelEditButton.addEventListener('click', () => {
        resetPlanForm();
      });
    }

    if (subscriptionPlansBody) {
      subscriptionPlansBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
          return;
        }

        const planId = button.dataset.planId || '';
        if (!planId) {
          return;
        }

        if (button.dataset.action === 'edit-subscription-plan') {
          editPlan(planId);
          return;
        }

        if (button.dataset.action === 'delete-subscription-plan') {
          if (!window.confirm('确定要删除这个订阅方案吗？')) {
            return;
          }

          try {
            setBusy(button, true, '删除中...');
            await requestJson(`/api/admin/subscription/plans/${encodeURIComponent(planId)}`, {
              method: 'DELETE',
            });
            await refreshAdminData();
            showMessage('订阅方案已删除。');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }

    if (subscriptionOrdersBody) {
      subscriptionOrdersBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
          return;
        }

        const orderId = button.dataset.orderId || '';
        if (!orderId) {
          return;
        }

        if (button.dataset.action === 'approve-subscription') {
          try {
            setBusy(button, true, '通过中...');
            await requestJson(`/api/admin/subscription-orders/${encodeURIComponent(orderId)}/approve`, {
              method: 'POST',
            });
            await refreshAdminData();
            showMessage('订阅申请已通过。');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'reject-subscription') {
          const reason = window.prompt('请输入拒绝原因', '未找到对应转账记录');
          if (reason === null) {
            return;
          }

          try {
            setBusy(button, true, '拒绝中...');
            await requestJson(`/api/admin/subscription-orders/${encodeURIComponent(orderId)}/reject`, {
              method: 'POST',
              body: JSON.stringify({ reason }),
            });
            await refreshAdminData();
            showMessage('订阅申请已拒绝。');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }
  }

  return {
    bindSubscriptionActions,
    renderSubscriberUsage,
    renderSubscriptionOrders,
    renderSubscriptionPlans,
    renderSubscriptionSettings,
  };
}
