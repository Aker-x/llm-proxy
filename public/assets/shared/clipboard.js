function fallbackCopyTextToClipboard(text) {
  if (!document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = String(text || '');
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

export async function copyTextToClipboard(text) {
  const normalizedText = String(text || '');

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(normalizedText);
      return;
    } catch {
      // Fall back to the legacy copy flow below.
    }
  }

  if (!fallbackCopyTextToClipboard(normalizedText)) {
    throw new Error('copy_failed');
  }
}
