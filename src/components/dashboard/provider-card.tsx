import type { ProviderUsageCard } from '@/types/dashboard';
import { StatusBadge } from '@/components/status-badge';
import {
  formatJpy,
  formatProviderCostUsd,
  formatRelativeHours,
  formatDateTime,
  formatShortDate,
} from '@/lib/format';

const PROVIDER_LABEL: Record<ProviderUsageCard['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Claude API',
  gemini: 'Gemini',
};

const PROVIDER_COST_DETAILS_URL: Record<ProviderUsageCard['provider'], string> = {
  openai: 'https://platform.openai.com/usage',
  anthropic: 'https://platform.claude.com/cost',
  gemini: 'https://aistudio.google.com/spend?project=gen-lang-client-0399990183',
};

export function ProviderCard({
  card,
  usdJpyRate,
}: {
  card: ProviderUsageCard;
  usdJpyRate: string | null;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{PROVIDER_LABEL[card.provider]}</h3>
          <a
            href={PROVIDER_COST_DETAILS_URL[card.provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            料金詳細 ↗
          </a>
        </div>
        <StatusBadge status={card.enabled ? card.status : 'disabled'} />
      </div>

      <p className="mb-1 text-xs font-medium text-gray-400">API利用料</p>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            直近{card.latestDayDate ? ` (${formatShortDate(card.latestDayDate)})` : ''}
          </p>
          <p className="text-lg font-bold">{formatJpy(card.latestDayCostJpy)}</p>
          {card.latestDayCostOriginal && (
            <p className="text-xs text-gray-400">
              {formatProviderCostUsd(card.latestDayCostOriginal, card.currencyOriginal, usdJpyRate)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            今月{card.monthCostManuallyEntered ? ' (AI Studio)' : ''}
          </p>
          <p className="text-lg font-bold">{formatJpy(card.monthCostJpy)}</p>
          {card.monthCostOriginal && (
            <p className="text-xs text-gray-400">
              {formatProviderCostUsd(card.monthCostOriginal, card.currencyOriginal, usdJpyRate)}
            </p>
          )}
        </div>
      </div>

      <div className="mb-3 rounded-xl bg-gray-50 px-3 py-2 dark:bg-neutral-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">残クレジット</p>
        {card.remainingCreditUsd === null ? (
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">未設定</p>
        ) : (
          <>
            <p className="text-lg font-bold">USD {card.remainingCreditUsd}</p>
            {usdJpyRate && (
              <p className="text-xs text-gray-400">
                約{formatJpy(Number(card.remainingCreditUsd) * Number(usdJpyRate))}
              </p>
            )}
          </>
        )}
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
        <span title={formatDateTime(card.lastFetchedAt)}>
          最終取得: {formatRelativeHours(card.lastFetchedAt)}
        </span>
        <span>
          {card.monthCostManuallyEntered
            ? 'AI Studio入力値'
            : card.isEstimated
              ? '概算値'
              : card.confidence
                ? '確定値'
                : ''}
        </span>
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
