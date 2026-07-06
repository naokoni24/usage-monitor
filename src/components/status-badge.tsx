import type { ConnectionStatus } from '@/types/dashboard';

const STYLES: Record<ConnectionStatus, string> = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  not_configured: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400',
  disabled: 'bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-gray-500',
};

const LABELS: Record<ConnectionStatus, string> = {
  ok: '正常',
  degraded: '遅延',
  error: 'エラー',
  not_configured: '未設定',
  disabled: '無効',
};

export function StatusBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{LABELS[status]}</span>
  );
}
