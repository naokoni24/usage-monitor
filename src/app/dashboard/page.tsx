'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardResponse } from '@/types/dashboard';
import { ProviderCard } from '@/components/dashboard/provider-card';
import { LimitCard } from '@/components/dashboard/limit-card';
import { ProgressBar } from '@/components/progress-bar';
import { formatJpy, formatPercent, formatRelativeHours, formatDateTime, formatShortDate } from '@/lib/format';

const SUBSCRIPTION_LABEL: Record<DashboardResponse['providers'][number]['provider'], string> = {
  openai: 'ChatGPT Plus',
  anthropic: 'Claude Pro',
  gemini: 'Gemini',
};

const SUBSCRIPTION_DETAILS_URL: Record<DashboardResponse['providers'][number]['provider'], string> = {
  openai: 'https://chatgpt.com/#pricing',
  anthropic: 'https://claude.ai/settings/billing',
  gemini: '',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as DashboardResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await load();
    } finally {
      setSyncing(false);
    }
  }

  if (error && !data) {
    return (
      <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
        読み込みに失敗しました: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">AI Usage Monitor</h1>
        <Link href="/settings" className="text-sm text-blue-600 dark:text-blue-400">
          設定
        </Link>
      </header>

      <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              直近{data.latestDayDate ? ` (${formatShortDate(data.latestDayDate)})` : ''}
            </p>
            <p className="text-3xl font-bold">{formatJpy(data.latestDayTotalJpy)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">今月</p>
            <p className="text-3xl font-bold">{formatJpy(data.monthTotalJpy)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">月額上限</p>
            <p className="text-xl font-semibold">{formatJpy(data.monthlyBudgetJpy)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">利用率</p>
            <p className="text-xl font-semibold">{formatPercent(data.budgetUsedPercent)}</p>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar percent={data.budgetUsedPercent} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>
            USD/JPY: {data.fxRate.rate ?? '未設定'}
            {data.fxRate.source ? ` (${data.fxRate.source})` : ''}
          </span>
          <span title={formatDateTime(data.lastSyncedAt)}>最終同期: {formatRelativeHours(data.lastSyncedAt)}</span>
        </div>
      </section>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="mb-6 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {syncing ? '同期中...' : '今すぐ同期'}
      </button>

      {data.providers.some((c) => c.monthlySubscriptionCurrency) && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">月額サブスクリプション</h2>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.providers
              .filter((c) => c.monthlySubscriptionCurrency)
              .map((c) => (
                <div
                  key={c.provider}
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-semibold">{c.monthlySubscriptionName ?? SUBSCRIPTION_LABEL[c.provider]}</h3>
                    {SUBSCRIPTION_DETAILS_URL[c.provider] && (
                      <a
                        href={SUBSCRIPTION_DETAILS_URL[c.provider]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        プラン詳細 ↗
                      </a>
                    )}
                  </div>
                  <p className="text-lg font-bold">{formatJpy(c.monthlySubscriptionJpy)}</p>
                  {c.monthlySubscriptionCurrency === 'USD' && c.monthlySubscriptionOriginal && (
                    <p className="text-xs text-gray-400">${c.monthlySubscriptionOriginal}</p>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">API料金</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.providers.map((card) => (
          <ProviderCard key={card.provider} card={card} usdJpyRate={data.fxRate.rate} />
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">利用枠</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.subscriptionLimits.map((card) => (
          <LimitCard key={card.provider} card={card} />
        ))}
      </div>

      {data.warnings.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
          <h2 className="mb-2 text-sm font-semibold text-yellow-700 dark:text-yellow-400">エラー・警告</h2>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {data.warnings.map((w, i) => (
              <li key={i}>・{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
