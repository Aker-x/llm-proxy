export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

export function formatMoney(value, currency = 'USD') {
  const numericValue = Number(value || 0);
  return `${numericValue.toFixed(3)} ${currency}`;
}

export function getPerMillionPrice(pricing = {}, canonicalKey, legacyKey) {
  const canonicalValue = Number(pricing?.[canonicalKey]);
  if (Number.isFinite(canonicalValue)) {
    return canonicalValue;
  }

  const legacyValue = Number(pricing?.[legacyKey]);
  return Number.isFinite(legacyValue) ? legacyValue : 0;
}

export function formatPriceWithMultiplier(pricing, canonicalKey, legacyKey) {
  const base = getPerMillionPrice(pricing, canonicalKey, legacyKey);
  const currency = pricing?.currency || 'USD';

  return formatMoney(base, currency);
}

export function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function getStatusBadge(label, tone = 'muted') {
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`;
}
