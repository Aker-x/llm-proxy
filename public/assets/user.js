import { requestJson as requestJsonValue } from './shared/api.js';
import {
  renderTableActionButton as renderTableActionButtonValue,
  setBusyState as setBusyValue,
} from './shared/action-ui.js';
import { createTimedMessageController } from './shared/form-ui.js';
import {
  escapeHtml as escapeHtmlValue,
  formatDateTime as formatDateTimeValue,
  formatMoney as formatMoneyValue,
  formatNumber as formatNumberValue,
  formatPriceWithMultiplier as formatPriceWithMultiplierValue,
  getPerMillionPrice as getPerMillionPriceValue,
  getStatusBadge as getStatusBadgeValue,
} from './shared/format.js';
import { copyTextToClipboard } from './shared/clipboard.js';
import { createUserRenderingModule } from './user/rendering.js';
import { createUserActions } from './user/actions.js';
import { createUserDataModule } from './user/data.js';

const userIdentity = document.getElementById('userIdentity');
const logoutButton = document.getElementById('logoutButton');
const refreshUserStatsButton = document.getElementById('refreshUserStatsButton');
const passwordForm = document.getElementById('passwordForm');
const currentPasswordInput = document.getElementById('currentPasswordInput');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
const updatePasswordButton = document.getElementById('updatePasswordButton');
const apiKeyForm = document.getElementById('apiKeyForm');
const apiKeyNameInput = document.getElementById('apiKeyNameInput');
const createApiKeyButton = document.getElementById('createApiKeyButton');
const apiKeysBody = document.getElementById('apiKeysBody');
const newApiKeyPanel = document.getElementById('newApiKeyPanel');
const newApiKeyValue = document.getElementById('newApiKeyValue');
const copyNewApiKeyButton = document.getElementById('copyNewApiKeyButton');
const userStatsSummary = document.getElementById('userStatsSummary');
const subscriptionSummary = document.getElementById('subscriptionSummary');
const subscriptionMeta = document.getElementById('subscriptionMeta');
const subscriptionLimitSummary = document.getElementById('subscriptionLimitSummary');
const subscriptionFallbackPreferences = document.getElementById('subscriptionFallbackPreferences');
const subscriptionPlansList = document.getElementById('subscriptionPlansList');
const subscriptionForm = document.getElementById('subscriptionForm');
const subscriptionNoteInput = document.getElementById('subscriptionNoteInput');
const createSubscriptionButton = document.getElementById('createSubscriptionButton');
const subscriptionOrdersBody = document.getElementById('subscriptionOrdersBody');
const subscriptionPaymentMeta = document.getElementById('subscriptionPaymentMeta');
const subscriptionQrImage = document.getElementById('subscriptionQrImage');
const rechargeForm = document.getElementById('rechargeForm');
const rechargeAmountInput = document.getElementById('rechargeAmountInput');
const rechargeAmountHint = document.getElementById('rechargeAmountHint');
const rechargeNoteInput = document.getElementById('rechargeNoteInput');
const rechargeMeta = document.getElementById('rechargeMeta');
const createRechargeButton = document.getElementById('createRechargeButton');
const rechargeOrdersBody = document.getElementById('rechargeOrdersBody');
const alipayQrImage = document.getElementById('alipayQrImage');
const availableModelsBody = document.getElementById('availableModelsBody');
const userRecentRequestsBody = document.getElementById('userRecentRequestsBody');
const proxyBaseUrlValue = document.getElementById('proxyBaseUrlValue');
const userMessage = document.getElementById('userMessage');
const userNavLinks = Array.from(document.querySelectorAll('[data-user-nav-link]'));
const userSections = Array.from(document.querySelectorAll('[data-user-section]'));
const userWorkspace = document.querySelector('[data-user-workspace]');

