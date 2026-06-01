export function createAdminShellActions({
  elements,
  helpers,
}) {
  const {
    adminNavLinks,
    externalModelCancelEditButton,
    logoutButton,
    modelCancelEditButton,
    providerCancelEditButton,
    refreshRecentRequestsButton,
    userCancelEditButton,
  } = elements;
  const {
    loadRecentRequests,
    requestJson,
    resetExternalModelForm,
    resetModelForm,
    resetProviderForm,
    resetUserForm,
    showAdminSection,
    setBusy,
    showMessage,
    syncAdminNavWithScroll,
  } = helpers;

  function bindShellActions() {
    if (logoutButton) {
      logoutButton.addEventListener('click', async () => {
        try {
          setBusy(logoutButton, true, '\u9000\u51fa\u4e2d...');
          await requestJson('/api/admin/logout', { method: 'POST' });
          window.location.href = '/';
        } catch (error) {
          showMessage(error.message, true);
          setBusy(logoutButton, false);
        }
      });
    }

    if (adminNavLinks.length) {
      for (const link of adminNavLinks) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          showAdminSection(link.dataset.adminNavLink || '', { updateHash: true });
        });
      }

      window.addEventListener('hashchange', syncAdminNavWithScroll);
    }

    if (userCancelEditButton) {
      userCancelEditButton.addEventListener('click', () => {
        resetUserForm();
      });
    }

    if (providerCancelEditButton) {
      providerCancelEditButton.addEventListener('click', () => {
        resetProviderForm();
      });
    }

    if (modelCancelEditButton) {
      modelCancelEditButton.addEventListener('click', () => {
        resetModelForm();
      });
    }

    if (externalModelCancelEditButton) {
      externalModelCancelEditButton.addEventListener('click', () => {
        resetExternalModelForm();
      });
    }

    if (refreshRecentRequestsButton) {
      refreshRecentRequestsButton.addEventListener('click', async () => {
        try {
          setBusy(refreshRecentRequestsButton, true, '\u5237\u65b0\u4e2d...');
          await loadRecentRequests();
          showMessage('\u6700\u8fd1\u8bf7\u6c42\u5df2\u5237\u65b0\u3002');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(refreshRecentRequestsButton, false);
        }
      });
    }
  }

  return {
    bindShellActions,
  };
}
