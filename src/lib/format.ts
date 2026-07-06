export function formatJpy(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '取得不可';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '取得不可';
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
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

export function formatDateTime(isoDate: string | null | undefined): string {
  if (!isoDate) return '未設定';
  return new Date(isoDate).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}