function separateBillingSections() {
  const rechargeSection = document.getElementById('user-recharge');
  const subscriptionSection = document.getElementById('user-subscription');
  const subscriptionPaymentCard = document.getElementById('subscriptionPaymentCard');
  const rechargePaymentCard = rechargeSection?.querySelector('.user-payment-card') || null;
  const subscriptionNoteCard = rechargeSection?.querySelector('.user-subscription-card');
  const subscriptionPlansHeader = subscriptionPlansList?.previousElementSibling || null;
  const subscriptionOrdersTableShell = subscriptionOrdersBody?.closest('.table-shell') || null;

  if (!rechargeSection || !subscriptionSection || !subscriptionPaymentCard) {
    return;
  }

  if (rechargePaymentCard) {
    const rechargeTitle = rechargePaymentCard.querySelector('h3');
    const rechargeLead = rechargePaymentCard.querySelector('p');
    if (rechargeTitle) {
      rechargeTitle.textContent = '余额充值收款码';
    }
    if (rechargeLead) {
      rechargeLead.textContent = '这一路径仅用于账户余额充值。转账并提交充值申请后，等待管理员审核入账。';
    }
  }

  const blocksBeforePayment = [
    subscriptionSummary,
    subscriptionNoteCard,
    subscriptionPlansHeader,
    subscriptionPlansList,
  ].filter(Boolean);

  for (const block of blocksBeforePayment) {
    if (block.parentElement === rechargeSection) {
      subscriptionSection.insertBefore(block, subscriptionPaymentCard);
    }
  }

  const blocksAfterPayment = [
    subscriptionForm,
    subscriptionOrdersTableShell,
  ].filter(Boolean);

  for (const block of blocksAfterPayment) {
    if (block.parentElement === rechargeSection) {
      subscriptionSection.appendChild(block);
    }
  }
}

separateBillingSections();

let userState = {
  currentUser: '',
  summary: {},
  billing: {},
  subscription: {},
  apiKeys: [],
  models: [],
  recentRequests: [],
};
const showUserMessageValue = createTimedMessageController(userMessage);
const DEFAULT_USER_SECTION_ID = userSections[0]?.id || '';

// Per-table sort state: { [tableId]: { col: string, dir: 'asc' | 'desc' } | null }
const tableSortState = {};
const zhCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

function escapeHtml(value) {
  return escapeHtmlValue(value);
}

function formatNumber(value) {
  return formatNumberValue(value);
}

function formatMoney(value, currency = 'USD') {
  return formatMoneyValue(value, currency);
}

function formatPriceWithMultiplier(pricing, canonicalKey, legacyKey) {
  return formatPriceWithMultiplierValue(pricing, canonicalKey, legacyKey);
}

function formatMultiplierCell(pricing) {
  const mult = Number(pricing?.priceMultiplier ?? 1);
  if (!Number.isFinite(mult) || mult <= 0) {
    return '-';
  }
  return `× ${mult.toFixed(4)}`;
}

function formatMultiplierCellDisplay(pricing) {
  const mult = Number(pricing?.priceMultiplier ?? 1);
  if (!Number.isFinite(mult) || mult <= 0) {
    return '-';
  }
  return `× ${mult.toFixed(4)}`;
}

function updateRechargeAmountHint() {
  if (!rechargeAmountHint) {
    return;
  }

  const billing = userState?.billing || {};
  const cnyPerUsd = Number(billing.cnyPerUsd || 0);
  const amountCny = Number(rechargeAmountInput?.value || 0);

  if (!billing.rechargeEnabled || !Number.isFinite(cnyPerUsd) || cnyPerUsd <= 0) {
    rechargeAmountHint.textContent = '';
    return;
  }

  if (!Number.isFinite(amountCny) || amountCny <= 0) {
    rechargeAmountHint.textContent = `\u6298\u5408\u7f8e\u5143\uff08\u6309 ${formatMoney(cnyPerUsd, 'CNY')} = 1 USD \u6362\u7b97\uff09`;
    return;
  }

  rechargeAmountHint.textContent = `\u6298\u5408\u7f8e\u5143\uff08${formatMoney(amountCny / cnyPerUsd, 'USD')}\uff09`;
}

function formatDateTime(value) {
  return formatDateTimeValue(value);
}

function getStatusBadge(label, tone = 'muted') {
  return getStatusBadgeValue(label, tone);
}

