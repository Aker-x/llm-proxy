export function createCatalogStateBridge({
  catalogUi,
  state,
}) {
  function getCatalogState() {
    return state.get();
  }

  function setCatalogState(nextPartial) {
    state.set(nextPartial);
  }

  function populateProviderSelect(selectElement, preferredValue = '') {
    return catalogUi.populateProviderSelect(getCatalogState().currentProviders, selectElement, preferredValue);
  }

  function getSelectedExternalModelIds() {
    const { currentModels, selectedExternalModelIds } = getCatalogState();
    return catalogUi.getSelectedExternalModelIds(currentModels, selectedExternalModelIds);
  }

  function getSelectedExternalModelTargets() {
    const {
      currentModels,
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks,
    } = getCatalogState();
    return catalogUi.getSelectedExternalModelTargets(
      currentModels,
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks
    );
  }

  function syncExternalModelToggleAll() {
    const { currentModels, selectedExternalModelIds } = getCatalogState();
    return catalogUi.syncExternalModelToggleAll(currentModels, selectedExternalModelIds);
  }

  function setExternalModelSelection(modelId, isSelected) {
    const { currentModels, selectedExternalModelIds } = getCatalogState();
    const nextSelectedExternalModelIds = catalogUi.setExternalModelSelection(
      currentModels,
      selectedExternalModelIds,
      modelId,
      isSelected
    );
    setCatalogState({ selectedExternalModelIds: nextSelectedExternalModelIds });
    return nextSelectedExternalModelIds;
  }

  function setExternalModelPriority(modelId, priorityRank) {
    const { selectedExternalModelPriorityRanks } = getCatalogState();
    const nextSelectedExternalModelPriorityRanks = catalogUi.setExternalModelPriority(
      selectedExternalModelPriorityRanks,
      modelId,
      priorityRank
    );
    setCatalogState({ selectedExternalModelPriorityRanks: nextSelectedExternalModelPriorityRanks });
    return nextSelectedExternalModelPriorityRanks;
  }

  function resetProviderForm() {
    return catalogUi.resetProviderForm();
  }

  function resetModelForm() {
    return catalogUi.resetModelForm(getCatalogState().currentProviders);
  }

  function resetExternalModelForm() {
    const { currentModels, failedModelIds } = getCatalogState();
    const nextSelection = catalogUi.resetExternalModelForm(currentModels, failedModelIds);
    setCatalogState(nextSelection);
    return nextSelection;
  }

  function editProvider(provider) {
    return catalogUi.editProvider(provider);
  }

  function editModel(model) {
    return catalogUi.editModel(model, getCatalogState().currentProviders);
  }

  function editExternalModel(item) {
    const { currentModels, failedModelIds } = getCatalogState();
    const nextSelection = catalogUi.editExternalModel(item, currentModels, failedModelIds);
    setCatalogState(nextSelection);
    return nextSelection;
  }

  function renderProviderTables() {
    const {
      currentExternalModels,
      currentModels,
      currentProviders,
      failedModelIds,
      selectedExternalModelIds,
      selectedExternalModelPriorityRanks,
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
    return nextSelection;
  }

  return {
    editExternalModel,
    editModel,
    editProvider,
    getSelectedExternalModelIds,
    getSelectedExternalModelTargets,
    populateProviderSelect,
    renderProviderTables,
    resetExternalModelForm,
    resetModelForm,
    resetProviderForm,
    setExternalModelSelection,
    setExternalModelPriority,
    syncExternalModelToggleAll,
  };
}
