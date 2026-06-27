import { requestJson as requestJsonValue } from './shared/api.js';
import {
  setBusyState as setBusyValue,
  renderTableActionButton as renderTableActionButtonValue,
} from './shared/action-ui.js';
import { createTimedMessageController } from './shared/form-ui.js';
import {
  escapeHtml as escapeHtmlValue,
  formatDateTime as formatDateTimeValue,
  formatMoney as formatMoneyValue,
  formatNumber as formatNumberValue,
  getPerMillionPrice as getPerMillionPriceValue,
  getStatusBadge as getStatusBadgeValue,
} from './shared/format.js';
import { createCatalogUi } from './admin/catalog-ui.js';
import { createCatalogActions } from './admin/catalog-actions.js';
import { createAccountActions } from './admin/account-actions.js';
import { createAccountUi } from './admin/account-ui.js';
import { createRemoteSyncActions } from './admin/remote-sync.js';
import { createAdminShellActions } from './admin/shell-actions.js';
import { createAdminDataModule } from './admin/data.js';
import { createCatalogStateBridge } from './admin/catalog-state.js';
import { bootstrapAdminPage } from './admin/bootstrap.js';
import { createUsersStatsModule } from './admin/users-stats.js';
import { createSubscriptionModule } from './admin/subscription.js';

function ensureCatalogPricingScaffolding() {
  const modelFormHint = document.getElementById('modelFormHint');
  if (modelFormHint) {
    modelFormHint.textContent = '在某个供应商下定义真实模型和上游接口；对外价格与倍率请在“对外模型”里统一设置。';
  }

  const externalModelFormHint = document.getElementById('externalModelFormHint');
  if (externalModelFormHint) {
    externalModelFormHint.textContent = '一个对外模型名可绑定多个真实模型，并在这里统一设置对外价格与倍率。';
  }

  const modelPricingGroup = document.querySelector('#modelForm .form-grid.three-columns');
  if (modelPricingGroup) {
    modelPricingGroup.hidden = true;
  }

  const modelHeaderRow = document.querySelector('.models-table thead tr');
  if (modelHeaderRow) {
    for (const sortCol of ['inputPrice', 'outputPrice', 'cacheReadPrice', 'cacheWritePrice', 'priceMultiplier']) {
      modelHeaderRow.querySelector(`[data-sort-col="${sortCol}"]`)?.remove();
    }
  }

  const externalModelForm = document.getElementById('externalModelForm');
  const externalModelBindingField = document.getElementById('externalModelSelectionBody')?.closest('.field.full-width');
  if (externalModelForm && externalModelBindingField && !document.getElementById('externalModelPricingCurrency')) {
    const pricingBlock = document.createElement('div');
    pricingBlock.className = 'form-grid three-columns full-width';
    pricingBlock.innerHTML = `
      <label>
        <span>币种</span>
        <input id="externalModelPricingCurrency" type="text" value="USD" />
      </label>
      <label>
        <span>输入 / 1M Token</span>
        <input id="externalModelPricingInput" type="number" step="0.000001" min="0" value="0" />
      </label>
      <label>
        <span>输出 / 1M Token</span>
        <input id="externalModelPricingOutput" type="number" step="0.000001" min="0" value="0" />
      </label>
      <label>
        <span>缓存读取 / 1M</span>
        <input id="externalModelPricingCacheRead" type="number" step="0.000001" min="0" value="0" />
      </label>
      <label>
        <span>缓存写入 / 1M</span>
        <input id="externalModelPricingCacheWrite" type="number" step="0.000001" min="0" value="0" />
      </label>
      <label>
        <span>价格倍率</span>
        <input id="externalModelPriceMultiplier" type="number" step="0.0001" min="0" value="1" />
      </label>
    `;
    externalModelForm.insertBefore(pricingBlock, externalModelBindingField);
  }

  const externalHeaderRow = document.querySelector('.external-models-table thead tr');
  const bindingHeader = externalHeaderRow?.children?.[2] || null;
  if (externalHeaderRow && bindingHeader && !externalHeaderRow.querySelector('[data-sort-col="inputPrice"]')) {
    const headerCells = [
      ['inputPrice', '输入 / 1M'],
      ['outputPrice', '输出 / 1M'],
      ['cacheReadPrice', '缓存读取 / 1M'],
      ['cacheWritePrice', '缓存写入 / 1M'],
      ['priceMultiplier', '倍率'],
    ];
    for (const [sortCol, label] of headerCells) {
      const th = document.createElement('th');
      th.dataset.sortCol = sortCol;
      th.textContent = label;
      externalHeaderRow.insertBefore(th, bindingHeader);
    }
  }
}

ensureCatalogPricingScaffolding();

