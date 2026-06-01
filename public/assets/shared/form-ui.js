export function createTimedMessageController(target, { timeoutMs = 4200 } = {}) {
  let messageTimer = null;

  return function showMessage(message, isError = false) {
    if (!target) {
      return;
    }

    target.textContent = message;
    target.classList.toggle('error', isError);

    if (messageTimer) {
      window.clearTimeout(messageTimer);
    }

    if (message) {
      messageTimer = window.setTimeout(() => {
        target.textContent = '';
        target.classList.remove('error');
      }, timeoutMs);
    }
  };
}

export function setButtonBusy(element, isBusy, label) {
  if (!element) {
    return;
  }

  if (isBusy) {
    element.dataset.originalLabel = element.textContent;
    element.textContent = label || element.textContent;
    element.disabled = true;
    return;
  }

  if (element.dataset.originalLabel) {
    element.textContent = element.dataset.originalLabel;
    delete element.dataset.originalLabel;
  }

  element.disabled = false;
}
