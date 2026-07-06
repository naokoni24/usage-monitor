import type { SubscriptionLimitCard } from '@/types/dashboard';
import { StatusBadge } from '@/components/status-badge';
import { ProgressBar } from '@/components/progress-bar';
import { formatPercent, formatCountdown, formatDateTime, formatRelativeHours } from '@/lib/format';

const PROVIDER_LABEL: Record<SubscriptionLimitCard['provider'], string> = {
  codex: 'Codex',
  'claude-code': 'Claude Code',
};

const CONFIDENCE_LABEL: Record<string, string> = {
  confirmed: '公式取得',
  estimated: '概算',
  low: '非公式取得',
};

export function LimitCard({ card }: { card: SubscriptionLimitCard }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{PROVIDER_LABEL[card.provider]}</h3>
        <StatusBadge status={card.enabled ? card.status : 'disabled'} />
      </div>

      {card.fiveHour ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>5時間枠</span>
            <span>{formatPercent(card.fiveHour.usedPercent)}</span>
          </div>
          <ProgressBar percent={card.fiveHour.usedPercent} />
          <p className="mt-1 text-xs text-gray-400">
            残り {formatPercent(card.fiveHour.remainingPercent)} ・ リセット {formatCountdown(card.fiveHour.resetAt)}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-400">5時間枠: 取得不可</p>
      )}

      {card.weekly ? (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>週間枠</span>
            <span>{formatPercent(card.weekly.usedPercent)}</span>
          </div>
          <ProgressBar percent={card.weekly.usedPercent} />
          <p className="mt-1 text-xs text-gray-400">
            残り {formatPercent(card.weekly.remainingPercent)} ・ リセット {formatCountdown(card.weekly.resetAt)}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-400">週間枠: 取得不可</p>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>取得元: {card.source ?? '未設定'}</span>
        <span>{card.confidence ? CONFIDENCE_LABEL[card.confidence] : ''}</span>
      </div>
      <div className="mt-1 text-xs text-gray-400" title={formatDateTime(card.lastFetchedAt)}>
        最終取得: {formatRelativeHours(card.lastFetchedAt)}
      </div>

      {card.errorMessage && card.status === 'error' && (
        <details className="mt-2 text-xs text-red-600 dark:text-red-400">
          <summary className="cursor-pointer">エラー詳細</summary>
          <p className="mt-1 break-words">{card.errorMessage}</p>
        </details>
      )}
    </div>
  );
}