const adminIdentity = document.getElementById('adminIdentity');
const logoutButton = document.getElementById('logoutButton');
const userForm = document.getElementById('userForm');
const userFormTitle = document.getElementById('userFormTitle');
const userFormHint = document.getElementById('userFormHint');
const userEditUsername = document.getElementById('userEditUsername');
const userCancelEditButton = document.getElementById('userCancelEditButton');
const managedUsername = document.getElementById('managedUsername');
const managedUserRole = document.getElementById('managedUserRole');
const managedUserPassword = document.getElementById('managedUserPassword');
const adminUsersBody = document.getElementById('adminUsersBody');
const managedUserSearch = document.getElementById('managedUserSearch');
const managedUserSearchClearButton = document.getElementById('managedUserSearchClearButton');
const managedUserSearchSummary = document.getElementById('managedUserSearchSummary');
const rechargeRequestsBody = document.getElementById('rechargeRequestsBody');
const paymentSettingsForm = document.getElementById('paymentSettingsForm');
const paymentSettingsEnabled = document.getElementById('paymentSettingsEnabled');
const paymentMinRechargeCny = document.getElementById('paymentMinRechargeCny');
const paymentCnyPerUsd = document.getElementById('paymentCnyPerUsd');
const paymentSettingsRefreshButton = document.getElementById('paymentSettingsRefreshButton');
const paymentSettingsSaveButton = document.getElementById('paymentSettingsSaveButton');
const paymentSettingsUpdatedAt = document.getElementById('paymentSettingsUpdatedAt');
const subscriptionSettingsForm = document.getElementById('subscriptionSettingsForm');
const subscriptionEnabled = document.getElementById('subscriptionEnabled');
const subscriptionQuotaConsumptionEnabled = document.getElementById('subscriptionQuotaConsumptionEnabled');
const subscriptionMonthlyPriceCny = document.getElementById('subscriptionMonthlyPriceCny');
const subscriptionOrdersBody = document.getElementById('subscriptionOrdersBody');
const subscriptionPlanCancelEditButton = document.getElementById('subscriptionPlanCancelEditButton');
const subscriptionPlanDescription = document.getElementById('subscriptionPlanDescription');
const subscriptionPlanEditId = document.getElementById('subscriptionPlanEditId');
const subscriptionPlanEnabled = document.getElementById('subscriptionPlanEnabled');
const subscriptionPlanForm = document.getElementById('subscriptionPlanForm');
const subscriptionPlanFormHint = document.getElementById('subscriptionPlanFormHint');
const subscriptionPlanFormTitle = document.getElementById('subscriptionPlanFormTitle');
const subscriptionPlanLimitsBody = document.getElementById('subscriptionPlanLimitsBody');
const subscriptionPlanMonthlyPriceCny = document.getElementById('subscriptionPlanMonthlyPriceCny');
const subscriptionPlanName = document.getElementById('subscriptionPlanName');
const subscriptionPlanSortOrder = document.getElementById('subscriptionPlanSortOrder');
const subscriptionPlansBody = document.getElementById('subscriptionPlansBody');
const subscriberUsageBody = document.getElementById('subscriberUsageBody');
const usersStatsBody = document.getElementById('usersStatsBody');
const todayUsersStatsBody = document.getElementById('todayUsersStatsBody');
const adminRecentRequestsBody = document.getElementById('adminRecentRequestsBody');
const refreshRecentRequestsButton = document.getElementById('refreshRecentRequestsButton');
const authRefreshButton = document.getElementById('authRefreshButton');
const authLastUpdatedAt = document.getElementById('authLastUpdatedAt');
const authFilesBody = document.getElementById('authFilesBody');
const authUploadForm = document.getElementById('authUploadForm');
const authTargetSelect = document.getElementById('authTargetSelect');
const authFileInput = document.getElementById('authFileInput');
const authUploadButton = document.getElementById('authUploadButton');
const adminNavLinks = Array.from(document.querySelectorAll('[data-admin-nav-link]'));
const adminSections = Array.from(document.querySelectorAll('[data-admin-section]'));
const adminWorkspace = document.querySelector('[data-admin-workspace]');
const usageTabButtons = Array.from(document.querySelectorAll('[data-usage-tab]'));
const usageTabPanels = Array.from(document.querySelectorAll('[data-usage-panel]'));
const subscriptionTabButtons = Array.from(document.querySelectorAll('[data-subscription-tab]'));
const subscriptionTabPanels = Array.from(document.querySelectorAll('[data-subscription-panel]'));
const providersBody = document.getElementById('providersBody');
const modelsBody = document.getElementById('modelsBody');
const adminMessage = document.getElementById('adminMessage');
const providerForm = document.getElementById('providerForm');
const providerFormTitle = document.getElementById('providerFormTitle');
const providerFormHint = document.getElementById('providerFormHint');
const providerCancelEditButton = document.getElementById('providerCancelEditButton');
const providerEditId = document.getElementById('providerEditId');
const providerId = document.getElementById('providerId');
const providerBaseUrl = document.getElementById('providerBaseUrl');
const providerApiKey = document.getElementById('providerApiKey');
const modelForm = document.getElementById('modelForm');
const modelFormTitle = document.getElementById('modelFormTitle');
const modelFormHint = document.getElementById('modelFormHint');
const modelCancelEditButton = document.getElementById('modelCancelEditButton');
const modelEditId = document.getElementById('modelEditId');
const modelId = document.getElementById('modelId');
const modelProviderSelect = document.getElementById('modelProviderSelect');
const modelUpstreamModel = document.getElementById('modelUpstreamModel') || modelId;
const modelUpstreamApi = document.getElementById('modelUpstreamApi');
const externalModelsBody = document.getElementById('externalModelsBody');
const externalModelForm = document.getElementById('externalModelForm');
const externalModelFormTitle = document.getElementById('externalModelFormTitle');
const externalModelFormHint = document.getElementById('externalModelFormHint');
const externalModelCancelEditButton = document.getElementById('externalModelCancelEditButton');
const externalModelEditName = document.getElementById('externalModelEditName');
const externalModelName = document.getElementById('externalModelName');
const externalModelStrategy = document.getElementById('externalModelStrategy');
const externalModelPricingCurrency = document.getElementById('externalModelPricingCurrency');
const externalModelPricingInput = document.getElementById('externalModelPricingInput');
const externalModelPricingOutput = document.getElementById('externalModelPricingOutput');
const externalModelPricingCacheRead = document.getElementById('externalModelPricingCacheRead');
const externalModelPricingCacheWrite = document.getElementById('externalModelPricingCacheWrite');
const externalModelPriceMultiplier = document.getElementById('externalModelPriceMultiplier');
const externalModelSelectionBody = document.getElementById('externalModelSelectionBody');
const externalModelModelIdsToggleAll = document.getElementById('externalModelModelIdsToggleAll');
const testAllModelsButton = document.getElementById('testAllModelsButton');
const userSubmitButton = userForm?.querySelector('button[type="submit"]') || null;
const providerSubmitButton = providerForm?.querySelector('button[type="submit"]') || null;
const modelSubmitButton = modelForm?.querySelector('button[type="submit"]') || null;
const externalModelSubmitButton = externalModelForm?.querySelector('button[type="submit"]') || null;
const remoteHost = document.getElementById('remoteHost');
const remoteUsername = document.getElementById('remoteUsername');
const remotePassword = document.getElementById('remotePassword');
const remoteSyncForm = document.getElementById('remoteSyncForm');
const remoteSyncButton = document.getElementById('remoteSyncButton');

