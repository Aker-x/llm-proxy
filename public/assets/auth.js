import { requestJson } from './shared/api.js';
import { createTimedMessageController, setButtonBusy } from './shared/form-ui.js';

const authForm = document.getElementById('authForm');
const authModeButtons = document.querySelectorAll('[data-auth-mode]');
const authTitle = document.getElementById('authTitle');
const authEyebrow = document.getElementById('authEyebrow');
const authHint = document.getElementById('authHint');
const authSubmitButton = document.getElementById('authSubmitButton');
const loginMessage = document.getElementById('loginMessage');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordField = document.getElementById('confirmPasswordField');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');

let currentAuthMode = 'login';
const showMessage = createTimedMessageController(loginMessage);

function setAuthMode(mode) {
  currentAuthMode = mode === 'register' ? 'register' : 'login';
  const isRegister = currentAuthMode === 'register';

  if (authForm) {
    authForm.dataset.authMode = currentAuthMode;
  }

  if (authEyebrow) {
    authEyebrow.textContent = isRegister ? '\u521b\u5efa\u8d26\u53f7' : '\u767b\u5f55';
  }

  if (authTitle) {
    authTitle.textContent = isRegister ? '\u521b\u5efa\u7528\u6237\u8d26\u53f7' : 'LLM \u4ee3\u7406';
  }

  if (authHint) {
    authHint.textContent = isRegister
      ? '\u521b\u5efa\u65b0\u7684\u7528\u6237\u8d26\u53f7\u540e\u5c06\u7acb\u5373\u81ea\u52a8\u767b\u5f55\u3002'
      : '\u4f7f\u7528\u5df2\u6709\u7528\u6237\u8d26\u53f7\u767b\u5f55\uff0c\u7ba1\u7406\u5458\u8d26\u53f7\u4e5f\u53ef\u4ee5\u5728\u8fd9\u91cc\u767b\u5f55\u3002';
  }

  if (confirmPasswordField) {
    confirmPasswordField.hidden = !isRegister;
  }

  if (confirmPasswordInput) {
    confirmPasswordInput.disabled = !isRegister;
    confirmPasswordInput.value = isRegister ? confirmPasswordInput.value : '';
    confirmPasswordInput.autocomplete = isRegister ? 'new-password' : 'off';
  }

  if (passwordInput) {
    passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  }

  if (authSubmitButton) {
    authSubmitButton.textContent = isRegister ? '\u521b\u5efa\u8d26\u53f7' : '\u7ee7\u7eed';
  }

  authModeButtons.forEach((button) => {
    const isActive = button.dataset.authMode === currentAuthMode;
    button.classList.toggle('secondary-button', isActive);
    button.classList.toggle('ghost-button', !isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  showMessage('');
}

if (authModeButtons.length) {
  authModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setAuthMode(button.dataset.authMode);
    });
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');

    const isRegister = currentAuthMode === 'register';
    const username = usernameInput?.value.trim() || '';
    const password = passwordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    if (isRegister && password !== confirmPassword) {
      showMessage('\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002', true);
      return;
    }

    try {
      setButtonBusy(
        authSubmitButton,
        true,
        isRegister ? '\u521b\u5efa\u4e2d...' : '\u767b\u5f55\u4e2d...'
      );
      const data = await requestJson(isRegister ? '/api/register' : '/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      window.location.href = data.redirectTo || (data.role === 'admin' ? '/admin' : '/user');
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonBusy(authSubmitButton, false);
    }
  });
}

setAuthMode('login');
