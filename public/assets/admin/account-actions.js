export function createAccountActions({
  elements,
  helpers,
}) {
  const {
    adminUsersBody,
    rechargeRequestsBody,
    userForm,
    usersStatsBody,
  } = elements;
  const {
    formatMoney,
    loadStats,
    loadUsers,
    requestJson,
    setBusy,
    showMessage,
    state,
  } = helpers;

  function getAccountState() {
    return state.get();
  }

  async function refreshUserData() {
    await Promise.all([loadUsers(), loadStats()]);
  }

  function bindAccountActions() {
    if (userForm) {
      userForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = userForm.querySelector('button[type="submit"]');
        const { refs, resetUserForm } = getAccountState();
        const username = refs.managedUsername?.value.trim() || '';
        const role = refs.managedUserRole?.value || 'user';
        const password = refs.managedUserPassword?.value || '';

        try {
          setBusy(submitButton, true, '\u4fdd\u5b58\u4e2d...');

          if (refs.userEditUsername?.value) {
            await requestJson(`/api/admin/users/${encodeURIComponent(refs.userEditUsername.value)}/password`, {
              method: 'PUT',
              body: JSON.stringify({ password }),
            });
            showMessage(`${refs.userEditUsername.value} \u7684\u5bc6\u7801\u5df2\u91cd\u7f6e\u3002`);
          } else {
            await requestJson('/api/admin/users', {
              method: 'POST',
              body: JSON.stringify({ username, password, role }),
            });
            showMessage(`${role === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237'} ${username} \u5df2\u521b\u5efa\u3002`);
          }

          resetUserForm();
          await refreshUserData();
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (adminUsersBody) {
      adminUsersBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) {
          return;
        }

        const { currentUsers, editUser, refs, resetUserForm } = getAccountState();
        const user = currentUsers.find((item) => item.username === button.dataset.username);
        if (!user) {
          return;
        }

        if (button.dataset.action === 'edit-user') {
          editUser(user);
          return;
        }

        if (button.dataset.action === 'credit-user') {
          const balanceText = window.prompt(`\u8bf7\u8f93\u5165\u201c${user.username}\u201d\u7684\u65b0 USD \u4f59\u989d`, String(Number(user.balanceUsd || 0)));
          if (balanceText === null) {
            return;
          }

          const balanceUsd = Number(balanceText);
          if (!Number.isFinite(balanceUsd) || balanceUsd < 0) {
            showMessage('\u4f59\u989d\u5fc5\u987b\u5927\u4e8e\u6216\u7b49\u4e8e 0\u3002', true);
            return;
          }

          try {
            setBusy(button, true, '\u4fee\u6539\u4e2d...');
            const previousBalanceUsd = Number(user.balanceUsd || 0);
            await requestJson(`/api/admin/users/${encodeURIComponent(user.username)}/credit`, {
              method: 'POST',
              body: JSON.stringify({
                balanceUsd,
              }),
            });
            await refreshUserData();
            const deltaUsd = balanceUsd - previousBalanceUsd;
            const deltaLabel = deltaUsd === 0
              ? '\uff08\u672a\u53d8\u66f4\uff09'
              : `\uff08${deltaUsd > 0 ? '+' : ''}${formatMoney(deltaUsd, 'USD')}\uff09`;
            showMessage(`\u5df2\u5c06 ${user.username} \u7684\u4f59\u989d\u4fee\u6539\u4e3a ${formatMoney(balanceUsd, 'USD')} ${deltaLabel}\u3002`);
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'rate-limit-user') {
          const currentEnabled = user.upstreamRateLimitEnabled === true;
          const currentRequestsPerMinute = Number(user.upstreamRateLimitRequestsPerMinute || 60);
          const inputValue = window.prompt(
            `\u8bbe\u7f6e\u201c${user.username}\u201d\u7684\u4e0a\u6e38\u9650\u901f\u3002\u586b 0 \u6216\u7559\u7a7a\u8868\u793a\u53d6\u6d88\u4e2a\u4eba\u8986\u76d6\uff0c\u56de\u5230\u5168\u5c40\u9ed8\u8ba4\uff1b\u586b\u6b63\u6574\u6570\u8868\u793a\u6bcf\u5206\u949f\u6700\u591a\u53d1\u8d77 N \u6b21\u8bf7\u6c42\uff0c\u8d85\u51fa\u540e\u4f1a\u6392\u961f\u7b49\u5f85\u3002`,
            currentEnabled ? String(currentRequestsPerMinute) : '0'
          );
          if (inputValue === null) {
            return;
          }

          const trimmedValue = String(inputValue || '').trim();
          const numericValue = Number(trimmedValue || 0);
          const enabled = trimmedValue !== '' && numericValue > 0;
          const requestsPerMinute = enabled ? numericValue : currentRequestsPerMinute || 60;
          if (!Number.isFinite(numericValue) || numericValue < 0) {
            showMessage('\u9650\u901f\u5fc5\u987b\u662f\u975e\u8d1f\u6574\u6570\uff0c\u6216\u8005\u586b 0 \u5173\u95ed\u9650\u901f\u3002', true);
            return;
          }
          if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1) {
            showMessage('\u9650\u901f\u5fc5\u987b\u662f\u6bcf\u5206\u949f\u7684\u6b63\u6574\u6570\u3002\u6216\u8005\u586b 0 \u56de\u5230\u5168\u5c40\u9ed8\u8ba4\u3002', true);
            return;
          }

          try {
            setBusy(button, true, '\u4fdd\u5b58\u4e2d...');
            await requestJson(`/api/admin/users/${encodeURIComponent(user.username)}/rate-limit`, {
              method: 'PUT',
              body: JSON.stringify({
                enabled,
                requestsPerMinute,
              }),
            });
            await refreshUserData();
            showMessage(enabled
              ? `${user.username} \u5df2\u5f00\u542f\u4e0a\u6e38\u9650\u901f\uff1a\u6bcf\u5206\u949f\u6700\u591a ${requestsPerMinute} \u6b21\u8bf7\u6c42\uff0c\u5176\u4ed6\u8bf7\u6c42\u4f1a\u6392\u961f\u3002`
              : `${user.username} \u7684\u4e2a\u4eba\u8986\u76d6\u5df2\u53d6\u6d88\uff0c\u5df2\u6062\u590d\u5168\u5c40\u9ed8\u8ba4\u3002`);
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'delete-user') {
          if (!window.confirm(`\u786e\u8ba4\u5220\u9664${user.role === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237'}\u201c${user.username}\u201d\u5417\uff1f`)) {
            return;
          }

          try {
            setBusy(button, true, '\u5220\u9664\u4e2d...');
            await requestJson(`/api/admin/users/${encodeURIComponent(user.username)}`, {
              method: 'DELETE',
            });
            if (refs.userEditUsername?.value === user.username) {
              resetUserForm();
            }
            await refreshUserData();
            showMessage(`${user.role === 'admin' ? '\u7ba1\u7406\u5458' : '\u7528\u6237'} ${user.username} \u5df2\u5220\u9664\u3002`);
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }

    if (usersStatsBody) {
      usersStatsBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action="reset-user-cost"]');
        if (!button) {
          return;
        }

        const username = button.dataset.username;
        if (!username) {
          return;
        }

        if (!window.confirm(`\u786e\u8ba4\u91cd\u7f6e\u201c${username}\u201d\u7684\u7528\u91cf\u7edf\u8ba1\u5417\uff1f`)) {
          return;
        }

        try {
          setBusy(button, true, '\u91cd\u7f6e\u4e2d...');
          await requestJson(`/api/admin/stats/users/${encodeURIComponent(username)}/reset`, {
            method: 'POST',
          });
          await loadStats();
          showMessage(`${username} \u7684\u7528\u91cf\u7edf\u8ba1\u5df2\u91cd\u7f6e\u3002`);
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(button, false);
        }
      });
    }

    if (rechargeRequestsBody) {
      rechargeRequestsBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) {
          return;
        }

        const orderId = button.dataset.orderId;
        if (!orderId) {
          return;
        }

        if (button.dataset.action === 'approve-recharge') {
          try {
            setBusy(button, true, '\u901a\u8fc7\u4e2d...');
            await requestJson(`/api/admin/recharge-orders/${encodeURIComponent(orderId)}/approve`, {
              method: 'POST',
            });
            await refreshUserData();
            showMessage('\u5145\u503c\u7533\u8bf7\u5df2\u901a\u8fc7\u3002');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'reject-recharge') {
          const reason = window.prompt('\u8bf7\u8f93\u5165\u62d2\u7edd\u539f\u56e0', '\u672a\u627e\u5230\u4ed8\u6b3e\u8bb0\u5f55');
          if (reason === null) {
            return;
          }

          try {
            setBusy(button, true, '\u62d2\u7edd\u4e2d...');
            await requestJson(`/api/admin/recharge-orders/${encodeURIComponent(orderId)}/reject`, {
              method: 'POST',
              body: JSON.stringify({ reason }),
            });
            await refreshUserData();
            showMessage('\u5145\u503c\u7533\u8bf7\u5df2\u62d2\u7edd\u3002');
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
    bindAccountActions,
  };
}