let currentProviders = [];
let currentModels = [];
let currentExternalModels = [];
let currentUsers = [];
let currentStats = null;
let currentSubscription = null;
let currentPaymentSettings = null;
let currentAuthFiles = [];
let currentAuthTargets = [];
let managedUserSearchQuery = '';
const MANAGED_USER_SEARCH_MIN_LENGTH = 1;
let failedModelIds = new Set();
let selectedExternalModelIds = new Set();
let selectedExternalModelPriorityRanks = new Map();
const FALLBACK_AUTH_TARGETS = [
  { id: '1', label: '1' },
  { id: '2', label: '2' },
];
const zhCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const showAdminMessage = createTimedMessageController(adminMessage);

// Per-table sort state: { [tableId]: { col: string, dir: 'asc' | 'desc' } | null }
const tableSortState = {};
const DEFAULT_ADMIN_SECTION_ID = adminSections[0]?.id || '';

function escapeHtml(value) {
  return escapeHtmlValue(value);
}

function formatNumber(value) {
  return formatNumberValue(value);
}

function formatMoney(value, currency = 'USD') {
  return formatMoneyValue(value, currency);
}

function formatBasePrice(pricing, canonicalKey, legacyKey) {
  return formatMoney(getPerMillionPrice(pricing, canonicalKey, legacyKey), pricing?.currency || 'USD');
}

function formatMultiplierCell(pricing) {
  const mult = Number(pricing?.priceMultiplier ?? 1);
  if (!Number.isFinite(mult) || mult <= 0) {
    return '-';
  }
  return `<strong>× ${mult.toFixed(4)}</strong>`;
}

function formatLatency(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '-';
  }

  return `${formatNumber(Math.round(numericValue))} ms`;
}

function formatDateTime(value) {
  return formatDateTimeValue(value);
}

