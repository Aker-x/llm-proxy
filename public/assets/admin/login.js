import { requestJson } from '../shared/api.js';
import { createTimedMessageController, setButtonBusy } from '../shared/form-ui.js';

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');

const showMessage = createTimedMessageController(loginMessage);

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage('');

    const submitButton = loginForm.querySelector('button[type="submit"]');
    const endpoint = loginForm.dataset.loginMode === 'admin' ? '/api/admin/login' : '/api/login';

    try {
      setButtonBusy(submitButton, true, '\u767b\u5f55\u4e2d...');
      const data = await requestJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          username: usernameInput?.value.trim(),
          password: passwordInput?.value || '',
        }),
      });

      window.location.href = data.redirectTo || '/admin';
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonBusy(submitButton, false);
    }
  });
}
