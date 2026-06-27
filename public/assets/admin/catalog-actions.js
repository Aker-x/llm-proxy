export function createCatalogActions({
  elements,
  helpers,
}) {
  const {
    externalModelForm,
    externalModelSelectionBody,
    externalModelModelIdsToggleAll,
    externalModelsBody,
    modelForm,
    modelsBody,
    providerForm,
    providersBody,
    testAllModelsButton,
  } = elements;
  const {
    applyModelConnectivityResult,
    catalogUi,
    formatLatency,
    loadProviders,
    refreshAdminData,
    requestJson,
    setBusy,
    showMessage,
    state,
  } = helpers;

  function getCatalogState() {
    return state.get();
  }

  function setCatalogState(nextPartial) {
    state.set(nextPartial);
  }

  async function testAllModelsConnectivity() {
    const { currentModels } = getCatalogState();
    if (!currentModels.length) {
      showMessage('\u5f53\u524d\u6ca1\u6709\u53ef\u6d4b\u8bd5\u7684\u6a21\u578b\u3002', true);
      return;
    }

    setCatalogState({ failedModelIds: new Set() });
    const {
      failedModelIds,
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks,
      currentExternalModels,
      currentProviders,
    } = getCatalogState();
    const nextSelection = catalogUi.renderProviderTables({
      currentExternalModels,
      currentModels,
      currentProviders,
      failedModelIds,
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks,
    });
    setCatalogState(nextSelection);

    let successCount = 0;
    let failedCount = 0;

    for (const model of currentModels) {
      try {
        const result = await requestJson(`/api/admin/models/${encodeURIComponent(model.id)}/test`, {
          method: 'POST',
        });

        applyModelConnectivityResult(model.id, result);
        const nextFailedModelIds = new Set(getCatalogState().failedModelIds);
        if (result.ok) {
          successCount += 1;
          nextFailedModelIds.delete(model.id);
        } else {
          failedCount += 1;
          nextFailedModelIds.add(model.id);
        }
        setCatalogState({ failedModelIds: nextFailedModelIds });
      } catch (_error) {
        failedCount += 1;
        const nextFailedModelIds = new Set(getCatalogState().failedModelIds);
        nextFailedModelIds.add(model.id);
        setCatalogState({ failedModelIds: nextFailedModelIds });
      }

      const nextState = getCatalogState();
      const nextSelectionAfterTest = catalogUi.renderProviderTables({
        currentExternalModels: nextState.currentExternalModels,
        currentModels: nextState.currentModels,
        currentProviders: nextState.currentProviders,
        failedModelIds: nextState.failedModelIds,
        selectedExternalModelIds: nextState.selectedExternalModelIds,
        selectedExternalModelPriorityRanks: nextState.selectedExternalModelPriorityRanks,
      });
      setCatalogState(nextSelectionAfterTest);
    }

    await loadProviders();

    if (failedCount > 0) {
      showMessage(`\u6a21\u578b\u6d4b\u8bd5\u5df2\u5b8c\u6210\uff1a${successCount} \u4e2a\u901a\u8fc7\uff0c${failedCount} \u4e2a\u5931\u8d25\u3002\u5931\u8d25\u7684\u6a21\u578b\u5df2\u9ad8\u4eae\u6807\u8bb0\u3002`, true);
      return;
    }

    showMessage(`\u6a21\u578b\u6d4b\u8bd5\u5df2\u5b8c\u6210\uff1a\u5168\u90e8 ${successCount} \u4e2a\u6a21\u578b\u901a\u8fc7\u3002`);
  }

  function bindCatalogActions() {
    if (providerForm) {
      providerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = providerForm.querySelector('button[type="submit"]');
        const { providerEditId, providerId, providerBaseUrl, providerApiKey } = getCatalogState().refs;
        const nextProviderId = providerId.value.trim();
        const isEditingProvider = Boolean(providerEditId.value.trim());
        const payload = {
          id: nextProviderId,
          apiBaseUrl: providerBaseUrl.value.trim(),
          apiKey: providerApiKey.value.trim(),
        };

        try {
          setBusy(submitButton, true, '\u4fdd\u5b58\u4e2d...');

          if (isEditingProvider) {
            await requestJson(`/api/admin/providers/${encodeURIComponent(providerEditId.value)}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
          } else {
            await requestJson('/api/admin/providers', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }

          getCatalogState().resetProviderForm();
          await refreshAdminData();
          showMessage(isEditingProvider ? '\u4f9b\u5e94\u5546\u5df2\u66f4\u65b0\u3002' : '\u4f9b\u5e94\u5546\u5df2\u521b\u5efa\u3002');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (modelForm) {
      modelForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = modelForm.querySelector('button[type="submit"]');
        const {
          modelEditId,
          modelId,
          modelProviderSelect,
          modelUpstreamApi,
        } = getCatalogState().refs;
        const modelName = modelId.value.trim();
        const isEditingModel = Boolean(modelEditId.value.trim());
        const payload = {
          id: modelName,
          providerId: modelProviderSelect.value,
          upstreamModel: modelName,
          upstreamApi: modelUpstreamApi?.value || 'chat_completions',
        };

        try {
          setBusy(submitButton, true, '\u4fdd\u5b58\u4e2d...');

          if (isEditingModel) {
            await requestJson(`/api/admin/models/${encodeURIComponent(modelEditId.value)}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
          } else {
            await requestJson('/api/admin/models', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }

          getCatalogState().resetModelForm();
          await loadProviders();
          showMessage(isEditingModel ? '\u6a21\u578b\u5df2\u66f4\u65b0\u3002' : '\u6a21\u578b\u5df2\u521b\u5efa\u3002');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (externalModelForm) {
      externalModelForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitButton = externalModelForm.querySelector('button[type="submit"]');
        const {
          externalModelEditName,
          externalModelName,
          externalModelPriceMultiplier,
          externalModelPricingCacheRead,
          externalModelPricingCacheWrite,
          externalModelPricingCurrency,
          externalModelPricingInput,
          externalModelPricingOutput,
          externalModelStrategy,
          numberValue,
        } = getCatalogState().refs;
        const name = externalModelName?.value.trim() || '';
        const selectedTargets = getCatalogState().getSelectedExternalModelTargets();
        const duplicatePriorities = selectedTargets
          .map((target) => Number(target.priority))
          .filter((priority, index, priorities) => priorities.indexOf(priority) !== index);
        if (duplicatePriorities.length) {
          showMessage(`\u4f18\u5148\u7ea7 ${duplicatePriorities[0]} \u88ab\u591a\u4e2a\u6a21\u578b\u4f7f\u7528\uff0c\u8bf7\u7ed9\u6bcf\u4e2a\u5907\u7528\u987a\u5e8f\u9009\u4e0d\u540c\u6570\u5b57\u3002`, true);
          return;
        }

        const payload = {
          name,
          strategy: externalModelStrategy?.value || 'round_robin',
          pricing: {
            currency: externalModelPricingCurrency?.value.trim() || 'USD',
            inputPerMillionTokens: numberValue(externalModelPricingInput),
            outputPerMillionTokens: numberValue(externalModelPricingOutput),
            cachedInputPerMillionTokens: numberValue(externalModelPricingCacheRead),
            cacheCreationPerMillionTokens: numberValue(externalModelPricingCacheWrite),
            inputPer1kTokens: numberValue(externalModelPricingInput),
            outputPer1kTokens: numberValue(externalModelPricingOutput),
            cachedInputPer1kTokens: numberValue(externalModelPricingCacheRead),
            cacheCreationPer1kTokens: numberValue(externalModelPricingCacheWrite),
            priceMultiplier: numberValue(externalModelPriceMultiplier, 7.5),
          },
          modelIds: selectedTargets.map((target) => target.modelId),
          targets: selectedTargets,
        };

        try {
          setBusy(submitButton, true, '\u4fdd\u5b58\u4e2d...');

          if (externalModelEditName?.value) {
            await requestJson(`/api/admin/external-models/${encodeURIComponent(externalModelEditName.value)}`, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });
          } else {
            await requestJson('/api/admin/external-models', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
          }

          getCatalogState().resetExternalModelForm();
          await loadProviders();
          showMessage('\u5bf9\u5916\u6a21\u578b\u5df2\u4fdd\u5b58\u3002');
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(submitButton, false);
        }
      });
    }

    if (providersBody) {
      providersBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) {
          return;
        }

        const { currentProviders } = getCatalogState();
        const provider = currentProviders.find((item) => item.id === button.dataset.providerId);
        if (!provider) {
          return;
        }

        if (button.dataset.action === 'edit-provider') {
          getCatalogState().editProvider(provider);
          return;
        }

        if (button.dataset.action === 'delete-provider') {
          if (!window.confirm(`\u786e\u8ba4\u5220\u9664\u4f9b\u5e94\u5546\u201c${provider.id}\u201d\u5417\uff1f\u8fd9\u4f1a\u540c\u65f6\u5220\u9664\u5173\u8054\u7684\u6a21\u578b\u548c\u5bf9\u5916\u6a21\u578b\u7ed1\u5b9a\u3002`)) {
            return;
          }

          try {
            setBusy(button, true, '\u5220\u9664\u4e2d...');
            await requestJson(`/api/admin/providers/${encodeURIComponent(provider.id)}`, { method: 'DELETE' });
            await refreshAdminData();
            getCatalogState().resetProviderForm();
            getCatalogState().resetModelForm();
            getCatalogState().resetExternalModelForm();
            showMessage('\u4f9b\u5e94\u5546\u5df2\u5220\u9664\u3002');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }

    if (modelsBody) {
      modelsBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) {
          return;
        }

        const { currentModels } = getCatalogState();
        const model = currentModels.find((item) => item.id === button.dataset.modelId);
        if (!model) {
          return;
        }

        if (button.dataset.action === 'edit-model') {
          getCatalogState().editModel(model);
          return;
        }

        if (button.dataset.action === 'delete-model') {
          if (!window.confirm(`\u786e\u8ba4\u5220\u9664\u6a21\u578b\u201c${model.id}\u201d\u5417\uff1f\u8fd9\u4f1a\u540c\u65f6\u5220\u9664\u5173\u8054\u7684\u5bf9\u5916\u6a21\u578b\u7ed1\u5b9a\u3002`)) {
            return;
          }

          try {
            setBusy(button, true, '\u5220\u9664\u4e2d...');
            await requestJson(`/api/admin/models/${encodeURIComponent(model.id)}`, { method: 'DELETE' });
            await loadProviders();
            getCatalogState().resetModelForm();
            getCatalogState().resetExternalModelForm();
            showMessage('\u6a21\u578b\u5df2\u5220\u9664\u3002');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'test-model') {
          try {
            setBusy(button, true, '\u6d4b\u8bd5\u4e2d...');
            const result = await requestJson(`/api/admin/models/${encodeURIComponent(model.id)}/test`, {
              method: 'POST',
            });

            applyModelConnectivityResult(model.id, result);
            const nextFailedModelIds = new Set(getCatalogState().failedModelIds);
            if (result.ok) {
              nextFailedModelIds.delete(model.id);
            } else {
              nextFailedModelIds.add(model.id);
            }
            setCatalogState({ failedModelIds: nextFailedModelIds });

            await loadProviders();
            showMessage(
              result.ok
                ? `\u6a21\u578b ${model.id} \u6d4b\u8bd5\u901a\u8fc7\uff08${formatLatency(result.latencyMs)}\uff09\u3002`
                : `\u6a21\u578b ${model.id} \u6d4b\u8bd5\u5931\u8d25\uff1a${result.message || '\u672a\u77e5\u9519\u8bef\u3002'}`,
              !result.ok
            );
          } catch (error) {
            const nextFailedModelIds = new Set(getCatalogState().failedModelIds);
            nextFailedModelIds.add(model.id);
            setCatalogState({ failedModelIds: nextFailedModelIds });
            await loadProviders();
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
          return;
        }

        if (button.dataset.action === 'toggle-model-enabled') {
          try {
            setBusy(button, true, model.enabled === false ? '\u542f\u7528\u4e2d...' : '\u7981\u7528\u4e2d...');
            await requestJson(`/api/admin/models/${encodeURIComponent(model.id)}`, {
              method: 'PUT',
              body: JSON.stringify({ enabled: model.enabled === false }),
            });
            await loadProviders();
            showMessage(model.enabled === false ? '\u6a21\u578b\u5df2\u542f\u7528\u3002' : '\u6a21\u578b\u5df2\u7981\u7528\u3002');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }

    if (testAllModelsButton) {
      testAllModelsButton.addEventListener('click', async () => {
        try {
          setBusy(testAllModelsButton, true, '\u6d4b\u8bd5\u4e2d...');
          await testAllModelsConnectivity();
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          setBusy(testAllModelsButton, false);
        }
      });
    }

    if (externalModelsBody) {
      externalModelsBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) {
          return;
        }

        const { currentExternalModels, refs } = getCatalogState();
        const externalModel = currentExternalModels.find((item) => (item.name || item.externalModelName) === button.dataset.externalModelName);
        if (!externalModel) {
          return;
        }

        const stableName = externalModel.name || externalModel.externalModelName || '';

        if (button.dataset.action === 'edit-external-model') {
          getCatalogState().editExternalModel(externalModel);
          return;
        }

        if (button.dataset.action === 'delete-external-model') {
          if (!window.confirm(`\u786e\u8ba4\u5220\u9664\u5bf9\u5916\u6a21\u578b\u201c${stableName}\u201d\u5417\uff1f`)) {
            return;
          }

          try {
            setBusy(button, true, '\u5220\u9664\u4e2d...');
            await requestJson(`/api/admin/external-models/${encodeURIComponent(stableName)}`, { method: 'DELETE' });
            await loadProviders();
            if (refs.externalModelEditName?.value === stableName) {
              getCatalogState().resetExternalModelForm();
            }
            showMessage('\u5bf9\u5916\u6a21\u578b\u5df2\u5220\u9664\u3002');
          } catch (error) {
            showMessage(error.message, true);
          } finally {
            setBusy(button, false);
          }
        }
      });
    }

    if (externalModelModelIdsToggleAll) {
      externalModelModelIdsToggleAll.addEventListener('change', () => {
        const { currentModels } = getCatalogState();
        const nextSelectedIds = externalModelModelIdsToggleAll.checked
          ? catalogUi.getAvailableExternalModelIds(currentModels)
          : [];

        setCatalogState({ selectedExternalModelIds: new Set(nextSelectedIds) });

        if (externalModelSelectionBody) {
          for (const checkbox of externalModelSelectionBody.querySelectorAll('input[type="checkbox"][data-external-model-id]')) {
            checkbox.checked = externalModelModelIdsToggleAll.checked;
            const row = checkbox.closest('tr[data-external-model-id]');
            const prioritySelect = row?.querySelector('select[data-external-model-priority-id]');
            if (prioritySelect) {
              prioritySelect.disabled = !checkbox.checked;
            }
          }
        }

        getCatalogState().syncExternalModelToggleAll();
      });
    }

    if (externalModelSelectionBody) {
      externalModelSelectionBody.addEventListener('change', (event) => {
        const prioritySelect = event.target.closest('select[data-external-model-priority-id]');
        if (prioritySelect) {
          getCatalogState().setExternalModelPriority(
            prioritySelect.dataset.externalModelPriorityId,
            prioritySelect.value
          );
          return;
        }

        const checkbox = event.target.closest('input[type="checkbox"][data-external-model-id]');
        if (!checkbox) {
          return;
        }

        const row = checkbox.closest('tr[data-external-model-id]');
        const prioritySelectForRow = row?.querySelector('select[data-external-model-priority-id]');
        if (prioritySelectForRow) {
          prioritySelectForRow.disabled = !checkbox.checked;
        }
        getCatalogState().setExternalModelSelection(checkbox.dataset.externalModelId, checkbox.checked);
      });

      externalModelSelectionBody.addEventListener('click', (event) => {
        if (event.target.closest('input, select, button, a, label')) {
          return;
        }

        const row = event.target.closest('tr[data-external-model-id]');
        if (!row) {
          return;
        }

        const checkbox = row.querySelector('input[type="checkbox"][data-external-model-id]');
        if (!checkbox) {
          return;
        }

        checkbox.checked = !checkbox.checked;
        const prioritySelect = row.querySelector('select[data-external-model-priority-id]');
        if (prioritySelect) {
          prioritySelect.disabled = !checkbox.checked;
        }
        getCatalogState().setExternalModelSelection(checkbox.dataset.externalModelId, checkbox.checked);
      });
    }
  }

  return {
    bindCatalogActions,
    testAllModelsConnectivity,
  };
}