function formatAuthDateTime(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const pad = (part) => String(part).padStart(2, '0');
  return [
    parsed.getFullYear(),
    pad(parsed.getMonth() + 1),
    pad(parsed.getDate()),
  ].join('-') + ` ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function formatAuthDate(value) {
  const full = formatAuthDateTime(value);
  return full === '-' ? full : full.slice(0, 10);
}

function compareTextAsc(left, right) {
  return zhCollator.compare(String(left || ''), String(right || ''));
}

function getTimeValue(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareDateDesc(left, right) {
  return getTimeValue(right) - getTimeValue(left);
}

function setActiveAdminNav(sectionId) {
  const nextSectionId = adminSections.some((section) => section.id === sectionId)
    ? sectionId
    : DEFAULT_ADMIN_SECTION_ID;

  for (const link of adminNavLinks) {
    const isActive = link.dataset.adminNavLink === nextSectionId;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

function getAdminSectionIdFromHash(hash = window.location.hash) {
  const normalizedHash = String(hash || '').replace(/^#/, '').trim();
  return adminSections.some((section) => section.id === normalizedHash)
    ? normalizedHash
    : DEFAULT_ADMIN_SECTION_ID;
}

function showAdminSection(sectionId, options = {}) {
  if (!adminSections.length) {
    return DEFAULT_ADMIN_SECTION_ID;
  }

  const {
    updateHash = false,
    preserveScroll = false,
  } = options;
  const nextSectionId = getAdminSectionIdFromHash(sectionId);

  for (const section of adminSections) {
    const isActive = section.id === nextSectionId;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
    section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }

  setActiveAdminNav(nextSectionId);

  if (updateHash) {
    const nextHash = `#${nextSectionId}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }

  if (!preserveScroll) {
    if (adminWorkspace) {
      adminWorkspace.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return nextSectionId;
}

function syncAdminNavWithScroll() {
  return showAdminSection(getAdminSectionIdFromHash(), {
    updateHash: false,
    preserveScroll: true,
  });
}

function activateUsageTab(tabName = 'total') {
  const nextTabName = usageTabButtons.some((button) => button.dataset.usageTab === tabName)
    ? tabName
    : 'total';

  for (const button of usageTabButtons) {
    const isActive = button.dataset.usageTab === nextTabName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of usageTabPanels) {
    const isActive = panel.dataset.usagePanel === nextTabName;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  }
}

function initUsageTabs() {
  if (!usageTabButtons.length || !usageTabPanels.length) {
    return;
  }

  for (const button of usageTabButtons) {
    button.addEventListener('click', () => {
      activateUsageTab(button.dataset.usageTab);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const currentIndex = usageTabButtons.indexOf(button);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextButton = usageTabButtons[(currentIndex + offset + usageTabButtons.length) % usageTabButtons.length];
      activateUsageTab(nextButton.dataset.usageTab);
      nextButton.focus();
    });
  }

  activateUsageTab(usageTabButtons.find((button) => button.classList.contains('is-active'))?.dataset.usageTab || 'total');
}

initUsageTabs();

function activateSubscriptionTab(tabName = 'plans') {
  const nextTabName = subscriptionTabButtons.some((button) => button.dataset.subscriptionTab === tabName)
    ? tabName
    : 'plans';

  for (const button of subscriptionTabButtons) {
    const isActive = button.dataset.subscriptionTab === nextTabName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const panel of subscriptionTabPanels) {
    const isActive = panel.dataset.subscriptionPanel === nextTabName;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  }
}

function initSubscriptionTabs() {
  if (!subscriptionTabButtons.length || !subscriptionTabPanels.length) {
    return;
  }

  for (const button of subscriptionTabButtons) {
    button.addEventListener('click', () => {
      activateSubscriptionTab(button.dataset.subscriptionTab);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const currentIndex = subscriptionTabButtons.indexOf(button);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextButton = subscriptionTabButtons[(currentIndex + offset + subscriptionTabButtons.length) % subscriptionTabButtons.length];
      activateSubscriptionTab(nextButton.dataset.subscriptionTab);
      nextButton.focus();
    });
  }

  activateSubscriptionTab(subscriptionTabButtons.find((button) => button.classList.contains('is-active'))?.dataset.subscriptionTab || 'plans');
}

initSubscriptionTabs();

function compareUsersByRole(a, b) {
  const roleWeight = {
    admin: 0,
    user: 1,
  };
  const roleDiff = (roleWeight[a?.role] ?? 99) - (roleWeight[b?.role] ?? 99);

  if (roleDiff !== 0) {
    return roleDiff;
  }

  return String(a?.username || '').localeCompare(String(b?.username || ''), 'zh-CN');
}

function compareProviders(a, b) {
  return compareTextAsc(a?.id, b?.id);
}

function compareModels(a, b) {
  const providerDiff = compareTextAsc(a?.providerName || a?.providerId, b?.providerName || b?.providerId);
  if (providerDiff !== 0) {
    return providerDiff;
  }

  return compareTextAsc(getModelDisplayName(a), getModelDisplayName(b));
}

function compareExternalModels(a, b) {
  const nameDiff = compareTextAsc(
    a?.externalModelName || a?.name,
    b?.externalModelName || b?.name
  );
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return compareTextAsc(a?.strategy, b?.strategy);
}

function compareRechargeOrders(a, b) {
  const timeDiff = compareDateDesc(a?.createdAt, b?.createdAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return compareTextAsc(a?.username, b?.username);
}

function compareRecentRequestsByTime(a, b) {
  const timeDiff = compareDateDesc(a?.timestamp, b?.timestamp);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return compareTextAsc(a?.username, b?.username);
}

function compareUserStats(a, b) {
  const roleDiff = compareUsersByRole(a, b);

  if (roleDiff !== 0) {
    return roleDiff;
  }

  if (Number(b?.totalCost || 0) !== Number(a?.totalCost || 0)) {
    return Number(b?.totalCost || 0) - Number(a?.totalCost || 0);
  }

  return String(a?.username || '').localeCompare(String(b?.username || ''), 'zh-CN');
}

function getModelDisplayName(model) {
  return String(model?.upstreamModel || model?.id || '').trim();
}

function getCellValue(item, col) {
  switch (col) {
    // managed users table
    case 'username': return String(item.username || '');
    case 'role': return item.role === 'admin' ? '1' : '0';
    // recharge requests
    case 'createdAt': return getTimeValue(item.createdAt);
    case 'status': return String(item.status || '');
    case 'amountUsd': return Number(item.amountUsd || 0);
    case 'amountCny': return Number(item.amountCny || 0);
    case 'reviewedBy': return String(item.reviewedBy || '');
    case 'approvedExpiresAt': return getTimeValue(item.approvedExpiresAt);
    case 'subscriptionStatus': return String(item.status || '');
    case 'planName': return String(item.planName || item.currentPlan?.name || '');
    case 'name': return String(item.externalModelName || item.name || '');
    case 'monthlyPriceCny': return Number(item.monthlyPriceCny || 0);
    case 'enabled': return item.enabled === false ? '0' : '1';
    case 'sortOrder': return Number(item.sortOrder || 0);
    case 'updatedAt': return getTimeValue(item.updatedAt);
    // user stats
    case 'requests': return Number(item.requests || 0);
    case 'successRequests': return Number(item.successRequests || 0);
    case 'failedRequests': return Number(item.failedRequests || 0);
    case 'totalCost': return Number(item.totalCost || 0);
    case 'lastUsedAt': return getTimeValue(item.lastUsedAt);
    case 'subscriptionExpiresAt': return getTimeValue(item.expiresAt);
    // recent requests
    case 'timestamp': return getTimeValue(item.timestamp);
    case 'providerName': return String(item.providerName || item.providerId || '');
    case 'modelName': return String(item.modelName || item.modelId || '');
    case 'success': return item.success ? '1' : '0';
    case 'latencyMs': return Number(item.latencyMs || 0);
    // providers
    case 'providerId': return String(item.id || '');
    case 'apiBaseUrl': return String(item.apiBaseUrl || '');
    // models
    case 'model': return getModelDisplayName(item);
    case 'provider': return String(item.providerName || item.providerId || '');
    case 'upstreamApi': return String(item.upstreamApi || '');
    case 'inputPrice': return getPerMillionPrice(item.displayPricing || item.pricing, 'inputPerMillionTokens', 'inputPer1kTokens');
    case 'outputPrice': return getPerMillionPrice(item.displayPricing || item.pricing, 'outputPerMillionTokens', 'outputPer1kTokens');
    case 'cacheReadPrice': return getPerMillionPrice(item.displayPricing || item.pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens');
    case 'cacheWritePrice': return getPerMillionPrice(item.displayPricing || item.pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens');
    case 'priceMultiplier': return Number((item.displayPricing || item.pricing)?.priceMultiplier ?? 7.5);
    case 'latency': return Number(item.connectivityStatus?.latencyMs || 0);
    // external models
    case 'externalModelName': return String(item.externalModelName || item.name || '');
    case 'strategy': return String(item.strategy || '');
    default: return '';
  }
}

function compareByCol(a, b, col, dir) {
  const va = getCellValue(a, col);
  const vb = getCellValue(b, col);

  let result;
  if (typeof va === 'number' && typeof vb === 'number') {
    result = va - vb;
  } else if (typeof va === 'number' || typeof vb === 'number') {
    result = typeof va === 'number' ? -1 : 1;
  } else {
    result = zhCollator.compare(String(va), String(vb));
  }

  return dir === 'desc' ? -result : result;
}

function applyTableSort(items, tableId) {
  const state = tableSortState[tableId];
  if (!state) {
    return items;
  }
  return [...items].sort((a, b) => compareByCol(a, b, state.col, state.dir));
}

function initTableSort(tableId, tbodyId, renderFn) {
  const thead = document.getElementById(tableId)?.closest('table')?.querySelector('thead');
  if (!thead) return;

  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort-col]');
    if (!th) return;

    const col = th.dataset.sortCol;
    const state = tableSortState[tableId];

    if (state?.col === col) {
      if (state.dir === 'asc') {
        tableSortState[tableId] = { col, dir: 'desc' };
      } else {
        delete tableSortState[tableId];
      }
    } else {
      tableSortState[tableId] = { col, dir: 'asc' };
    }

    updateSortIndicators(thead, tableSortState[tableId]);
    renderFn();
  });
}

function updateSortIndicators(thead, state) {
  for (const th of thead.querySelectorAll('th')) {
    th.classList.toggle('sort-asc', state?.col === th.dataset.sortCol && state?.dir === 'asc');
    th.classList.toggle('sort-desc', state?.col === th.dataset.sortCol && state?.dir === 'desc');
  }
}

function getModelOptionLabel(model) {
  const providerName = String(model?.providerName || model?.providerId || '').trim();
  const modelName = getModelDisplayName(model);
  const upstreamApiLabel = String(model?.upstreamApiLabel || getUpstreamApiLabel(model?.upstreamApi) || '').trim();

  if (!providerName) {
    return upstreamApiLabel ? `${modelName} / ${upstreamApiLabel}` : modelName;
  }

  if (!modelName) {
    return upstreamApiLabel ? `${providerName} / ${upstreamApiLabel}` : providerName;
  }

  return upstreamApiLabel
    ? `${providerName} / ${modelName} / ${upstreamApiLabel}`
    : `${providerName} / ${modelName}`;
}

function renderTableActionButton({ action, label, icon, tone = '', attrs = {} }) {
  return renderTableActionButtonValue({ action, label, icon, tone, attrs });
}

const usersStatsModule = createUsersStatsModule({
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
});

function normalizeManagedUserSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function getManagedUserSearchText(user = {}) {
  const roleLabel = user.role === 'admin' ? '管理员 admin' : '用户 user';
  return [
    user.username,
    user.role,
    roleLabel,
  ].filter(Boolean).join(' ').toLowerCase();
}

function getFilteredManagedUsers(items = []) {
  const query = normalizeManagedUserSearch(managedUserSearchQuery);
  if (!query || query.length < MANAGED_USER_SEARCH_MIN_LENGTH) {
    return items;
  }

  return items.filter((item) => getManagedUserSearchText(item).includes(query));
}

function updateManagedUserSearchSummary(totalCount, visibleCount) {
  const query = normalizeManagedUserSearch(managedUserSearchQuery);
  if (managedUserSearchSummary) {
    managedUserSearchSummary.textContent = query
      ? `已筛选 ${visibleCount} / ${totalCount} 个账号`
      : `显示全部 ${totalCount} 个账号`;
  }
  if (managedUserSearchClearButton) {
    managedUserSearchClearButton.hidden = !query;
  }
}

function renderManagedUsersView(items = currentUsers) {
  const users = Array.isArray(items) ? items : [];
  const filteredUsers = getFilteredManagedUsers(users);
  const query = normalizeManagedUserSearch(managedUserSearchQuery);
  usersStatsModule.renderManagedUsers(filteredUsers, {
    isFiltered: Boolean(query),
    query: managedUserSearchQuery,
  });
  updateManagedUserSearchSummary(users.length, filteredUsers.length);
}

function bindManagedUserSearch() {
  if (managedUserSearch) {
    managedUserSearch.addEventListener('input', () => {
      managedUserSearchQuery = managedUserSearch.value;
      renderManagedUsersView(currentUsers);
    });
  }

  if (managedUserSearchClearButton) {
    managedUserSearchClearButton.addEventListener('click', () => {
      managedUserSearchQuery = '';
      if (managedUserSearch) {
        managedUserSearch.value = '';
        managedUserSearch.focus();
      }
      renderManagedUsersView(currentUsers);
    });
  }
}

const accountUi = createAccountUi({
  elements: {
    managedUserPassword,
    managedUsername,
    managedUserRole,
    userCancelEditButton,
    userEditUsername,
    userForm,
    userFormHint,
    userFormTitle,
    userSubmitButton,
  },
});
const catalogUi = createCatalogUi({
  elements: {
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
  },
  helpers: {
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
  },
});
const catalogState = createCatalogStateBridge({
  catalogUi,
  state: {
    get() {
      return {
        currentExternalModels,
        currentModels,
        currentProviders,
        failedModelIds,
        selectedExternalModelIds,
        selectedExternalModelPriorityRanks,
      };
    },
    set(nextPartial) {
      if (Object.prototype.hasOwnProperty.call(nextPartial, 'selectedExternalModelIds')) {
        selectedExternalModelIds = nextPartial.selectedExternalModelIds;
      }
      if (Object.prototype.hasOwnProperty.call(nextPartial, 'selectedExternalModelPriorityRanks')) {
        selectedExternalModelPriorityRanks = nextPartial.selectedExternalModelPriorityRanks;
      }
    },
  },
});
const adminData = createAdminDataModule({
  elements: {
    adminIdentity,
    modelProviderSelect,
  },
  helpers: {
    compareExternalModels,
    compareModels,
    compareProviders,
    populateProviderSelect: catalogState.populateProviderSelect,
    renderManagedUsers: renderManagedUsersView,
    renderProviderTables: catalogState.renderProviderTables,
    renderRecentRequests: usersStatsModule.renderRecentRequests,
    renderRechargeRequests: usersStatsModule.renderRechargeRequests,
    renderSubscriberUsage: (...args) => subscriptionModule.renderSubscriberUsage(...args),
    renderTodayUserStats: usersStatsModule.renderTodayUserStats,
    renderSubscriptionOrders: (...args) => subscriptionModule.renderSubscriptionOrders(...args),
    renderSubscriptionPlans: (...args) => subscriptionModule.renderSubscriptionPlans(...args),
    renderSubscriptionSettings: () => subscriptionModule.renderSubscriptionSettings(),
    renderUserStats: usersStatsModule.renderUserStats,
    requestJson,
    state: {
      get() {
        return {
          currentExternalModels,
          currentModels,
          currentProviders,
          currentStats,
          currentSubscription,
          currentUsers,
          failedModelIds,
        };
      },
      set(nextPartial) {
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentExternalModels')) {
          currentExternalModels = nextPartial.currentExternalModels;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentModels')) {
          currentModels = nextPartial.currentModels;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentProviders')) {
          currentProviders = nextPartial.currentProviders;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentStats')) {
          currentStats = nextPartial.currentStats;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentSubscription')) {
          currentSubscription = nextPartial.currentSubscription;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'currentUsers')) {
          currentUsers = nextPartial.currentUsers;
        }
        if (Object.prototype.hasOwnProperty.call(nextPartial, 'failedModelIds')) {
          failedModelIds = nextPartial.failedModelIds;
        }
      },
    },
  },
});
const subscriptionModule = createSubscriptionModule({
  elements: {
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
  },
  helpers: {
    applyTableSort,
    escapeHtml,
    formatDateTime,
    formatMoney,
    getStatusBadge,
    refreshAdminData: () => adminData.refreshAdminData(),
    renderTableActionButton,
    requestJson,
    setBusy,
    showMessage,
    state: {
      get() {
        return {
          currentExternalModels,
          currentSubscription,
        };
      },
    },
  },
});
const catalogActions = createCatalogActions({
  elements: {
    externalModelForm,
    externalModelSelectionBody,
    externalModelModelIdsToggleAll,
    externalModelsBody,
    modelForm,
    modelsBody,
    providerForm,
    providersBody,
    testAllModelsButton,
  },
  helpers: {
    applyModelConnectivityResult,
    catalogUi,
    formatLatency,
    loadProviders: adminData.loadProviders,
    refreshAdminData: adminData.refreshAdminData,
    requestJson,
    setBusy,
    showMessage,
    state: {
      get() {
        return {
          currentExternalModels,
          currentModels,
          currentProviders,
          failedModelIds,
          refs: {
            externalModelEditName,
            externalModelName,
            externalModelPriceMultiplier,
            externalModelPricingCacheRead,
            externalModelPricingCacheWrite,
            externalModelPricingCurrency,
            externalModelPricingInput,
            externalModelPricingOutput,
            externalModelStrategy,
            modelEditId,
            modelId,
            modelProviderSelect,
            modelUpstreamApi,
            numberValue,
            providerApiKey,
            providerBaseUrl,
            providerEditId,
            providerId,
          },
          resetExternalModelForm: catalogState.resetExternalModelForm,
          resetModelForm: catalogState.resetModelForm,
          resetProviderForm: catalogState.resetProviderForm,
          selectedExternalModelIds,
          selectedExternalModelPriorityRanks,
          editExternalModel: catalogState.editExternalModel,
          editModel: catalogState.editModel,
          editProvider: catalogState.editProvider,
          getSelectedExternalModelIds: catalogState.getSelectedExternalModelIds,
          getSelectedExternalModelTargets: catalogState.getSelectedExternalModelTargets,
          setExternalModelSelection: catalogState.setExternalModelSelection,
          setExternalModelPriority: catalogState.setExternalModelPriority,
          syncExternalModelToggleAll: catalogState.syncExternalModelToggleAll,
        };
      },
      set(partial) {
        if (Object.prototype.hasOwnProperty.call(partial, 'failedModelIds')) {
          failedModelIds = partial.failedModelIds;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'selectedExternalModelIds')) {
          selectedExternalModelIds = partial.selectedExternalModelIds;
        }
        if (Object.prototype.hasOwnProperty.call(partial, 'selectedExternalModelPriorityRanks')) {
          selectedExternalModelPriorityRanks = partial.selectedExternalModelPriorityRanks;
        }
      },
    },
  },
});
const accountActions = createAccountActions({
  elements: {
    adminUsersBody,
    rechargeRequestsBody,
    userForm,
    usersStatsBody,
  },
  helpers: {
    formatMoney,
    loadStats: adminData.loadStats,
    loadUsers: adminData.loadUsers,
    requestJson,
    setBusy,
    showMessage,
    state: {
      get() {
        return {
          currentUsers,
          editUser: accountUi.editUser,
          refs: {
            managedUsername,
            managedUserPassword,
            managedUserRole,
            userEditUsername,
          },
          resetUserForm: accountUi.resetUserForm,
        };
      },
    },
  },
});
const remoteSyncActions = createRemoteSyncActions({
  elements: {
    remoteHost,
    remotePassword,
    remoteSyncButton,
    remoteSyncForm,
    remoteUsername,
  },
  helpers: {
    refreshAdminData: adminData.refreshAdminData,
    requestJson,
    setBusy,
    showMessage,
  },
});
const adminShellActions = createAdminShellActions({
  elements: {
    adminNavLinks,
    externalModelCancelEditButton,
    logoutButton,
    modelCancelEditButton,
    providerCancelEditButton,
    refreshRecentRequestsButton,
    userCancelEditButton,
  },
  helpers: {
    loadRecentRequests: adminData.loadRecentRequests,
    requestJson,
    resetExternalModelForm: catalogState.resetExternalModelForm,
    resetModelForm: catalogState.resetModelForm,
    resetProviderForm: catalogState.resetProviderForm,
    resetUserForm: accountUi.resetUserForm,
    showAdminSection,
    setBusy,
    showMessage,
    syncAdminNavWithScroll,
  },
});