function getRechargeStatusBadge(status) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'paid') {
    return getStatusBadge('\u5df2\u901a\u8fc7', 'success');
  }
  if (normalizedStatus === 'closed') {
    return getStatusBadge('\u5df2\u5173\u95ed', 'warning');
  }
  if (normalizedStatus === 'failed') {
    return getStatusBadge('\u5931\u8d25', 'danger');
  }
  return getStatusBadge('\u5f85\u5ba1\u6838', 'info');
}

function getTimeValue(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCellValue(item, col) {
  switch (col) {
    case 'name': return String(item.name || '');
    case 'createdAt': return getTimeValue(item.createdAt);
    case 'lastUsedAt': return getTimeValue(item.lastUsedAt);
    case 'status': return String(item.status || '');
    case 'amountUsd': return Number(item.amountUsd || 0);
    case 'amountCny': return Number(item.amountCny || 0);
    case 'paidAt': return getTimeValue(item.paidAt);
    case 'approvedExpiresAt': return getTimeValue(item.approvedExpiresAt);
    case 'reviewedBy': return String(item.reviewedBy || '');
    case 'modelName': return String(item.modelName || item.modelId || '');
    case 'success': return item.success ? '1' : '0';
    case 'inputTokens': return Number(item.inputTokens || 0);
    case 'outputTokens': return Number(item.outputTokens || 0);
    case 'cacheReadTokens': return Number(item.cacheReadTokens || 0);
    case 'cacheCreationTokens': return Number(item.cacheCreationTokens || 0);
    case 'totalCost': return Number(item.totalCost || 0);
    case 'latencyMs': return Number(item.latencyMs || 0);
    case 'timestamp': return getTimeValue(item.timestamp);
    case 'currency': return String(item.pricing?.currency || 'USD');
    case 'inputPrice': return getPerMillionPrice(item.pricing, 'inputPerMillionTokens', 'inputPer1kTokens');
    case 'outputPrice': return getPerMillionPrice(item.pricing, 'outputPerMillionTokens', 'outputPer1kTokens');
    case 'cacheReadPrice': return getPerMillionPrice(item.pricing, 'cachedInputPerMillionTokens', 'cachedInputPer1kTokens');
    case 'cacheWritePrice': return getPerMillionPrice(item.pricing, 'cacheCreationPerMillionTokens', 'cacheCreationPer1kTokens');
    case 'priceMultiplier': return Number(item.pricing?.priceMultiplier ?? 1);
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

function getUserSectionIdFromHash(hash = window.location.hash) {
  const normalizedHash = String(hash || '').replace(/^#/, '').trim();
  if (normalizedHash === 'user-billing') {
    return 'user-recharge';
  }
  return userSections.some((section) => section.id === normalizedHash)
    ? normalizedHash
    : DEFAULT_USER_SECTION_ID;
}

function setActiveUserNav(sectionId) {
  const nextSectionId = userSections.some((section) => section.id === sectionId)
    ? sectionId
    : DEFAULT_USER_SECTION_ID;

  for (const link of userNavLinks) {
    const isActive = link.dataset.userNavLink === nextSectionId;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
}

function showUserSection(sectionId, options = {}) {
  if (!userSections.length) {
    return DEFAULT_USER_SECTION_ID;
  }

  const {
    updateHash = false,
    preserveScroll = false,
  } = options;
  const nextSectionId = getUserSectionIdFromHash(sectionId);

  for (const section of userSections) {
    const isActive = section.id === nextSectionId;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
    section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }

  setActiveUserNav(nextSectionId);

  if (updateHash) {
    const nextHash = `#${nextSectionId}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, '', nextHash);
    }
  }

  if (!preserveScroll) {
    if (userWorkspace) {
      userWorkspace.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return nextSectionId;
}

function bindUserShellActions() {
  for (const link of userNavLinks) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const targetSectionId = link.dataset.userNavLink || DEFAULT_USER_SECTION_ID;
      showUserSection(targetSectionId, { updateHash: true });
    });
  }

  window.addEventListener('hashchange', () => {
    showUserSection(getUserSectionIdFromHash(), {
      updateHash: false,
      preserveScroll: true,
    });
  });
}

function renderTableActionButton({ action, label, icon, tone = '', attrs = {} }) {
  return renderTableActionButtonValue({ action, label, icon, tone, attrs });
}

const userRendering = createUserRenderingModule({
  elements: {
    alipayQrImage,
    apiKeysBody,
    availableModelsBody,
    createRechargeButton,
    createSubscriptionButton,
    rechargeMeta,
    rechargeOrdersBody,
    subscriptionLimitSummary,
    subscriptionFallbackPreferences,
    subscriptionMeta,
    subscriptionOrdersBody,
    subscriptionPaymentMeta,
    subscriptionPlansList,
    subscriptionQrImage,
    subscriptionSummary,
    updateRechargeAmountHint,
    userRecentRequestsBody,
    userStatsSummary,
  },
  helpers: {
    applyTableSort,
    escapeHtml,
    formatDateTime,
    formatMoney,
    formatMultiplierCell: formatMultiplierCellDisplay,
    formatNumber,
    formatPriceWithMultiplier,
    getRechargeStatusBadge,
    getStatusBadge,
    renderTableActionButton,
  },
});

function showUserMessage(message, isError = false) {
  showUserMessageValue(message, isError);
}

function setBusy(element, isBusy, label) {
  setBusyValue(element, isBusy, label);
}

function getPerMillionPrice(pricing = {}, canonicalKey, legacyKey) {
  return getPerMillionPriceValue(pricing, canonicalKey, legacyKey);
}

async function requestJson(url, options = {}) {
  return requestJsonValue(url, options);
}

const userData = createUserDataModule({
  elements: {
    proxyBaseUrlValue,
    userIdentity,
  },
  helpers: {
    renderApiKeys: userRendering.renderApiKeys,
    renderAvailableModels: userRendering.renderAvailableModels,
    renderBillingSummary: userRendering.renderBillingSummary,
    renderRecentRequests: userRendering.renderRecentRequests,
    renderRechargeOrders: userRendering.renderRechargeOrders,
    renderSubscriptionOrders: userRendering.renderSubscriptionOrders,
    renderSubscriptionOverview: userRendering.renderSubscriptionOverview,
    requestJson,
    state: {
      get() {
        return userState;
      },
      set(nextPartial) {
        userState = {
          ...userState,
          ...nextPartial,
        };
      },
    },
  },
});
const userActions = createUserActions({
  elements: {
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
  },
  helpers: {
    copyTextToClipboard,
    formatMoney,
    loadApiKeys: userData.loadApiKeys,
    loadBilling: userData.loadBilling,
    loadSubscription: userData.loadSubscription,
    refreshAllData: userData.refreshAllData,
    requestJson,
    setBusy,
    showUserMessage,
    state: {
      get() {
        return {
          ...userState,
          refs: {
            apiKeyNameInput,
            confirmNewPasswordInput,
            currentPasswordInput,
            newApiKeyPanel,
            newApiKeyValue,
            newPasswordInput,
            rechargeAmountInput,
            rechargeNoteInput,
            subscriptionFallbackPreferences,
            subscriptionNoteInput,
          },
        };
      },
    },
    updateRechargeAmountHint,
  },
});

bindUserShellActions();
showUserSection(getUserSectionIdFromHash(), {
  updateHash: true,
  preserveScroll: true,
});

userActions.bindUserActions();

userData.refreshAllData()
  .then(() => {
    initTableSort('apiKeysBody', apiKeysBody, () => userRendering.renderApiKeys(userState.apiKeys));
    initTableSort('subscriptionOrdersBody', subscriptionOrdersBody, () => userRendering.renderSubscriptionOrders(userState.subscription.orders || []));
    initTableSort('rechargeOrdersBody', rechargeOrdersBody, () => userRendering.renderRechargeOrders(userState.billing.orders || []));
    initTableSort('availableModelsBody', availableModelsBody, () => userRendering.renderAvailableModels(userState.models));
    initTableSort('userRecentRequestsBody', userRecentRequestsBody, () => userRendering.renderRecentRequests(userState.recentRequests));
  })
  .catch(() => {
    window.location.href = '/';
  });
