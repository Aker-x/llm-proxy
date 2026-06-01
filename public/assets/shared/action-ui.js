import { escapeHtml } from './format.js';

const icons = {
  approve: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  `,
  busy: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    </svg>
  `,
  copy: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="10" rx="2" />
      <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
    </svg>
  `,
  credit: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 7h18v10H3z" />
      <path d="M7 12h10" />
      <path d="M12 9v6" />
    </svg>
  `,
  delete: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  `,
  edit: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  `,
  power: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v8" />
      <path d="M7.05 5.05a7 7 0 1 0 9.9 0" />
    </svg>
  `,
  reject: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  `,
  reset: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 20H7" />
      <path d="M14.5 4.5l5 5" />
      <path d="M3 15l7.5-7.5a2.121 2.121 0 0 1 3 0l3 3a2.121 2.121 0 0 1 0 3L12 18H6l-3-3Z" />
    </svg>
  `,
  test: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6" />
      <path d="M10 3v5" />
      <path d="M14 3v5" />
      <path d="M7 8h10l-1.5 4.5L12 21l-3.5-8.5Z" />
    </svg>
  `,
};

export function getTableActionIcon(icon) {
  return icons[icon] || '';
}

function toDataAttributeName(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function renderTableActionButton({ action, label, icon, tone = '', attrs = {} }) {
  const extraAttrs = Object.entries(attrs)
    .map(([name, value]) => ` data-${toDataAttributeName(name)}="${escapeHtml(value)}"`)
    .join('');
  const toneClass = tone ? ` ${tone}` : '';

  return `
    <button
      type="button"
      class="table-icon-button${toneClass}"
      data-action="${escapeHtml(action)}"${extraAttrs}
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
    >
      <span class="table-icon" aria-hidden="true">${getTableActionIcon(icon)}</span>
    </button>
  `;
}

export function setBusyState(element, isBusy, label) {
  if (!element) {
    return;
  }

  const isTableIconButton = element.classList.contains('table-icon-button');

  if (isBusy) {
    if (isTableIconButton) {
      element.dataset.originalHtml = element.innerHTML;
      element.dataset.originalAriaLabel = element.getAttribute('aria-label') || '';
      element.dataset.originalTitle = element.getAttribute('title') || '';
      element.innerHTML = `<span class="table-icon" aria-hidden="true">${getTableActionIcon('busy')}</span>`;
      element.classList.add('is-busy');
      if (label) {
        element.setAttribute('aria-label', label);
        element.setAttribute('title', label);
      }
      element.disabled = true;
      return;
    }

    element.dataset.originalLabel = element.textContent;
    element.textContent = label || element.textContent;
    element.disabled = true;
    return;
  }

  if (isTableIconButton) {
    if (Object.prototype.hasOwnProperty.call(element.dataset, 'originalHtml')) {
      element.innerHTML = element.dataset.originalHtml;
      delete element.dataset.originalHtml;
    }
    if (Object.prototype.hasOwnProperty.call(element.dataset, 'originalAriaLabel')) {
      element.setAttribute('aria-label', element.dataset.originalAriaLabel);
      delete element.dataset.originalAriaLabel;
    }
    if (Object.prototype.hasOwnProperty.call(element.dataset, 'originalTitle')) {
      element.setAttribute('title', element.dataset.originalTitle);
      delete element.dataset.originalTitle;
    }
    element.classList.remove('is-busy');
    element.disabled = false;
    return;
  }

  if (element.dataset.originalLabel) {
    element.textContent = element.dataset.originalLabel;
    delete element.dataset.originalLabel;
  }
  element.disabled = false;
}