function showMessage(message, isError = false) {
  showAdminMessage(message, isError);
}

function setBusy(element, isBusy, label) {
  setBusyValue(element, isBusy, label);
}

function renderPaymentSettings(settings = {}) {
  if (!paymentSettingsForm) {
    return;
  }

  currentPaymentSettings = settings;
  if (paymentSettingsEnabled) {
    paymentSettingsEnabled.checked = settings.enabled !== false;
  }
  if (paymentMinRechargeCny) {
    paymentMinRechargeCny.value = Number(settings.minRechargeCny || 10).toString();
  }
  if (paymentCnyPerUsd) {
    paymentCnyPerUsd.value = Number(settings.cnyPerUsd || 7).toString();
  }
  if (paymentSettingsUpdatedAt) {
    paymentSettingsUpdatedAt.textContent = settings.updatedAt
      ? `最近更新：${formatAuthDateTime(settings.updatedAt)}`
      : '最近更新时间不可用';
  }
}


async function loadPaymentSettings({ silent = false } = {}) {
  if (!paymentSettingsForm) {
    return;
  }

  setBusy(paymentSettingsRefreshButton, true, '加载中...');
  try {
    const data = await requestJson('/api/admin/payment-settings');
    renderPaymentSettings(data);
    if (!silent) {
      showMessage('充值设置已刷新。');
    }
  } catch (error) {
    if (paymentSettingsUpdatedAt) {
      paymentSettingsUpdatedAt.textContent = '加载失败';
    }
    if (!silent) {
      showMessage(`加载充值设置失败：${error.message || error}`, true);
    }
  } finally {
    setBusy(paymentSettingsRefreshButton, false);
  }
}

