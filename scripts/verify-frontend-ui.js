const assert = require('node:assert/strict');
require('dotenv').config();
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'liuzhenyu';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Lzy_08032211';
const BROWSER_CHANNEL = process.env.PLAYWRIGHT_BROWSER_CHANNEL || '';
const BROWSER_EXECUTABLE_PATH = process.env.PLAYWRIGHT_BROWSER_PATH || '';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForPath(page, path) {
  await page.waitForURL(new RegExp(`${escapeRegExp(path)}(?:$|[?#])`), { timeout: 15000 });
}

async function readClipboard(page) {
  return page.evaluate(() => navigator.clipboard.readText());
}

function isClipboardPermissionGrantSupported(baseUrl) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === 'https:' || parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

async function loginFromForm(page, urlPath, { username, password }, targetPath) {
  await page.goto(new URL(urlPath, BASE_URL).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('#usernameInput').fill(username);
  await page.locator('#passwordInput').fill(password);
  await Promise.all([
    waitForPath(page, targetPath),
    page.locator('button[type="submit"]').click(),
  ]);
}

async function openSection(page, path, sectionSelector, waitUntilReady) {
  const targetUrl = new URL(path, BASE_URL).toString();
  if (page.url() === targetUrl) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
  await waitUntilReady(page);
  await page.locator(sectionSelector).waitFor({ state: 'visible', timeout: 15000 });
}

async function waitForRowByText(page, tbodySelector, text) {
  await page.waitForFunction(({ tbodySelector: selector, text: expectedText }) => {
    return Array.from(document.querySelectorAll(`${selector} tr`))
      .some((row) => row.textContent.includes(expectedText));
  }, { tbodySelector, text }, { timeout: 15000 });
  return page.locator(`${tbodySelector} tr`).filter({ hasText: text }).first();
}

async function waitForCombinedRowText(page, tbodySelector, texts) {
  await page.waitForFunction(({ tbodySelector: selector, texts: expectedTexts }) => {
    return Array.from(document.querySelectorAll(`${selector} tr`))
      .some((row) => expectedTexts.every((text) => row.textContent.includes(text)));
  }, { tbodySelector, texts }, { timeout: 15000 });

  let locator = page.locator(`${tbodySelector} tr`);
  for (const text of texts) {
    locator = locator.filter({ hasText: text });
  }
  return locator.first();
}

async function waitForTextInSelector(page, selector, text) {
  await page.waitForFunction(({ selector: targetSelector, text: expectedText }) => {
    const node = document.querySelector(targetSelector);
    return Boolean(node && node.textContent.includes(expectedText));
  }, { selector, text }, { timeout: 15000 });
}

async function apiDelete(page, path) {
  return page.evaluate(async ({ path: endpoint }) => {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      credentials: 'include',
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  }, { path });
}

async function collectColumnTexts(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
}

async function readDatasetValue(locator, ...names) {
  return locator.evaluate((node, requestedNames) => {
    for (const name of requestedNames) {
      if (!name) {
        continue;
      }

      if (node.dataset && Object.prototype.hasOwnProperty.call(node.dataset, name) && node.dataset[name]) {
        return node.dataset[name];
      }

      const rawDataName = `data-${name}`;
      const kebabName = `data-${name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
      const compactName = `data-${name.toLowerCase()}`;
      const directValue = node.getAttribute(rawDataName)
        || node.getAttribute(kebabName)
        || node.getAttribute(compactName);
      if (directValue) {
        return directValue;
      }
    }

    return '';
  }, names);
}

function logStep(message) {
  console.log(`[verify:ui] ${message}`);
}

async function launchBrowser() {
  const launchOptions = { headless: true };

  if (BROWSER_EXECUTABLE_PATH) {
    return chromium.launch({
      ...launchOptions,
      executablePath: BROWSER_EXECUTABLE_PATH,
    });
  }

  if (BROWSER_CHANNEL) {
    return chromium.launch({
      ...launchOptions,
      channel: BROWSER_CHANNEL,
    });
  }

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const message = String(error?.message || '');
    const missingBundledBrowser = message.includes("Executable doesn't exist");
    if (!missingBundledBrowser) {
      throw error;
    }

    const fallbackChannels = ['chrome', 'msedge'];
    for (const channel of fallbackChannels) {
      try {
        logStep(`bundled chromium unavailable, retry with system browser channel: ${channel}`);
        return await chromium.launch({
          ...launchOptions,
          channel,
        });
      } catch {
        // Try next fallback channel.
      }
    }

    throw error;
  }
}

async function waitForJsonResponse(page, predicate, trigger, timeout = 15000) {
  const responsePromise = page.waitForResponse(async (response) => {
    if (!predicate(response)) {
      return false;
    }
    return true;
  }, { timeout });

  await trigger();
  const response = await responsePromise;
  const bodyText = await response.text();
  let data = null;

  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    data = bodyText;
  }

  if (!response.ok()) {
    const requestBody = response.request().postData() || '';
    throw new Error(`HTTP ${response.status()} ${response.url()} => ${typeof data === 'string' ? data : JSON.stringify(data)} | request=${requestBody}`);
  }

  return data;
}

async function waitForAdminReady(page) {
  await page.waitForFunction(() => {
    const identity = document.querySelector('#adminIdentity')?.textContent || '';
    return Boolean(
      identity.trim().length > 0
      && document.querySelector('#userForm')
      && document.querySelector('#providerForm')
      && document.querySelector('#modelForm')
      && document.querySelector('#externalModelForm')
      && document.querySelectorAll('#adminUsersBody tr').length > 0
      && document.querySelectorAll('#providersBody tr').length > 0
    );
  }, null, { timeout: 15000 });
}

async function waitForUserReady(page) {
  await page.waitForFunction(() => {
    const identity = document.querySelector('#userIdentity')?.textContent || '';
    return Boolean(
      identity.trim().length > 0
      && document.querySelector('#apiKeyForm')
      && document.querySelector('#subscriptionForm')
      && document.querySelector('#rechargeForm')
      && document.querySelectorAll('#apiKeysBody tr').length > 0
      && document.querySelectorAll('#availableModelsBody tr').length > 0
    );
  }, null, { timeout: 15000 });
}

async function waitForAdminSubscriptionReady(page) {
  await page.waitForFunction(() => {
    return Boolean(
      document.querySelector('#subscriptionPlanForm')
      && document.querySelectorAll('#subscriptionPlansBody tr').length > 0
      && document.querySelectorAll('#subscriptionOrdersBody tr').length > 0
      && document.querySelectorAll('#subscriberUsageBody tr').length > 0
      && document.querySelectorAll('#subscriptionPlanLimitsBody tr').length > 0
    );
  }, null, { timeout: 15000 });
}

async function waitForUserSubscriptionReady(page) {
  await page.waitForFunction(() => {
    return Boolean(
      document.querySelector('#subscriptionForm')
      && document.querySelectorAll(
        '#subscriptionPlansList .subscription-plan-table tbody tr, #subscriptionPlansList .empty-state'
      ).length > 0
      && document.querySelectorAll('#subscriptionOrdersBody tr').length > 0
    );
  }, null, { timeout: 15000 });
}

async function run() {
  const stamp = `${Date.now()}`;
  const tempProviderId = `ui-provider-${stamp}`;
  const tempUsername = `ui-user-${stamp}`;
  const tempUserPassword = `ui-pass-${stamp}`;
  const tempModelId = `ui-model-${stamp}`;
  const tempExternalModelId = `ui-external-${stamp}`;
  const renamedExternalModelId = `ui-external-renamed-${stamp}`;
  const tempPlanName = `ui-plan-${stamp}`;
  const tempPlanDescription = `UI subscription smoke ${stamp}`;
  const apiKeyNameZ = `zz-ui-${stamp}`;
  const apiKeyNameA = `aa-ui-${stamp}`;
  const createdApiKeys = [];

  let browser;
  let adminPage;
  let userPage;
  let tempPlanId = '';
  let tempSubscriptionOrderId = '';
  let tempExternalModelName = '';

  const summary = {
    baseUrl: BASE_URL,
    admin: {},
    user: {},
  };

  try {
    browser = await launchBrowser();

    const clipboardChecksEnabled = isClipboardPermissionGrantSupported(BASE_URL);
    summary.user.clipboardChecksEnabled = clipboardChecksEnabled;

    const adminContext = await browser.newContext();
    if (clipboardChecksEnabled) {
      await adminContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
    }
    adminPage = await adminContext.newPage();
    await adminPage.addInitScript(() => {
      window.confirm = () => true;
    });

    const userContext = await browser.newContext();
    if (clipboardChecksEnabled) {
      await userContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
    }
    userPage = await userContext.newPage();
    await userPage.addInitScript(() => {
      window.confirm = () => true;
    });

    await loginFromForm(adminPage, '/admin-login.html', {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    }, '/admin');
    logStep('admin login completed');
    await waitForAdminReady(adminPage);
    summary.admin.identity = (await adminPage.locator('#adminIdentity').textContent()).trim();

    logStep('create temporary provider');
    await openSection(adminPage, '/admin#admin-providers', '#admin-providers', waitForAdminReady);
    await adminPage.locator('#providerId').fill(tempProviderId);
    await adminPage.locator('#providerBaseUrl').fill('https://example.invalid/ui');
    await adminPage.locator('#providerApiKey').fill('ui-test-key');
    assert.equal(await adminPage.locator('#providerId').inputValue(), tempProviderId);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/providers'),
      () => adminPage.locator('#providerForm button[type="submit"]').click(),
    );
    await waitForRowByText(adminPage, '#providersBody', tempProviderId);
    summary.admin.providerCreated = tempProviderId;
    summary.admin.providerRows = await adminPage.locator('#providersBody tr').count();

    logStep('create temporary upstream model');
    await openSection(adminPage, '/admin#admin-models', '#admin-models', waitForAdminReady);
    await adminPage.locator('#modelId').fill(tempModelId);
    await adminPage.locator('#modelProviderSelect').selectOption(tempProviderId);
    await adminPage.locator('#modelUpstreamApi').selectOption('chat_completions');
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/models'),
      () => adminPage.locator('#modelForm button[type="submit"]').click(),
    );
    await waitForRowByText(adminPage, '#modelsBody', tempModelId);
    summary.admin.modelCreated = tempModelId;

    logStep('create temporary external model');
    await openSection(adminPage, '/admin#admin-external-models', '#admin-external-models', waitForAdminReady);
    await adminPage.locator('#externalModelName').fill(tempExternalModelId);
    await adminPage.locator('#externalModelStrategy').selectOption('round_robin');
    const modelBindingRow = await waitForRowByText(adminPage, '#externalModelSelectionBody', tempModelId);
    await modelBindingRow.locator('input[type="checkbox"]').check();
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/external-models'),
      () => adminPage.locator('#externalModelForm button[type="submit"]').click(),
    );
    await waitForRowByText(adminPage, '#externalModelsBody', tempExternalModelId);
    tempExternalModelName = tempExternalModelId;
    summary.admin.externalModelCreated = tempExternalModelId;

    logStep('verify provider sorting');
    await openSection(adminPage, '/admin#admin-providers', '#admin-providers', waitForAdminReady);
    const providerIdHeader = adminPage.locator('.providers-table th[data-sort-col="providerId"]');
    await providerIdHeader.click();
    await providerIdHeader.click();
    assert(await providerIdHeader.evaluate((node) => node.classList.contains('sort-desc')));
    summary.admin.providerSortDesc = true;

    logStep('create temporary user');
    await openSection(adminPage, '/admin#admin-users', '#admin-users', waitForAdminReady);
    await adminPage.locator('#managedUsername').fill(tempUsername);
    await adminPage.locator('#managedUserPassword').fill(tempUserPassword);
    await adminPage.locator('#managedUserRole').selectOption('user');
    assert.equal(await adminPage.locator('#managedUsername').inputValue(), tempUsername);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/users'),
      () => adminPage.locator('#userForm button[type="submit"]').click(),
    );
    await waitForRowByText(adminPage, '#adminUsersBody', tempUsername);
    summary.admin.userCreated = tempUsername;

    logStep('verify managed user sorting');
    const managedUsersHeader = adminPage.locator('.managed-users-table th[data-sort-col="username"]');
    await managedUsersHeader.click();
    await managedUsersHeader.click();
    assert(await managedUsersHeader.evaluate((node) => node.classList.contains('sort-desc')));
    summary.admin.userSortDesc = true;

    logStep('open subscription section and create plan');
    await openSection(adminPage, '/admin#admin-subscription', '#admin-subscription', waitForAdminReady);
    await waitForAdminSubscriptionReady(adminPage);
    if (!(await adminPage.locator('#subscriptionEnabled').isChecked())) {
      await adminPage.locator('#subscriptionEnabled').check();
    }
    summary.admin.subscriptionEntryEnabled = await adminPage.locator('#subscriptionEnabled').isChecked();

    await adminPage.waitForFunction((modelName) => {
      return Array.from(document.querySelectorAll('#subscriptionPlanLimitsBody input[data-plan-limit-input="true"]'))
        .some((node) => (node.getAttribute('data-external-model-name') || '') === modelName);
    }, tempExternalModelName, { timeout: 15000 });
    await waitForRowByText(adminPage, '#subscriptionPlanLimitsBody', tempExternalModelName);

    const firstLimitInput = adminPage.locator(`#subscriptionPlanLimitsBody input[data-plan-limit-input="true"][data-external-model-name="${tempExternalModelName}"]`).first();
    assert(tempExternalModelName, 'subscription plan limit editor should expose at least one external model name');

    await adminPage.locator('#subscriptionPlanName').fill(tempPlanName);
    await adminPage.locator('#subscriptionPlanMonthlyPriceCny').fill('588');
    await adminPage.locator('#subscriptionPlanSortOrder').fill('11');
    await adminPage.locator('#subscriptionPlanDescription').fill(tempPlanDescription);
    await firstLimitInput.fill('3');
    assert.equal(await adminPage.locator('#subscriptionPlanName').inputValue(), tempPlanName);

    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/admin/subscription/plans'),
      () => adminPage.locator('#subscriptionPlanForm button[type="submit"]').click(),
    );

    const planRow = await waitForRowByText(adminPage, '#subscriptionPlansBody', tempPlanName);
    tempPlanId = await readDatasetValue(planRow.locator('[data-action="delete-subscription-plan"]').first(), 'planId', 'planid');
    assert(tempPlanId, 'subscription plan row should expose a plan id');
    summary.admin.subscriptionPlanCreated = tempPlanName;
    summary.admin.subscriptionPlanId = tempPlanId;
    summary.admin.subscriptionPlanModel = tempExternalModelName;
    summary.admin.subscriptionPlanModelDisplayName = tempExternalModelName;

    await loginFromForm(userPage, '/', {
      username: tempUsername,
      password: tempUserPassword,
    }, '/user');
    logStep('temporary user login completed');
    await waitForUserReady(userPage);
    summary.user.identity = (await userPage.locator('#userIdentity').textContent()).trim();

    logStep('open API key section');
    await openSection(userPage, '/user#user-api-keys', '#user-api-keys', waitForUserReady);

    logStep('create first API key');
    await userPage.locator('#apiKeyNameInput').fill(apiKeyNameZ);
    await waitForJsonResponse(
      userPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/user/api-keys'),
      () => userPage.locator('#createApiKeyButton').click(),
    );
    await userPage.locator('#newApiKeyPanel').waitFor({ state: 'visible', timeout: 15000 });
    const firstSecret = (await userPage.locator('#newApiKeyValue').textContent()).trim();
    assert(firstSecret, 'first API key secret should be present');
    await waitForRowByText(userPage, '#apiKeysBody', apiKeyNameZ);
    if (clipboardChecksEnabled) {
      await userPage.locator('#copyNewApiKeyButton').click();
      await userPage.waitForTimeout(200);
      assert.equal(await readClipboard(userPage), firstSecret);
    }

    const firstRow = await waitForRowByText(userPage, '#apiKeysBody', apiKeyNameZ);
    createdApiKeys.push({
      id: await readDatasetValue(firstRow.locator('[data-action="delete-api-key"]').first(), 'keyId', 'keyid'),
      name: apiKeyNameZ,
    });

    logStep('create second API key');
    await userPage.locator('#apiKeyNameInput').fill(apiKeyNameA);
    await waitForJsonResponse(
      userPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/user/api-keys'),
      () => userPage.locator('#createApiKeyButton').click(),
    );
    await userPage.locator('#newApiKeyPanel').waitFor({ state: 'visible', timeout: 15000 });
    const secondSecret = (await userPage.locator('#newApiKeyValue').textContent()).trim();
    assert(secondSecret, 'second API key secret should be present');
    const secondRow = await waitForRowByText(userPage, '#apiKeysBody', apiKeyNameA);
    createdApiKeys.push({
      id: await readDatasetValue(secondRow.locator('[data-action="delete-api-key"]').first(), 'keyId', 'keyid'),
      name: apiKeyNameA,
    });

    if (clipboardChecksEnabled) {
      const copiedKeyValue = (await secondRow.locator('code').textContent()).trim();
      await secondRow.locator('[data-action="copy-api-key"]').click();
      await userPage.waitForTimeout(200);
      assert.equal(await readClipboard(userPage), copiedKeyValue);
      summary.user.copyButtonsOk = true;
    }

    logStep('verify API key sorting');
    const apiKeyNameHeader = userPage.locator('.api-keys-table th[data-sort-col="name"]');
    await apiKeyNameHeader.click();
    const ascNames = await collectColumnTexts(userPage, '#apiKeysBody tr td:first-child');
    assert(ascNames.indexOf(apiKeyNameA) < ascNames.indexOf(apiKeyNameZ), 'API key name sort ascending should place aa before zz');

    await apiKeyNameHeader.click();
    const descNames = await collectColumnTexts(userPage, '#apiKeysBody tr td:first-child');
    assert(descNames.indexOf(apiKeyNameA) > descNames.indexOf(apiKeyNameZ), 'API key name sort descending should place zz before aa');
    summary.user.apiKeySortOk = true;

    logStep('delete temporary API keys');
    for (const apiKey of [...createdApiKeys].reverse()) {
      const row = await waitForRowByText(userPage, '#apiKeysBody', apiKey.name);
      await waitForJsonResponse(
        userPage,
        (response) => response.request().method() === 'DELETE' && response.url().includes('/api/user/api-keys/'),
        () => row.locator('[data-action="delete-api-key"]').click(),
      );
      await userPage.waitForFunction((name) => {
        return !Array.from(document.querySelectorAll('#apiKeysBody tr td:first-child'))
          .some((cell) => cell.textContent.trim() === name);
      }, apiKey.name);
    }
    createdApiKeys.length = 0;
    summary.user.apiKeysDeleted = true;

    logStep('open billing section and submit subscription order');
    await openSection(userPage, '/user#user-subscription', '#user-subscription', waitForUserReady);
    await waitForUserSubscriptionReady(userPage);
    await waitForTextInSelector(userPage, '#subscriptionPlansList', tempPlanName);

    const selectedPlanRow = userPage.locator('#subscriptionPlansList .subscription-plan-table tbody tr').filter({ hasText: tempPlanName }).first();
    const selectedPlanInput = selectedPlanRow.locator('input[name="subscriptionPlanChoice"]');
    await selectedPlanInput.waitFor({ state: 'attached', timeout: 15000 });
    await selectedPlanInput.check({ force: true });
    assert(await selectedPlanInput.isChecked());

    await userPage.locator('#subscriptionNoteInput').fill(`ui-order-${stamp}`);
    const subscriptionOrderResult = await waitForJsonResponse(
      userPage,
      (response) => response.request().method() === 'POST' && response.url().endsWith('/api/user/subscription-orders'),
      () => userPage.locator('#createSubscriptionButton').click(),
    );
    tempSubscriptionOrderId = String(subscriptionOrderResult?.order?.id || '').trim();
    assert(tempSubscriptionOrderId, 'subscription order response should include an order id');
    await waitForCombinedRowText(userPage, '#subscriptionOrdersBody', [tempPlanName, 'ui-order-']);
    summary.user.subscriptionOrderId = tempSubscriptionOrderId;
    summary.user.subscriptionOrderSubmitted = tempPlanName;

    logStep('admin approves subscription order');
    await openSection(adminPage, '/admin#admin-subscription', '#admin-subscription', waitForAdminReady);
    await waitForAdminSubscriptionReady(adminPage);
    const orderRow = await waitForCombinedRowText(adminPage, '#subscriptionOrdersBody', [tempUsername, tempPlanName]);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'POST'
        && response.url().endsWith(`/api/admin/subscription-orders/${encodeURIComponent(tempSubscriptionOrderId)}/approve`),
      () => orderRow.locator('[data-action="approve-subscription"]').click(),
    );
    await waitForCombinedRowText(adminPage, '#subscriberUsageBody', [tempUsername, tempPlanName]);
    summary.admin.subscriptionApproved = true;

    logStep('reload user billing and verify active subscription');
    await openSection(userPage, '/user#user-subscription', '#user-subscription', waitForUserReady);
    await waitForUserSubscriptionReady(userPage);
    await userPage.waitForFunction(({ planName, modelName, adminUsername }) => {
      const summaryText = document.querySelector('#subscriptionSummary')?.textContent || '';
      const limitText = document.querySelector('#subscriptionLimitSummary')?.textContent || '';
      const orderText = document.querySelector('#subscriptionOrdersBody')?.textContent || '';
      return summaryText.includes(planName)
        && limitText.includes(modelName)
        && orderText.includes(planName)
        && orderText.includes(adminUsername);
    }, {
      planName: tempPlanName,
      modelName: tempExternalModelName,
      adminUsername: ADMIN_USERNAME,
    }, { timeout: 15000 });
    summary.user.subscriptionActive = true;
    summary.user.subscriptionPlanVisible = tempPlanName;
    summary.user.subscriptionModelVisible = tempExternalModelName;

    logStep('rename external model after subscription approval');
    await openSection(adminPage, '/admin#admin-external-models', '#admin-external-models', waitForAdminReady);
    const editableExternalModelRow = await waitForRowByText(adminPage, '#externalModelsBody', tempExternalModelName);
    await editableExternalModelRow.locator('[data-action="edit-external-model"]').click();
    await adminPage.locator('#externalModelName').fill(renamedExternalModelId);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'PUT'
        && response.url().endsWith(`/api/admin/external-models/${encodeURIComponent(tempExternalModelName)}`),
      () => adminPage.locator('#externalModelForm button[type="submit"]').click(),
    );
    await waitForRowByText(adminPage, '#externalModelsBody', renamedExternalModelId);
    tempExternalModelName = renamedExternalModelId;
    summary.admin.externalModelRenamed = renamedExternalModelId;

    logStep('reload user billing and verify renamed subscription model');
    await openSection(userPage, '/user#user-subscription', '#user-subscription', waitForUserReady);
    await waitForUserSubscriptionReady(userPage);
    await userPage.waitForFunction(({ modelName }) => {
      const limitText = document.querySelector('#subscriptionLimitSummary')?.textContent || '';
      return limitText.includes(modelName);
    }, {
      modelName: tempExternalModelName,
    }, { timeout: 15000 });
    summary.user.subscriptionModelVisibleAfterRename = tempExternalModelName;

    logStep('logout temporary user');
    await Promise.all([
      waitForPath(userPage, '/'),
      userPage.locator('#logoutButton').click(),
    ]);
    summary.user.logoutOk = true;

    logStep('cleanup temporary user');
    await openSection(adminPage, '/admin#admin-users', '#admin-users', waitForAdminReady);
    const managedUserRow = await waitForRowByText(adminPage, '#adminUsersBody', tempUsername);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/admin/users/${encodeURIComponent(tempUsername)}`),
      () => managedUserRow.locator('[data-action="delete-user"]').click(),
    );
    await adminPage.waitForFunction((username) => {
      return !Array.from(document.querySelectorAll('#adminUsersBody tr td:first-child'))
        .some((cell) => cell.textContent.trim() === username);
    }, tempUsername);
    summary.admin.userDeleted = true;

    logStep('cleanup temporary subscription plan');
    await openSection(adminPage, '/admin#admin-subscription', '#admin-subscription', waitForAdminReady);
    const tempPlanRow = await waitForRowByText(adminPage, '#subscriptionPlansBody', tempPlanName);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'DELETE'
        && response.url().endsWith(`/api/admin/subscription/plans/${encodeURIComponent(tempPlanId)}`),
      () => tempPlanRow.locator('[data-action="delete-subscription-plan"]').click(),
    );
    await adminPage.waitForFunction((planName) => {
      return !Array.from(document.querySelectorAll('#subscriptionPlansBody tr'))
        .some((row) => row.textContent.includes(planName));
    }, tempPlanName);
    summary.admin.subscriptionPlanDeleted = true;

    logStep('cleanup temporary external model');
    await openSection(adminPage, '/admin#admin-external-models', '#admin-external-models', waitForAdminReady);
    const externalModelRow = await waitForRowByText(adminPage, '#externalModelsBody', tempExternalModelName);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'DELETE'
        && response.url().endsWith(`/api/admin/external-models/${encodeURIComponent(tempExternalModelName)}`),
      () => externalModelRow.locator('[data-action="delete-external-model"]').click(),
    );
    await adminPage.waitForFunction((externalModelName) => {
      return !Array.from(document.querySelectorAll('#externalModelsBody tr'))
        .some((row) => row.textContent.includes(externalModelName));
    }, tempExternalModelName);
    summary.admin.externalModelDeleted = true;

    logStep('cleanup temporary provider');
    await openSection(adminPage, '/admin#admin-providers', '#admin-providers', waitForAdminReady);
    const providerRow = await waitForRowByText(adminPage, '#providersBody', tempProviderId);
    await waitForJsonResponse(
      adminPage,
      (response) => response.request().method() === 'DELETE' && response.url().endsWith(`/api/admin/providers/${encodeURIComponent(tempProviderId)}`),
      () => providerRow.locator('[data-action="delete-provider"]').click(),
    );
    await adminPage.waitForFunction((providerId) => {
      return !Array.from(document.querySelectorAll('#providersBody tr td:first-child'))
        .some((cell) => cell.textContent.trim() === providerId);
    }, tempProviderId);
    summary.admin.providerDeleted = true;

    logStep('logout admin');
    await Promise.all([
      waitForPath(adminPage, '/'),
      adminPage.locator('#logoutButton').click(),
    ]);
    summary.admin.logoutOk = true;

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (userPage) {
      for (const apiKey of createdApiKeys) {
        if (!apiKey?.id) {
          continue;
        }
        try {
          await apiDelete(userPage, `/api/user/api-keys/${encodeURIComponent(apiKey.id)}`);
        } catch {
          // Best-effort cleanup.
        }
      }
    }

    if (adminPage) {
      if (tempUsername) {
        try {
          await apiDelete(adminPage, `/api/admin/users/${encodeURIComponent(tempUsername)}`);
        } catch {
          // Best-effort cleanup.
        }
      }

      if (tempPlanId) {
        try {
          await apiDelete(adminPage, `/api/admin/subscription/plans/${encodeURIComponent(tempPlanId)}`);
        } catch {
          // Best-effort cleanup.
        }
      }

      if (tempExternalModelName) {
        try {
          await apiDelete(adminPage, `/api/admin/external-models/${encodeURIComponent(tempExternalModelName)}`);
        } catch {
          // Best-effort cleanup.
        }
      }

      if (tempProviderId) {
        try {
          await apiDelete(adminPage, `/api/admin/providers/${encodeURIComponent(tempProviderId)}`);
        } catch {
          // Best-effort cleanup.
        }
      }
    }

    if (browser) {
      await browser.close();
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
