import type { ProviderUsageCard } from '@/types/dashboard';
import { StatusBadge } from '@/components/status-badge';
import { formatJpy, formatRelativeHours, formatDateTime } from '@/lib/format';

const PROVIDER_LABEL: Record<ProviderUsageCard['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Claude API',
  gemini: 'Gemini',
};

export function ProviderCard({ card }: { card: ProviderUsageCard }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{PROVIDER_LABEL[card.provider]}</h3>
        <StatusBadge status={card.enabled ? card.status : 'disabled'} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">今日</p>
          <p className="text-lg font-bold">{formatJpy(card.todayCostJpy)}</p>
          {card.todayCostOriginal && (
            <p className="text-xs text-gray-400">
              {card.currencyOriginal} {card.todayCostOriginal}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">今月</p>
          <p className="text-lg font-bold">{formatJpy(card.monthCostJpy)}</p>
          {card.monthCostOriginal && (
            <p className="text-xs text-gray-400">
              {card.currencyOriginal} {card.monthCostOriginal}
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-xs text-gray-500 dark:text-gray-400">
        <div>
          <dt>入力トークン</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">
            {card.inputTokens?.toLocaleString('ja-JP') ?? '取得不可'}
          </dd>
        </div>
        <div>
          <dt>出力トークン</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">
            {card.outputTokens?.toLocaleString('ja-JP') ?? '取得不可'}
          </dd>
        </div>
        <div>
          <dt>リクエスト数</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">
            {card.requestCount?.toLocaleString('ja-JP') ?? '取得不可'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <span title={formatDateTime(card.lastFetchedAt)}>最終取得: {formatRelativeHours(card.lastFetchedAt)}</span>
        <span>{card.isEstimated ? '概算値' : card.confidence ? '確定値' : ''}</span>
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