async function savePaymentSettings(event) {
  event.preventDefault();
  if (!paymentSettingsForm) {
    return;
  }

  try {
    setBusy(paymentSettingsSaveButton, true, '保存中...');
    const data = await requestJson('/api/admin/payment-settings', {
      method: 'PUT',
      body: JSON.stringify({
        enabled: Boolean(paymentSettingsEnabled?.checked),
        minRechargeCny: Number(paymentMinRechargeCny?.value),
        cnyPerUsd: Number(paymentCnyPerUsd?.value),
      }),
    });
    renderPaymentSettings(data);
    showMessage('充值设置已保存。');
  } catch (error) {
    showMessage(error.message || String(error), true);
  } finally {
    setBusy(paymentSettingsSaveButton, false);
  }
}

function getAuthLifecycleBadge(lifecycle = {}) {
  switch (lifecycle.status) {
    case 'active':
      return getStatusBadge(lifecycle.label || '有效', 'success');
    case 'expiring':
      return getStatusBadge(lifecycle.label || '即将到期', 'warning');
    case 'expired':
    case 'disabled':
      return getStatusBadge(lifecycle.label || '不可用', 'danger');
    default:
      return getStatusBadge(lifecycle.label || '未提供', 'muted');
  }
}

function renderAuthQuotaCell(quota = {}, fallbackMessage = '') {
  const remainingPercent = Number(quota.remainingPercent);
  if (!Number.isFinite(remainingPercent)) {
    return `
      <div class="field-note">${escapeHtml(quota.message || fallbackMessage || '暂无额度数据')}</div>
    `;
  }

  const barClass = remainingPercent <= 0
    ? ' is-empty'
    : remainingPercent <= 25
      ? ' is-warn'
      : '';
  const resetAt = quota.resetAt ? formatAuthDateTime(quota.resetAt) : '-';
  const percentText = Number.isInteger(remainingPercent)
    ? String(remainingPercent)
    : remainingPercent.toFixed(1);

  return `
    <div class="auth-quota-bar${barClass}" style="--quota: ${remainingPercent}%;"><span></span></div>
    <div class="field-note">剩余 ${escapeHtml(percentText)}%；重置：${escapeHtml(resetAt)}</div>
  `;
}

