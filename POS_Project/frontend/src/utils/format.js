export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const decCount = (num.toString().split('.')[1] || '').length;
  const decimals = Math.min(4, Math.max(2, decCount));
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatNumber(num) {
  return new Intl.NumberFormat('th-TH').format(num);
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(dateString));
}

export function formatShortDate(dateString) {
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(dateString));
}
