export function formatJpy(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '取得不可';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '取得不可';
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

/** Displays provider costs consistently in USD below the JPY total. */
export function formatProviderCostUsd(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  usdJpyRate: string | number | null | undefined,
): string {
  if (amount === null || amount === undefined || !currency) return '取得不可';
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '取得不可';

  if (currency.toUpperCase() === 'USD') return `USD ${value}`;
  if (currency.toUpperCase() === 'JPY') {
    const rate = typeof usdJpyRate === 'string' ? Number(usdJpyRate) : usdJpyRate;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return `JPY ${value}`;
    return `USD ${(value / rate).toFixed(6)}`;
  }
  return `${currency} ${value}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '取得不可';
  return `${value.toFixed(digits)}%`;
}

export function formatRelativeHours(isoDate: string | null | undefined): string {
  if (!isoDate) return '未設定';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) {
    const minutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
    return `${minutes}分前`;
  }
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function formatCountdown(isoDate: string | null | undefined): string {
  if (!isoDate) return '未設定';
  const diffMs = new Date(isoDate).getTime() - Date.now();
  if (diffMs <= 0) return 'まもなく';
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 24) return `${Math.floor(hours / 24)}日後`;
  if (hours > 0) return `${hours}時間${minutes}分後`;
  return `${minutes}分後`;
}

/** Formats a YYYY-MM-DD date as a short "M/D" label (e.g. "7/9"). */
export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const [, month, day] = dateStr.split('-');
  if (!month || !day) return dateStr;
  return `${Number(month)}/${Number(day)}`;
}

export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '未設定';
  return new Date(isoDate).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}