function renderAuthTargetOptions(authTargets = []) {
  if (!authTargetSelect) {
    return;
  }

  if (!authTargets.length) {
    authTargetSelect.innerHTML = '<option value="">暂无可用授权目录</option>';
    authTargetSelect.disabled = true;
    if (authUploadButton) {
      authUploadButton.disabled = true;
    }
    return;
  }

  const previousValue = authTargetSelect.value;
  authTargetSelect.innerHTML = authTargets.map((target) => `
    <option value="${escapeHtml(target.id)}">${escapeHtml(target.label || target.id)}</option>
  `).join('');
  if (authTargets.some((target) => target.id === previousValue)) {
    authTargetSelect.value = previousValue;
  }
  authTargetSelect.disabled = false;
  if (authUploadButton) {
    authUploadButton.disabled = false;
  }
}

function renderAuthFiles(authFiles = []) {
  if (!authFilesBody) {
    return;
  }

  if (!authFiles.length) {
    authFilesBody.innerHTML = '<tr><td colspan="6" class="muted">没有扫描到 auth 文件。</td></tr>';
    return;
  }

  authFilesBody.innerHTML = authFiles.map((item) => {
    const lifecycle = item.lifecycle || {};
    const account = item.account || {};
    const quota = item.quota || {};
    const lifecycleDetail = lifecycle.expiresAt
      ? `订阅到期：${formatAuthDate(lifecycle.expiresAt)}`
      : lifecycle.detail || 'auth 文件未包含订阅到期时间';
    const accountNoteParts = [
      account.providerLabel || '未知类型',
      account.planType,
      item.usageError ? `额度：${item.usageError}` : '',
    ].filter(Boolean);
    const accountLabel = account.email || item.fileName || '-';

    return `
      <tr>
        <td><code class="table-code">${escapeHtml(item.fileName || '-')}</code></td>
        <td>
          <strong>${escapeHtml(accountLabel)}</strong>
          <div class="field-note">${escapeHtml(accountNoteParts.join(' / ') || '-')}</div>
        </td>
        <td>
          ${getAuthLifecycleBadge(lifecycle)}
          <div class="field-note">${escapeHtml(lifecycleDetail)}</div>
        </td>
        <td>${renderAuthQuotaCell(quota.fiveHour, item.usageError)}</td>
        <td>${renderAuthQuotaCell(quota.sevenDay, item.usageError)}</td>
        <td>
          ${renderTableActionButton({
            action: 'delete-auth-file',
            label: '删除 auth 文件',
            icon: 'delete',
            tone: 'danger',
            attrs: {
              targetId: item.targetId || '',
              fileName: item.fileName || '',
            },
          })}
        </td>
      </tr>
    `;
  }).join('');
}

function getAuthLoadErrorMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 401) {
    return '登录状态已失效，请刷新页面后重新登录。';
  }
  if (status > 0) {
    return `${error.message || '请求失败'}（HTTP ${status}）`;
  }
  return error?.message || String(error || '请求失败');
}

async function requestAuthFilesWithRetry() {
  try {
    return await requestJson('/api/admin/auth-files');
  } catch (error) {
    const shouldRetry = Number(error?.status || 0) === 401 || Number(error?.status || 0) === 0;
    if (!shouldRetry) {
      throw error;
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, 600);
    });
    return requestJson('/api/admin/auth-files');
  }
}

async function loadAuthFiles({ silent = false } = {}) {
  if (!authFilesBody) {
    return;
  }

  setBusy(authRefreshButton, true, '刷新中...');
  try {
    const data = await requestAuthFilesWithRetry();
    currentAuthFiles = data.authFiles || [];
    currentAuthTargets = data.authTargets || [];
    renderAuthTargetOptions(currentAuthTargets);
    renderAuthFiles(currentAuthFiles);
    if (authLastUpdatedAt) {
      authLastUpdatedAt.textContent = `刷新于 ${formatAuthDateTime(data.scannedAt || new Date().toISOString())}`;
    }
    if (!silent) {
      showMessage('Auth 管理数据已刷新。');
    }
  } catch (error) {
    const message = getAuthLoadErrorMessage(error);
    if (!currentAuthTargets.length) {
      currentAuthTargets = [...FALLBACK_AUTH_TARGETS];
      renderAuthTargetOptions(currentAuthTargets);
    }
    authFilesBody.innerHTML = `
      <tr>
        <td colspan="6" class="muted">加载 auth 文件失败：${escapeHtml(message)}</td>
      </tr>
    `;
    if (!silent) {
      showMessage(`加载 Auth 管理数据失败：${message}`, true);
    }
  } finally {
    setBusy(authRefreshButton, false);
  }
}

