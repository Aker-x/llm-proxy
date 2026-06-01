export function createUserActions({
  elements,
  helpers,
}) {
  const {
    apiKeyForm,
    apiKeysBody,
    copyNewApiKeyButton,
    createApiKeyButton,
    createRechargeButton,
    createSubscriptionButton,
    logoutButton,
    passwordForm,
    rechargeAmountInput,
    rechargeForm,
    subscriptionForm,
    subscriptionFallbackPreferences,
    subscriptionPlansList,
    refreshUserStatsButton,
    updatePasswordButton,
  } = elements;
  const {
    copyTextToClipboard,
    formatMoney,
    loadApiKeys,
    loadBilling,
    loadSubscription,
    refreshAllData,
    requestJson,
    setBusy,
    showUserMessage,
    state,
    updateRechargeAmountHint,
  } = helpers;

  function getUserState() {
    return state.get();
  }

  function getSelectedSubscriptionPlanId() {
    const selectedPlan = document.querySelector('input[name="subscriptionPlanChoice"]:checked');
    return String(selectedPlan?.value || '').trim();
  }

  function bindUserActions() {
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        try {
          setBusy(logoutButton, true, '退出中...');
          await requestJson('/api/logout', { method: 'POST' });
          window.location.href = '/';
        } catch (error) {
          showUserMessage(error.message, true);
          setBusy(logoutButton, false);
        }
      });
    }

    if (refreshUserStatsButton) {
      refreshUserStatsButton.addEventListener('click', async () => {
        try {
          setBusy(refreshUserStatsButton, true, '刷新中...');
          await refreshAllData();
          showUserMessage('用户数据已刷新。');
        } catch (error) {
          showUserMessage(error.message, true);
        } finally {
          setBusy(refreshUserStatsButton, false);
        }
      });
    }

    if (rechargeForm) {
      rechargeForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const { billing = {}, refs } = getUserState();
        const cnyPerUsd = Number(billing.cnyPerUsd || 0);
        const minimumRechargeCny = Number(billing.minimumRechargeCny || 10);
        const amountCny = Number(refs.rechargeAmountInput?.value || 0);

        if (!Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) {
          showUserMessage('当前汇率不可用，请稍后再试。', true);
          return;
        }

        if (!Number.isFinite(amountCny) || !Number.isFinite(minimumRechargeCny) || amountCny < minimumRechargeCny) {
          showUserMessage(`最低充值金额为 ${formatMoney(minimumRechargeCny, 'CNY')}。`, true);
          return;
        }

        const amountUsd = Number((amountCny / cnyPerUsd).toFixed(6));

        try {
          setBusy(createRechargeButton, true, '提交中...');
          const data = await requestJson('/api/user/recharge-orders', {
            method: 'POST',
            body: JSON.stringify({
              amountUsd,
              customerNote: refs.rechargeNoteInput?.value.trim() || '',
            }),
          });

          await loadBilling();

          if (refs.rechargeAmountInput) {
            refs.rechargeAmountInput.value = '';
            updateRechargeAmountHint();
          }
          if (refs.rechargeNoteInput) {
            refs.rechargeNoteInput.value = '';
          }

          showUserMessage(`充值申请已提交。请转账 ${formatMoney(data.order.amountCny, 'CNY')} 后等待管理员审核。`);
        } catch (error) {
          showUserMessage(error.message, true);
        } finally {
          setBusy(createRechargeButton, false);
        }
      });
    }

    if (subscriptionPlansList) {
      subscriptionPlansList.addEventListener('click', (event) => {
        const row = event.target.closest('.subscription-plan-table tbody tr');
        const input = row?.querySelector('input[name="subscriptionPlanChoice"]');
        if (input && !input.disabled) {
          input.checked = true;
        }
      });
    }

    if (subscriptionForm) {
      subscriptionForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const { refs } = getUserState();
        const planId = getSelectedSubscriptionPlanId();
        if (!planId) {
          showUserMessage('请先选择一个订阅方案。', true);
          return;
        }

        try {
          setBusy(createSubscriptionButton, true, '提交中...');
          const data = await requestJson('/api/user/subscription-orders', {
            method: 'POST',
            body: JSON.stringify({
              planId,
              customerNote: refs.subscriptionNoteInput?.value.trim() || '',
            }),
          });

          await loadSubscription();

          if (refs.subscriptionNoteInput) {
            refs.subscriptionNoteInput.value = '';
          }

          showUserMessage(`订阅申请已提交。请转账 ${formatMoney(data.order.amountCny, 'CNY')} 后等待管理员确认。`);
        } catch (error) {
          showUserMessage(error.message, true);
        } finally {
          setBusy(createSubscriptionButton, false);
        }
      });
    }

    if (subscriptionFallbackPreferences) {
      subscriptionFallbackPreferences.addEventListener('change', async (event) => {
        const toggle = event.target.closest('input[data-subscription-fallback-toggle="true"]');
        if (!toggle) {
          return;
        }

        const externalModelName = String(toggle.dataset.externalModelName || '').trim();
        if (!externalModelName) {
          return;
        }

        const previousChecked = !toggle.checked;
        const allowBalanceFallback = toggle.checked;

        try {
          toggle.disabled = true;
          await requestJson('/api/user/subscription-model-preferences', {
            method: 'PUT',
            body: JSON.stringify({
              externalModelName,
              allowBalanceFallback,
            }),
          });
          await loadSubscription();
          showUserMessage(
            allowBalanceFallback
              ? `已开启 ${externalModelName} 的余额续用，订阅额度用完后会继续按余额计费。`
              : `已关闭 ${externalModelName} 的余额续用，订阅额度用完后将暂停使用并等待次日重置。`
          );
        } catch (error) {
          toggle.checked = previousChecked;
          showUserMessage(error.message, true);
        } finally {
          toggle.disabled = false;
        }
      });
    }

    if (rechargeAmountInput) {
      rechargeAmountInput.addEventListener('input', updateRechargeAmountHint);
    }

    if (passwordForm) {
      passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const { refs } = getUserState();
        const currentPassword = refs.currentPasswordInput?.value || '';
        const password = refs.newPasswordInput?.value || '';
        const confirmPassword = refs.confirmNewPasswordInput?.value || '';

        if (!currentPassword) {
          showUserMessage('请输入当前密码。', true);
          return;
        }

        if (password.length < 6) {
          showUserMessage('新密码至少需要 6 位。', true);
          return;
        }

        if (password !== confirmPassword) {
          showUserMessage('两次输入的新密码不一致。', true);
          return;
        }

        try {
          setBusy(updatePasswordButton, true, '提交中...');
          await requestJson('/api/user/password', {
            method: 'PUT',
            body: JSON.stringify({
              currentPassword,
              password,
            }),
          });

          if (refs.currentPasswordInput) {
            refs.currentPasswordInput.value = '';
          }
          if (refs.newPasswordInput) {
            refs.newPasswordInput.value = '';
          }
          if (refs.confirmNewPasswordInput) {
            refs.confirmNewPasswordInput.value = '';
          }

          showUserMessage('密码已修改，正在返回登录页。');
          window.setTimeout(() => {
            window.location.href = '/';
          }, 1200);
        } catch (error) {
          showUserMessage(error.message, true);
          setBusy(updatePasswordButton, false);
        }
      });
    }

    if (apiKeyForm) {
      apiKeyForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const { refs } = getUserState();

        try {
          setBusy(createApiKeyButton, true, '创建中...');
          const data = await requestJson('/api/user/api-keys', {
            method: 'POST',
            body: JSON.stringify({
              name: refs.apiKeyNameInput?.value.trim() || '',
            }),
          });

          if (refs.newApiKeyPanel && refs.newApiKeyValue) {
            refs.newApiKeyPanel.hidden = false;
            refs.newApiKeyValue.textContent = data.secret || '';
            refs.newApiKeyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }

          if (refs.apiKeyNameInput) {
            refs.apiKeyNameInput.value = '';
          }

          await loadApiKeys();
          showUserMessage('API 密钥已创建，请立即复制保存。');
        } catch (error) {
          showUserMessage(error.message, true);
        } finally {
          setBusy(createApiKeyButton, false);
        }
      });
    }

    if (copyNewApiKeyButton) {
      copyNewApiKeyButton.addEventListener('click', async () => {
        const secret = getUserState().refs.newApiKeyValue?.textContent || '';
        if (!secret) {
          return;
        }

        try {
          await copyTextToClipboard(secret);
          showUserMessage('API 密钥已复制。');
        } catch {
          showUserMessage('复制失败，请手动复制密钥。', true);
        }
      });
    }

    if (apiKeysBody) {
      apiKeysBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
          return;
        }

        if (button.dataset.action === 'copy-api-key') {
          const keyValue = String(button.dataset.keyValue || '').trim();
          if (!keyValue) {
            showUserMessage('当前没有可复制的 API 密钥。', true);
            return;
          }

          try {
            await copyTextToClipboard(keyValue);
            showUserMessage('API 密钥已复制。');
          } catch {
            showUserMessage('复制失败，请手动复制密钥。', true);
          }
          return;
        }

        if (button.dataset.action === 'delete-api-key') {
          const keyId = String(button.dataset.keyId || '').trim();
          if (!keyId) {
            return;
          }

          if (!window.confirm('确定要删除这条 API 密钥吗？删除后将立即失效。')) {
            return;
          }

          try {
            setBusy(button, true, '删除中...');
            await requestJson(`/api/user/api-keys/${encodeURIComponent(keyId)}`, {
              method: 'DELETE',
            });
            await loadApiKeys();
            showUserMessage('API 密钥已删除。');
          } catch (error) {
            showUserMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }
  }

  return {
    bindUserActions,
  };
}
