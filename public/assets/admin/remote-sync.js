export function createRemoteSyncActions({
  elements,
  helpers,
}) {
  const {
    remoteHost,
    remotePassword,
    remoteSyncButton,
    remoteSyncForm,
    remoteUsername,
  } = elements;
  const {
    refreshAdminData,
    requestJson,
    setBusy,
    showMessage,
  } = helpers;

  function bindRemoteSyncActions() {
    if (!remoteSyncForm) {
      return;
    }

    remoteSyncForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      try {
        setBusy(remoteSyncButton, true, '\u540c\u6b65\u4e2d...');
        const body = {
          host: remoteHost?.value.trim() || '',
          username: remoteUsername?.value.trim() || '',
          password: remotePassword?.value || '',
        };
        const result = await requestJson('/api/admin/sync-from-remote', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showMessage(`\u540c\u6b65\u5b8c\u6210\uff1a${result.providers} \u4e2a\u4f9b\u5e94\u5546\uff0c${result.models} \u4e2a\u6a21\u578b\uff0c${result.externalModels} \u4e2a\u5bf9\u5916\u6a21\u578b\u3002`);
        if (remotePassword) {
          remotePassword.value = '';
        }
        await refreshAdminData();
      } catch (error) {
        showMessage(error.message, true);
      } finally {
        setBusy(remoteSyncButton, false);
      }
    });
  }

  return {
    bindRemoteSyncActions,
  };
}