async function uploadAuthFile(event) {
  event.preventDefault();
  if (!authTargetSelect || !authFileInput) {
    return;
  }

  const targetId = authTargetSelect.value;
  const file = authFileInput.files?.[0];
  if (!targetId) {
    showMessage('请选择目标授权目录。', true);
    return;
  }
  if (!file) {
    showMessage('请选择要添加的 auth JSON 文件。', true);
    return;
  }

  try {
    setBusy(authUploadButton, true, '添加中...');
    await requestJson('/api/admin/auth-files', {
      method: 'POST',
      body: JSON.stringify({
        targetId,
        fileName: file.name,
        content: await file.text(),
      }),
    });
    authUploadForm.reset();
    await loadAuthFiles({ silent: true });
    showMessage('auth 文件已添加。');
  } catch (error) {
    showMessage(error.message || String(error), true);
  } finally {
    setBusy(authUploadButton, false);
  }
}

async function deleteAuthFile(button) {
  const targetId = button.dataset.targetId || '';
  const fileName = button.dataset.fileName || '';
  const authFile = currentAuthFiles.find((item) => item.targetId === targetId && item.fileName === fileName);
  if (!authFile) {
    return;
  }

  if (!window.confirm(`确认删除 auth 文件“${authFile.fileName}”吗？删除后 CLIProxyAPI 将无法继续使用这个授权文件。`)) {
    return;
  }

  try {
    setBusy(button, true, '删除中...');
    await requestJson('/api/admin/auth-files', {
      method: 'DELETE',
      body: JSON.stringify({
        targetId,
        fileName,
      }),
    });
    await loadAuthFiles({ silent: true });
    showMessage('auth 文件已删除。');
  } catch (error) {
    showMessage(error.message || String(error), true);
  } finally {
    setBusy(button, false);
  }
}

function numberValue(input) {
  const value = Number(input?.value);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function getPerMillionPrice(pricing = {}, canonicalKey, legacyKey) {
  return getPerMillionPriceValue(pricing, canonicalKey, legacyKey);
}

function getStatusBadge(label, tone = 'muted') {
  return getStatusBadgeValue(label, tone);
}

function getUpstreamApiLabel(value) {
  switch (String(value || '')) {
    case 'chat_completions':
      return 'OpenAI Chat Completions API';
    case 'responses':
      return 'OpenAI Responses API';
    case 'messages':
      return 'Anthropic Messages API';
    default:
      return value || '-';
  }
}

async function requestJson(url, options = {}) {
  return requestJsonValue(url, options);
}

function applyModelConnectivityResult(modelId, result = {}) {
  currentModels = currentModels.map((model) => {
    if (model.id !== modelId) {
      return model;
    }

    return {
      ...model,
      connectivityStatus: {
        ...(model.connectivityStatus || {}),
        status: result.ok ? 'ok' : 'failed',
        testedAt: new Date().toISOString(),
        message: result.message || result.preview || '',
        statusCode: Number(result.status || 0),
        latencyMs: Number(result.latencyMs || 0),
      },
    };
  });
}

adminShellActions.bindShellActions();
catalogActions.bindCatalogActions();
accountActions.bindAccountActions();
bindManagedUserSearch();
remoteSyncActions.bindRemoteSyncActions();
subscriptionModule.bindSubscriptionActions();

if (paymentSettingsRefreshButton) {
  paymentSettingsRefreshButton.addEventListener('click', () => loadPaymentSettings());
}

if (paymentSettingsForm) {
  paymentSettingsForm.addEventListener('submit', savePaymentSettings);
}


if (authRefreshButton) {
  authRefreshButton.addEventListener('click', () => loadAuthFiles());
}

if (authUploadForm) {
  authUploadForm.addEventListener('submit', uploadAuthFile);
}

if (authFilesBody) {
  authFilesBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="delete-auth-file"]');
    if (!button) {
      return;
    }
    deleteAuthFile(button);
  });
}

loadPaymentSettings({ silent: true });
loadAuthFiles({ silent: true });

bootstrapAdminPage({
  elements: {
    adminIdentity,
    adminRecentRequestsBody,
    adminUsersBody,
    externalModelsBody,
    modelsBody,
    providersBody,
    rechargeRequestsBody,
    subscriberUsageBody,
    subscriptionOrdersBody,
    todayUsersStatsBody,
    usersStatsBody,
  },
  helpers: {
    ensureAdminSession: adminData.ensureAdminSession,
    initTableSort,
    refreshAdminData: adminData.refreshAdminData,
    renderManagedUsers: renderManagedUsersView,
    renderProviderTables: catalogState.renderProviderTables,
    renderRecentRequests: usersStatsModule.renderRecentRequests,
    renderRechargeRequests: usersStatsModule.renderRechargeRequests,
    renderSubscriberUsage: subscriptionModule.renderSubscriberUsage,
    renderTodayUserStats: usersStatsModule.renderTodayUserStats,
    renderSubscriptionOrders: subscriptionModule.renderSubscriptionOrders,
    renderSubscriptionSettings: subscriptionModule.renderSubscriptionSettings,
    renderUserStats: usersStatsModule.renderUserStats,
    resets: {
      resetExternalModelForm: catalogState.resetExternalModelForm,
      resetModelForm: catalogState.resetModelForm,
      resetProviderForm: catalogState.resetProviderForm,
      resetUserForm: accountUi.resetUserForm,
    },
    state: {
      get() {
        return {
          currentStats,
          currentSubscription,
          currentUsers,
        };
      },
    },
    syncAdminNavWithScroll,
  },
});
