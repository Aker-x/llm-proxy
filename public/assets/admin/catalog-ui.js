export function createCatalogUi({
  elements,
  helpers,
}) {
  const PRIORITY_RANK_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);

  const {
    externalModelCancelEditButton,
    externalModelEditName,
    externalModelForm,
    externalModelFormHint,
    externalModelFormTitle,
    externalModelModelIdsToggleAll,
    externalModelName,
    externalModelPriceMultiplier,
    externalModelPricingCacheRead,
    externalModelPricingCacheWrite,
    externalModelPricingCurrency,
    externalModelPricingInput,
    externalModelPricingOutput,
    externalModelSelectionBody,
    externalModelStrategy,
    externalModelSubmitButton,
    externalModelsBody,
    modelCancelEditButton,
    modelEditId,
    modelForm,
    modelFormHint,
    modelFormTitle,
    modelId,
    modelProviderSelect,
    modelSubmitButton,
    modelUpstreamApi,
    modelsBody,
    providerApiKey,
    providerBaseUrl,
    providerCancelEditButton,
    providerEditId,
    providerForm,
    providerFormHint,
    providerFormTitle,
    providerId,
    providerSubmitButton,
    providersBody,
  } = elements;
  const {
    applyTableSort,
    escapeHtml,
    formatLatency,
    formatBasePrice,
    formatMultiplierCell,
    getModelDisplayName,
    getModelOptionLabel,
    getPerMillionPrice,
    getStatusBadge,
    getUpstreamApiLabel,
    renderTableActionButton,
  } = helpers;

  function normalizePriorityRank(value, fallbackRank = 1) {
    let numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      numericValue = fallbackRank;
    }

    // Older saved targets used 100/200/300. Show them as simple ranks 1/2/3.
    if (numericValue > PRIORITY_RANK_OPTIONS.length && numericValue % 100 === 0) {
      numericValue /= 100;
    }

    return Math.min(
      PRIORITY_RANK_OPTIONS.length,
      Math.max(1, Math.round(numericValue))
    );
  }

  function renderPriorityOptions(selectedRank) {
    const normalizedRank = normalizePriorityRank(selectedRank);
    return PRIORITY_RANK_OPTIONS
      .map((rank) => `<option value="${rank}" ${rank === normalizedRank ? 'selected' : ''}>${rank}</option>`)
      .join('');
  }

  function buildPriorityRanks({
    currentModels = [],
    preferredTargets = [],
    preferredValues = [],
    selectedExternalModelPriorityRanks = new Map(),
  }) {
    const nextPriorityRanks = new Map();
    const preferredTargetRanks = new Map();
    const targets = Array.isArray(preferredTargets) ? preferredTargets : [];

    targets.forEach((target, index) => {
      const modelId = String(target?.modelId || target?.id || target || '').trim();
      if (!modelId) {
        return;
      }

      preferredTargetRanks.set(modelId, normalizePriorityRank(target?.priority, index + 1));
    });

    const preferredValueRanks = new Map(
      (Array.isArray(preferredValues) ? preferredValues : [])
        .map((value, index) => [String(value || '').trim(), normalizePriorityRank(index + 1, index + 1)])
        .filter(([modelId]) => Boolean(modelId))
    );

    currentModels.forEach((model, index) => {
      const modelId = String(model.id || '').trim();
      if (!modelId) {
        return;
      }

      const storedRank = selectedExternalModelPriorityRanks instanceof Map
        ? selectedExternalModelPriorityRanks.get(modelId)
        : undefined;
      const nextRank = preferredTargetRanks.get(modelId)
        ?? storedRank
        ?? preferredValueRanks.get(modelId)
        ?? normalizePriorityRank(index + 1, index + 1);

      nextPriorityRanks.set(modelId, normalizePriorityRank(nextRank, index + 1));
    });

    return nextPriorityRanks;
  }

  function setFormMode({ titleElement, hintElement, cancelButton, submitButton, title, hint, isEditing }) {
    if (titleElement) {
      titleElement.textContent = title;
    }
    if (hintElement) {
      hintElement.textContent = hint;
    }
    if (cancelButton) {
      cancelButton.hidden = !isEditing;
    }
    if (submitButton) {
      const submitLabel = isEditing ? '\u4fdd\u5b58' : '\u65b0\u5efa';
      submitButton.textContent = submitLabel;
      if (Object.prototype.hasOwnProperty.call(submitButton.dataset, 'originalLabel')) {
        submitButton.dataset.originalLabel = submitLabel;
      }
    }
  }

  function setProviderFormMode(isEditing = false) {
    setFormMode({
      titleElement: providerFormTitle,
      hintElement: providerFormHint,
      cancelButton: providerCancelEditButton,
      submitButton: providerSubmitButton,
      title: isEditing ? '\u7f16\u8f91\u4f9b\u5e94\u5546' : '\u521b\u5efa\u4f9b\u5e94\u5546',
      hint: isEditing
        ? '\u70b9\u4fdd\u5b58\u4f1a\u66f4\u65b0\u5f53\u524d\u4f9b\u5e94\u5546\uff0c\u70b9\u53d6\u6d88\u7f16\u8f91\u5219\u56de\u5230\u65b0\u5efa\u72b6\u6001\u3002'
        : '\u9ed8\u8ba4\u4e3a\u65b0\u5efa\u72b6\u6001\uff0c\u76f4\u63a5\u70b9\u4fdd\u5b58\u5373\u4f1a\u521b\u5efa\u4f9b\u5e94\u5546\u3002',
      isEditing,
    });
  }

  function setModelFormMode(isEditing = false) {
    setFormMode({
      titleElement: modelFormTitle,
      hintElement: modelFormHint,
      cancelButton: modelCancelEditButton,
      submitButton: modelSubmitButton,
      title: isEditing ? '\u7f16\u8f91\u6a21\u578b' : '\u521b\u5efa\u6a21\u578b',
      hint: isEditing
        ? '\u4fdd\u5b58\u540e\u4f1a\u66f4\u65b0\u5f53\u524d\u771f\u5b9e\u6a21\u578b\u7684\u4e0a\u6e38\u7ed1\u5b9a\u4e0e\u63a5\u53e3\u534f\u8bae\uff1b\u5bf9\u5916\u4ef7\u683c\u8bf7\u5728\u201c\u5bf9\u5916\u6a21\u578b\u201d\u4e2d\u8bbe\u7f6e\u3002'
        : '\u9ed8\u8ba4\u4e3a\u65b0\u5efa\u72b6\u6001\uff0c\u8fd9\u91cc\u53ea\u914d\u7f6e\u771f\u5b9e\u6a21\u578b\u7684 provider \u4e0e\u4e0a\u6e38 API\uff1b\u5bf9\u5916\u4ef7\u683c\u4e0e\u500d\u7387\u8bf7\u5728\u201c\u5bf9\u5916\u6a21\u578b\u201d\u4e2d\u7edf\u4e00\u8bbe\u7f6e\u3002',
      isEditing,
    });
  }

  function setExternalModelFormMode(isEditing = false) {
    setFormMode({
      titleElement: externalModelFormTitle,
      hintElement: externalModelFormHint,
      cancelButton: externalModelCancelEditButton,
      submitButton: externalModelSubmitButton,
      title: isEditing ? '\u7f16\u8f91\u5bf9\u5916\u6a21\u578b' : '\u521b\u5efa\u5bf9\u5916\u6a21\u578b',
      hint: isEditing
        ? '\u4fdd\u5b58\u540e\u4f1a\u66f4\u65b0\u5f53\u524d\u5bf9\u5916\u6a21\u578b\u7684\u540d\u79f0\u3001\u7ed1\u5b9a\u7684\u771f\u5b9e\u6a21\u578b\uff0c\u4ee5\u53ca\u5bf9\u5916\u5b9a\u4ef7\u4e0e\u500d\u7387\u3002'
        : '\u521b\u5efa\u4e00\u4e2a\u65b0\u7684\u5bf9\u5916\u6a21\u578b\u540d\uff0c\u7ed1\u5b9a\u4e00\u4e2a\u6216\u591a\u4e2a\u771f\u5b9e\u6a21\u578b\uff0c\u5e76\u8bbe\u7f6e\u7edf\u4e00\u7684\u5bf9\u5916\u5b9a\u4ef7\u4e0e\u500d\u7387\u3002',
      isEditing,
    });
  }

  function populateProviderSelect(currentProviders, selectElement, preferredValue = '') {
    if (!selectElement) {
      return '';
    }

    const selectedValue = currentProviders.some((provider) => provider.id === preferredValue)
      ? preferredValue
      : (currentProviders[0]?.id || '');

    selectElement.innerHTML = currentProviders
      .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.id)}</option>`)
      .join('');
    selectElement.value = selectedValue;
    selectElement.disabled = currentProviders.length === 0;

    return selectedValue;
  }

  function populateModelSelect(currentModels, selectElement, preferredValue = '') {
    if (!selectElement) {
      return '';
    }

    const selectedValue = currentModels.some((model) => model.id === preferredValue)
      ? preferredValue
      : (currentModels[0]?.id || '');

    selectElement.innerHTML = currentModels
      .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(getModelOptionLabel(model))}</option>`)
      .join('');
    selectElement.value = selectedValue;
    selectElement.disabled = currentModels.length === 0;

    return selectedValue;
  }

  function getAvailableExternalModelIds(currentModels) {
    return currentModels
      .map((model) => String(model.id || '').trim())
      .filter(Boolean);
  }

  function getSelectedExternalModelIds(currentModels, selectedExternalModelIds) {
    const availableIds = getAvailableExternalModelIds(currentModels);
    return availableIds.filter((modelId) => selectedExternalModelIds.has(modelId));
  }

  function getSelectedExternalModelTargets(
    currentModels,
    selectedExternalModelIds,
    selectedExternalModelPriorityRanks = new Map()
  ) {
    return getSelectedExternalModelIds(currentModels, selectedExternalModelIds)
      .map((modelId, index) => ({
        modelId,
        priority: normalizePriorityRank(
          selectedExternalModelPriorityRanks instanceof Map
            ? selectedExternalModelPriorityRanks.get(modelId)
            : undefined,
          index + 1
        ),
        weight: 1,
        enabled: true,
      }))
      .sort((a, b) => {
        const priorityDiff = Number(a.priority || 0) - Number(b.priority || 0);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return String(a.modelId || '').localeCompare(String(b.modelId || ''));
      });
  }

  function syncExternalModelToggleAll(currentModels, selectedExternalModelIds) {
    if (!externalModelModelIdsToggleAll) {
      return;
    }

    const availableIds = getAvailableExternalModelIds(currentModels);
    const selectedCount = availableIds.filter((modelId) => selectedExternalModelIds.has(modelId)).length;

    externalModelModelIdsToggleAll.disabled = availableIds.length === 0;
    externalModelModelIdsToggleAll.checked = availableIds.length > 0 && selectedCount === availableIds.length;
    externalModelModelIdsToggleAll.indeterminate = selectedCount > 0 && selectedCount < availableIds.length;
  }

  function setExternalModelSelection(currentModels, selectedExternalModelIds, modelId, isSelected) {
    const normalizedId = String(modelId || '').trim();
    if (!normalizedId) {
      return selectedExternalModelIds;
    }

    const nextSelectedIds = new Set(selectedExternalModelIds);

    if (isSelected) {
      nextSelectedIds.add(normalizedId);
    } else {
      nextSelectedIds.delete(normalizedId);
    }

    syncExternalModelToggleAll(currentModels, nextSelectedIds);
    return nextSelectedIds;
  }

  function setExternalModelPriority(selectedExternalModelPriorityRanks, modelId, priorityRank) {
    const normalizedId = String(modelId || '').trim();
    const nextPriorityRanks = new Map(selectedExternalModelPriorityRanks || []);
    if (normalizedId) {
      nextPriorityRanks.set(normalizedId, normalizePriorityRank(priorityRank));
    }
    return nextPriorityRanks;
  }

  function populateExternalModelModelIds({
    currentModels,
    failedModelIds,
    preferredValues = [],
    preferredTargets = [],
    selectedExternalModelIds = new Set(),
    selectedExternalModelPriorityRanks = new Map(),
  }) {
    const selectedSet = new Set(
      (Array.isArray(preferredValues) ? preferredValues : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    );

    const nextSelectedIds = new Set(
      getAvailableExternalModelIds(currentModels).filter((modelId) => selectedSet.has(modelId))
    );
    const nextPriorityRanks = buildPriorityRanks({
      currentModels,
      preferredTargets,
      preferredValues,
      selectedExternalModelPriorityRanks,
    });

    if (!externalModelSelectionBody) {
      syncExternalModelToggleAll(currentModels, nextSelectedIds);
      return {
        selectedExternalModelIds: nextSelectedIds,
        selectedExternalModelPriorityRanks: nextPriorityRanks,
      };
    }

    externalModelSelectionBody.innerHTML = currentModels.length
      ? currentModels.map((model) => {
        const modelIdentifier = String(model.id || '').trim();
        const isSelected = nextSelectedIds.has(modelIdentifier);
        const priorityRank = normalizePriorityRank(nextPriorityRanks.get(modelIdentifier));
        const connectivityStatus = String(model.connectivityStatus?.status || 'unknown');
        const isModelDisabled = model.enabled === false;
        const isFailed = connectivityStatus === 'failed' || failedModelIds.has(modelIdentifier);
        const statusBadge = isModelDisabled
          ? getStatusBadge('\u5df2\u7981\u7528', 'muted')
          : (isFailed
            ? getStatusBadge('\u4e0d\u53ef\u7528', 'danger')
            : (connectivityStatus === 'ok'
              ? getStatusBadge('\u53ef\u7528', 'success')
              : getStatusBadge('\u672a\u68c0\u6d4b', 'muted')));

        return `
      <tr class="${isFailed ? 'is-test-failed' : ''}" data-external-model-id="${escapeHtml(modelIdentifier)}">
        <td class="selection-checkbox-cell">
          <input
            type="checkbox"
            data-external-model-id="${escapeHtml(modelIdentifier)}"
            aria-label="\u9009\u62e9 ${escapeHtml(getModelOptionLabel(model))}"
            ${isSelected ? 'checked' : ''}
          />
        </td>
        <td class="priority-cell">
          <select
            class="priority-select"
            data-external-model-priority-id="${escapeHtml(modelIdentifier)}"
            aria-label="\u8bbe\u7f6e ${escapeHtml(getModelOptionLabel(model))} \u7684\u4f18\u5148\u7ea7"
            ${isSelected ? '' : 'disabled'}
          >${renderPriorityOptions(priorityRank)}</select>
        </td>
        <td>${escapeHtml(model.providerName || model.providerId || '-')}</td>
        <td><code class="table-code">${escapeHtml(getModelDisplayName(model) || modelIdentifier)}</code></td>
        <td>${escapeHtml(model.upstreamApiLabel || getUpstreamApiLabel(model.upstreamApi))}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
      }).join('')
      : '<tr><td colspan="6" class="table-note">\u6682\u65e0\u53ef\u7ed1\u5b9a\u7684\u771f\u5b9e\u6a21\u578b\u3002</td></tr>';

    syncExternalModelToggleAll(currentModels, nextSelectedIds);
    return {
      selectedExternalModelIds: nextSelectedIds,
      selectedExternalModelPriorityRanks: nextPriorityRanks,
    };
  }

  function resetProviderForm() {
    providerEditId.value = '';
    providerId.value = '';
    providerBaseUrl.value = '';
    providerApiKey.value = '';
    setProviderFormMode(false);
  }

  function resetModelForm(currentProviders) {
    modelEditId.value = '';
    modelId.value = '';
    if (modelUpstreamApi) {
      modelUpstreamApi.value = 'chat_completions';
    }
    populateProviderSelect(currentProviders, modelProviderSelect, currentProviders[0]?.id || '');
    setModelFormMode(false);
  }

  function resetExternalModelForm(currentModels, failedModelIds) {
    if (externalModelEditName) {
      externalModelEditName.value = '';
    }
    if (externalModelName) {
      externalModelName.value = '';
    }
    if (externalModelStrategy) {
      externalModelStrategy.value = 'round_robin';
    }
    if (externalModelPricingCurrency) {
      externalModelPricingCurrency.value = 'USD';
    }
    if (externalModelPricingInput) {
      externalModelPricingInput.value = '0';
    }
    if (externalModelPricingOutput) {
      externalModelPricingOutput.value = '0';
    }
    if (externalModelPricingCacheRead) {
      externalModelPricingCacheRead.value = '0';
    }
    if (externalModelPricingCacheWrite) {
      externalModelPricingCacheWrite.value = '0';
    }
    if (externalModelPriceMultiplier) {
      externalModelPriceMultiplier.value = '1.5';
    }

    const nextSelection = populateExternalModelModelIds({
      currentModels,
      failedModelIds,
      preferredValues: [],
      preferredTargets: [],
      selectedExternalModelIds: new Set(),
      selectedExternalModelPriorityRanks: new Map(),
    });
    setExternalModelFormMode(false);
    return nextSelection;
  }

  function editProvider(provider) {
    providerEditId.value = provider.id;
    providerId.value = provider.id;
    providerBaseUrl.value = provider.apiBaseUrl;
    providerApiKey.value = provider.apiKey || '';
    setProviderFormMode(true);
    providerForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    providerId.focus();
  }

  function editModel(model, currentProviders) {
    modelEditId.value = model.id;
    modelId.value = getModelDisplayName(model);
    populateProviderSelect(currentProviders, modelProviderSelect, model.providerId);
    if (modelUpstreamApi) {
      modelUpstreamApi.value = model.upstreamApi || 'chat_completions';
    }
    setModelFormMode(true);
    modelForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    modelId.focus();
  }

  function editExternalModel(item, currentModels, failedModelIds) {
    if (externalModelEditName) {
      externalModelEditName.value = item.name || item.externalModelName || '';
    }
    if (externalModelName) {
      externalModelName.value = item.name || item.externalModelName || '';
    }
    if (externalModelStrategy) {
      externalModelStrategy.value = item.strategy || 'round_robin';
    }
    if (externalModelPricingCurrency) {
      externalModelPricingCurrency.value = item.pricing?.currency || 'USD';
    }
    if (externalModelPricingInput) {
      externalModelPricingInput.value = getPerMillionPrice(item.pricing, 'inputPerMillionTokens', 'inputPer1kTokens');
    }
    if (externalModelPricingOutput) {
      externalModelPricingOutput.value = getPerMillionPrice(item.pricing, 'outputPerMillionTokens', 'outputPer1kTokens');
    }
    if (externalModelPricingCacheRead) {
      externalModelPricingCacheRead.value = getPerMillionPrice(item.pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens');
    }
    if (externalModelPricingCacheWrite) {
      externalModelPricingCacheWrite.value = getPerMillionPrice(item.pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens');
    }
    if (externalModelPriceMultiplier) {
      externalModelPriceMultiplier.value = item.displayPricing?.priceMultiplier ?? item.pricing?.priceMultiplier ?? 1.5;
    }

    const nextSelection = populateExternalModelModelIds({
      currentModels,
      failedModelIds,
      preferredValues: item.modelIds || item.targets?.map((target) => target.modelId) || [],
      preferredTargets: item.targets || [],
      selectedExternalModelIds: new Set(),
      selectedExternalModelPriorityRanks: new Map(),
    });
    setExternalModelFormMode(true);
    externalModelForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    externalModelStrategy?.focus();
    return nextSelection;
  }

  function renderProviderTables({
    currentExternalModels,
    currentModels,
    currentProviders,
    failedModelIds,
    selectedExternalModelIds,
    selectedExternalModelPriorityRanks = new Map(),
  }) {
    if (!providersBody || !modelsBody || !externalModelsBody) {
      return {
        selectedExternalModelIds,
        selectedExternalModelPriorityRanks,
      };
    }

    const sortedProviders = applyTableSort(currentProviders, 'providersBody');
    const sortedModels = applyTableSort(currentModels, 'modelsBody');
    const sortedExternalModels = applyTableSort(currentExternalModels, 'externalModelsBody');
    const nextSelection = populateExternalModelModelIds({
      currentModels,
      failedModelIds,
      preferredValues: getSelectedExternalModelIds(currentModels, selectedExternalModelIds),
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks,
    });
    const nextSelectedIds = nextSelection.selectedExternalModelIds;

    providersBody.innerHTML = sortedProviders.length
      ? sortedProviders.map((provider) => `
      <tr>
        <td><strong>${escapeHtml(provider.id)}</strong></td>
        <td>${escapeHtml(provider.apiBaseUrl)}</td>
        <td><code class="table-code table-code-break">${escapeHtml(provider.apiKey || '-')}</code></td>
        <td class="action-cell">
          <div class="table-actions">
            ${renderTableActionButton({
              action: 'edit-provider',
              label: `\u7f16\u8f91\u4f9b\u5e94\u5546 ${provider.id}`,
              icon: 'edit',
              attrs: { 'provider-id': provider.id },
            })}
            ${renderTableActionButton({
              action: 'delete-provider',
              label: `\u5220\u9664\u4f9b\u5e94\u5546 ${provider.id}`,
              icon: 'delete',
              tone: 'is-danger',
              attrs: { 'provider-id': provider.id },
            })}
          </div>
        </td>
      </tr>
    `).join('')
      : '<tr><td colspan="4" class="table-note">\u6682\u65e0\u4f9b\u5e94\u5546\u914d\u7f6e\u3002</td></tr>';

    modelsBody.innerHTML = sortedModels.length
      ? sortedModels.map((model) => `
      <tr class="${[
        model.connectivityStatus?.status === 'failed' || failedModelIds.has(model.id) ? 'is-test-failed' : '',
        model.enabled === false ? 'is-model-disabled' : '',
      ].filter(Boolean).join(' ')}">
        <td>
          <strong>${escapeHtml(getModelDisplayName(model))}</strong>
          ${model.enabled === false ? `<div class="badge-row">${getStatusBadge('\u5df2\u5168\u5c40\u7981\u7528', 'muted')}</div>` : ''}
        </td>
        <td>${escapeHtml(model.providerName || model.providerId)}</td>
        <td>${escapeHtml(model.upstreamApiLabel || getUpstreamApiLabel(model.upstreamApi))}</td>
        <td>${formatLatency(model.connectivityStatus?.latencyMs)}</td>
        <td class="action-cell">
          <div class="table-actions">
            ${renderTableActionButton({
              action: 'edit-model',
              label: `\u7f16\u8f91\u6a21\u578b ${model.id}`,
              icon: 'edit',
              attrs: { 'model-id': model.id },
            })}
            ${renderTableActionButton({
              action: 'delete-model',
              label: `\u5220\u9664\u6a21\u578b ${model.id}`,
              icon: 'delete',
              tone: 'is-danger',
              attrs: { 'model-id': model.id },
            })}
            ${renderTableActionButton({
              action: 'test-model',
              label: `\u6d4b\u8bd5\u6a21\u578b ${model.id}`,
              icon: 'test',
              attrs: { 'model-id': model.id },
            })}
          </div>
        </td>
      </tr>
    `).join('')
      : '<tr><td colspan="5" class="table-note">\u6682\u65e0\u6a21\u578b\u914d\u7f6e\u3002</td></tr>';

    if (!sortedModels.length) {
      const emptyNoteCell = modelsBody.querySelector('td.table-note');
      if (emptyNoteCell) {
        emptyNoteCell.colSpan = 5;
      }
    }

    if (sortedModels.length) {
      const modelRows = Array.from(modelsBody.querySelectorAll('tr'));
      sortedModels.forEach((model, index) => {
        const actionContainer = modelRows[index]?.querySelector('.table-actions');
        if (!actionContainer) {
          return;
        }

        actionContainer.insertAdjacentHTML('beforeend', renderTableActionButton({
          action: 'toggle-model-enabled',
          label: model.enabled === false ? `\u542f\u7528\u6a21\u578b ${model.id}` : `\u7981\u7528\u6a21\u578b ${model.id}`,
          icon: 'power',
          tone: model.enabled === false ? 'is-success' : 'is-warning',
          attrs: { 'model-id': model.id },
        }));
      });
    }

    externalModelsBody.innerHTML = sortedExternalModels.length
      ? sortedExternalModels.map((item) => {
        const pricing = item.displayPricing || item.pricing || {};
        const modelLabels = (item.targets || [])
          .map((target) => {
            const details = target.modelDetails || {};
            const label = getModelOptionLabel({
              id: target.modelId,
              providerId: details.providerId,
              providerName: details.providerName,
              upstreamModel: details.upstreamModel || details.id,
            });
            return {
              label,
              priorityRank: normalizePriorityRank(target.priority),
            };
          })
          .filter((target) => target.label)
          .sort((a, b) => {
            const priorityDiff = Number(a.priorityRank || 0) - Number(b.priorityRank || 0);
            if (priorityDiff !== 0) {
              return priorityDiff;
            }

            return String(a.label || '').localeCompare(String(b.label || ''));
          });
        const strategyLabel = item.strategy === 'failover'
          ? '\u6545\u969c\u8f6c\u79fb'
          : (item.strategy === 'priority' ? '\u4f18\u5148\u7ea7' : '\u8f6e\u8be2');
        const stableName = item.name || item.externalModelName || '';
        return `
      <tr>
        <td><strong>${escapeHtml(stableName)}</strong></td>
        <td>${getStatusBadge(strategyLabel, item.strategy === 'round_robin' ? 'info' : 'muted')}</td>
        <td>${formatBasePrice(pricing, 'inputPerMillionTokens', 'inputPer1kTokens')}</td>
        <td>${formatBasePrice(pricing, 'outputPerMillionTokens', 'outputPer1kTokens')}</td>
        <td>${formatBasePrice(pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens')}</td>
        <td>${formatBasePrice(pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens')}</td>
        <td>${formatMultiplierCell(pricing)}</td>
        <td>${modelLabels.length ? modelLabels.map((target) => `<span class="target-priority-chip"><span>\u4f18\u5148\u7ea7 ${target.priorityRank}</span><code class="table-code">${escapeHtml(target.label)}</code></span>`).join(' ') : '-'}</td>
        <td class="action-cell">
          <div class="table-actions">
            ${renderTableActionButton({
              action: 'edit-external-model',
              label: `\u7f16\u8f91\u5bf9\u5916\u6a21\u578b ${stableName}`,
              icon: 'edit',
              attrs: { 'external-model-name': stableName },
            })}
            ${renderTableActionButton({
              action: 'delete-external-model',
              label: `\u5220\u9664\u5bf9\u5916\u6a21\u578b ${stableName}`,
              icon: 'delete',
              tone: 'is-danger',
              attrs: { 'external-model-name': stableName },
            })}
          </div>
        </td>
      </tr>
    `;
      }).join('')
      : '<tr><td colspan="9" class="table-note">\u6682\u65e0\u5bf9\u5916\u6a21\u578b\uff0c\u8bf7\u5148\u521b\u5efa\u3002</td></tr>';

    return nextSelection;
  }

  return {
    editExternalModel,
    editModel,
    editProvider,
    getAvailableExternalModelIds,
    getSelectedExternalModelIds,
    getSelectedExternalModelTargets,
    populateExternalModelModelIds,
    populateModelSelect,
    populateProviderSelect,
    renderProviderTables,
    resetExternalModelForm,
    resetModelForm,
    resetProviderForm,
    setExternalModelFormMode,
    setExternalModelSelection,
    setExternalModelPriority,
    setModelFormMode,
    setProviderFormMode,
    syncExternalModelToggleAll,
  };
}
