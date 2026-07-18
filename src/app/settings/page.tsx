'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PushSettings } from '@/components/push-settings';
import { formatJpy } from '@/lib/format';

interface SettingsResponse {
  monthlyBudgetJpy: number;
  fx: { rate: string | null; source: string | null; fetchedAt: string | null };
  syncIntervalMinutes: number;
  providers: Array<{ provider: string; enabled: boolean; status: string }>;
  notificationRules: Array<{ ruleType: string; threshold: number; enabled: boolean }>;
  notificationRepeatAfterDrop: boolean;
  geminiServiceFilters: string;
  mockScenario: string;
  claudeCodeManualMemo: string;
  useMockData: boolean;
  openaiOrganizationId: string;
  gcpBillingProjectId: string;
  gcpBillingDataset: string;
  gcpBillingTable: string;
  openaiMonthlySubscriptionJpy: number;
  anthropicMonthlySubscriptionUsd: number;
  openaiSubscriptionRenewalDay: string;
  anthropicSubscriptionRenewalDay: string;
  openaiSubscriptionName: string;
  anthropicSubscriptionName: string;
  openaiRemainingCreditUsd: string;
  anthropicRemainingCreditUsd: string;
  geminiRemainingCreditJpy: string;
  geminiAiStudioMonthTotalJpy: string;
  secrets: {
    openaiAdminKeyConfigured: boolean;
    anthropicAdminKeyConfigured: boolean;
    googleServiceAccountConfigured: boolean;
    vapidConfigured: boolean;
    fxApiConfigured: boolean;
  };
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Claude API',
  gemini: 'Gemini',
  codex: 'Codex',
  'claude-code': 'Claude Code',
};

const RULE_LABEL: Record<string, string> = {
  budget: '月額料金',
  codex_five_hour: 'Codex 5時間枠',
  codex_weekly: 'Codex 週間枠',
  claude_code_five_hour: 'Claude Code 5時間枠',
  claude_code_weekly: 'Claude Code 週間枠',
  system_sync_failure_12h: '同期失敗(12時間)',
  system_stale_24h: '同期停滞(24時間)',
  system_fx_stale_3d: '為替レート停滞(3日)',
  system_billing_stale_48h: 'Billing停滞(48時間)',
  subscription_renewal_openai: 'ChatGPT更新日リマインド',
  subscription_renewal_anthropic: 'Claude更新日リマインド',
};

const MOCK_SCENARIOS = [
  'normal',
  'openai_error',
  'anthropic_not_configured',
  'gemini_billing_delay',
  'budget_50',
  'budget_80',
  'budget_100',
  'codex_five_hour_90',
  'codex_reset_soon',
  'claude_code_manual',
  'claude_code_unavailable',
  'fx_api_failure',
  'push_invalid_subscription',
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [fxInput, setFxInput] = useState('');
  const [syncIntervalInput, setSyncIntervalInput] = useState('');
  const [geminiFiltersInput, setGeminiFiltersInput] = useState('');
  const [openaiOrgIdInput, setOpenaiOrgIdInput] = useState('');
  const [gcpProjectIdInput, setGcpProjectIdInput] = useState('');
  const [gcpDatasetInput, setGcpDatasetInput] = useState('');
  const [gcpTableInput, setGcpTableInput] = useState('');
  const [openaiSubInput, setOpenaiSubInput] = useState('');
  const [anthropicSubInput, setAnthropicSubInput] = useState('');
  const [openaiRenewalDayInput, setOpenaiRenewalDayInput] = useState('');
  const [anthropicRenewalDayInput, setAnthropicRenewalDayInput] = useState('');
  const [openaiSubNameInput, setOpenaiSubNameInput] = useState('');
  const [anthropicSubNameInput, setAnthropicSubNameInput] = useState('');
  const [openaiRemainingCreditInput, setOpenaiRemainingCreditInput] = useState('');
  const [anthropicRemainingCreditInput, setAnthropicRemainingCreditInput] = useState('');
  const [geminiRemainingCreditInput, setGeminiRemainingCreditInput] = useState('');
  const [geminiAiStudioMonthTotalInput, setGeminiAiStudioMonthTotalInput] = useState('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [manualFiveHour, setManualFiveHour] = useState('');
  const [manualWeekly, setManualWeekly] = useState('');
  const [manualMemo, setManualMemo] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (res.status === 401) {
          router.replace('/login');
          return null;
        }
        return res.json();
      })
      .then((data: SettingsResponse | null) => {
        if (!data) return;
        setSettings(data);
        setBudgetInput(String(data.monthlyBudgetJpy));
        setFxInput(data.fx.rate ?? '');
        setSyncIntervalInput(String(data.syncIntervalMinutes));
        setGeminiFiltersInput(data.geminiServiceFilters);
        setManualMemo(data.claudeCodeManualMemo);
        setOpenaiOrgIdInput(data.openaiOrganizationId);
        setGcpProjectIdInput(data.gcpBillingProjectId);
        setGcpDatasetInput(data.gcpBillingDataset);
        setGcpTableInput(data.gcpBillingTable);
        setOpenaiSubInput(String(data.openaiMonthlySubscriptionJpy || ''));
        setAnthropicSubInput(String(data.anthropicMonthlySubscriptionUsd || ''));
        setOpenaiRenewalDayInput(data.openaiSubscriptionRenewalDay);
        setAnthropicRenewalDayInput(data.anthropicSubscriptionRenewalDay);
        setOpenaiSubNameInput(data.openaiSubscriptionName);
        setAnthropicSubNameInput(data.anthropicSubscriptionName);
        setOpenaiRemainingCreditInput(data.openaiRemainingCreditUsd);
        setAnthropicRemainingCreditInput(data.anthropicRemainingCreditUsd);
        setGeminiRemainingCreditInput(data.geminiRemainingCreditJpy);
        setGeminiAiStudioMonthTotalInput(data.geminiAiStudioMonthTotalJpy);
      });
  }, [router]);

  async function saveSettings(patch: Record<string, unknown>) {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMessage('保存しました');
    } catch (err) {
      setSaveMessage(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleProvider(provider: string, enabled: boolean) {
    await saveSettings({ providerToggles: { [provider]: enabled } });
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            providers: prev.providers.map((p) => (p.provider === provider ? { ...p, enabled } : p)),
          }
        : prev,
    );
  }

  async function toggleRule(ruleType: string, threshold: number, enabled: boolean) {
    await saveSettings({ notificationRules: [{ ruleType, threshold, enabled }] });
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            notificationRules: prev.notificationRules.map((r) =>
              r.ruleType === ruleType && r.threshold === threshold ? { ...r, enabled } : r,
            ),
          }
        : prev,
    );
  }

  async function submitManualClaudeCode(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/claude-code/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fiveHourUsedPercent: Number(manualFiveHour),
          weeklyUsedPercent: Number(manualWeekly),
          memo: manualMemo,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveMessage('Claude Codeの利用率を保存しました');
    } catch (err) {
      setSaveMessage(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  if (!settings) {
    return <div className="p-6 text-center text-sm text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">設定</h1>
        <Link href="/dashboard" className="text-sm text-blue-600 dark:text-blue-400">
          ダッシュボードへ戻る
        </Link>
      </header>

      {saveMessage && <p className="text-sm text-gray-600 dark:text-gray-300">{saveMessage}</p>}

      <Section title="接続状況 (APIキー)">
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          APIキー・秘密鍵そのものはセキュリティ上の理由でこの画面から入力できません。未設定のものは
          プロジェクトの{' '}
          <code className="rounded bg-gray-100 px-1 dark:bg-neutral-800">.env.local</code>{' '}
          に追加してサーバーを再起動してください (手順は各 docs/SETUP_*.md を参照)。
        </p>
        <SecretRow
          label="OpenAI Admin APIキー"
          configured={settings.secrets.openaiAdminKeyConfigured}
          envVar="OPENAI_ADMIN_API_KEY"
        />
        <SecretRow
          label="Anthropic Admin APIキー"
          configured={settings.secrets.anthropicAdminKeyConfigured}
          envVar="ANTHROPIC_ADMIN_API_KEY"
        />
        <SecretRow
          label="Google サービスアカウントJSON"
          configured={settings.secrets.googleServiceAccountConfigured}
          envVar="GOOGLE_SERVICE_ACCOUNT_JSON"
        />
        <SecretRow
          label="Web Push (VAPID)"
          configured={settings.secrets.vapidConfigured}
          envVar="NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY"
        />
        <SecretRow
          label="為替レート自動取得API"
          configured={settings.secrets.fxApiConfigured}
          envVar="FX_API_URL (任意)"
        />
      </Section>

      <Section title="月額上限・為替">
        <Field label="月額上限 (円)">
          <input
            type="number"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            onBlur={() => saveSettings({ monthlyBudgetJpy: Number(budgetInput) })}
            className={inputClass}
          />
        </Field>
        <Field label="手動為替レート (JPY / USD)">
          <input
            type="text"
            value={fxInput}
            placeholder={settings.fx.rate ?? '例: 150.00'}
            onChange={(e) => setFxInput(e.target.value)}
            onBlur={() => fxInput && saveSettings({ fxManualRate: fxInput })}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-gray-400">
          現在の適用レート: {settings.fx.rate ?? '未設定'} ({settings.fx.source ?? '-'})
        </p>
      </Section>

      <Section title="同期設定">
        <Field label="コスト系(OpenAI/Anthropic/Gemini)の同期間隔 (分)">
          <input
            type="number"
            value={syncIntervalInput}
            onChange={(e) => setSyncIntervalInput(e.target.value)}
            onBlur={() => saveSettings({ syncIntervalMinutes: Number(syncIntervalInput) })}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-gray-400">
          Codexの利用枠は別枠で頻繁に同期されます(環境変数 CODEX_SYNC_INTERVAL_MINUTES、既定5分)。
          Claude Codeは手動入力のみのため定期同期の対象外です。
        </p>
      </Section>

      <Section title="連携の有効/無効">
        {settings.providers.map((p) => (
          <label key={p.provider} className="flex items-center justify-between py-1.5 text-sm">
            <span>{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
            <input
              type="checkbox"
              checked={p.enabled}
              onChange={(e) => toggleProvider(p.provider, e.target.checked)}
            />
          </label>
        ))}
      </Section>

      <Section title="OpenAI組織設定 (任意)">
        <Field label="Organization ID">
          <input
            type="text"
            value={openaiOrgIdInput}
            onChange={(e) => setOpenaiOrgIdInput(e.target.value)}
            onBlur={() => saveSettings({ openaiOrganizationId: openaiOrgIdInput })}
            className={inputClass}
            placeholder="org-..."
          />
        </Field>
      </Section>

      <Section title="月額サブスクリプション料金">
        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
          ChatGPT・Claudeなどの固定月額費用。API利用料とは別課金で
          自動取得できないため、金額が分かっている場合のみ入力してください。
          ChatGPTは円建て、Claudeはドル建てで課金されるため、それぞれの通貨で入力すると
          ダッシュボード側で現在の為替レートを使って円換算します。
        </p>
        <Field label="ChatGPT プラン名">
          <input
            type="text"
            value={openaiSubNameInput}
            onChange={(e) => setOpenaiSubNameInput(e.target.value)}
            onBlur={() => saveSettings({ openaiSubscriptionName: openaiSubNameInput })}
            className={inputClass}
            placeholder="例: ChatGPT Plus"
          />
        </Field>
        <Field label="ChatGPT 月額 (円)">
          <input
            type="number"
            min={0}
            value={openaiSubInput}
            onChange={(e) => setOpenaiSubInput(e.target.value)}
            onBlur={() =>
              saveSettings({ openaiMonthlySubscriptionJpy: Number(openaiSubInput) || 0 })
            }
            className={inputClass}
            placeholder="例: 3000"
          />
        </Field>
        <Field label="ChatGPT 更新日 (1〜28日、任意)">
          <input
            type="number"
            min={1}
            max={28}
            value={openaiRenewalDayInput}
            onChange={(e) => setOpenaiRenewalDayInput(e.target.value)}
            onBlur={() => saveSettings({ openaiSubscriptionRenewalDay: openaiRenewalDayInput })}
            className={inputClass}
            placeholder="例: 5"
          />
        </Field>
        <Field label="Claude プラン名">
          <input
            type="text"
            value={anthropicSubNameInput}
            onChange={(e) => setAnthropicSubNameInput(e.target.value)}
            onBlur={() => saveSettings({ anthropicSubscriptionName: anthropicSubNameInput })}
            className={inputClass}
            placeholder="例: Claude Pro"
          />
        </Field>
        <Field label="Claude 月額 (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={anthropicSubInput}
            onChange={(e) => setAnthropicSubInput(e.target.value)}
            onBlur={() =>
              saveSettings({ anthropicMonthlySubscriptionUsd: Number(anthropicSubInput) || 0 })
            }
            className={inputClass}
            placeholder="例: 20"
          />
        </Field>
        {Number(anthropicSubInput) > 0 && settings.fx.rate && (
          <p className="text-xs text-gray-400">
            現在のレートで約{formatJpy(Number(anthropicSubInput) * Number(settings.fx.rate))}
            (USD/JPY {settings.fx.rate})
          </p>
        )}
        <Field label="Claude 更新日 (1〜28日、任意)">
          <input
            type="number"
            min={1}
            max={28}
            value={anthropicRenewalDayInput}
            onChange={(e) => setAnthropicRenewalDayInput(e.target.value)}
            onBlur={() =>
              saveSettings({ anthropicSubscriptionRenewalDay: anthropicRenewalDayInput })
            }
            className={inputClass}
            placeholder="例: 12"
          />
        </Field>
        <p className="text-xs text-gray-400">
          更新日を設定すると、その日にWeb Pushで料金確認のリマインドが届きます(1〜28日のみ指定可、
          月によって日数が違うため29日以降は使えません)。
        </p>
      </Section>

      <Section title="API残クレジット">
        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
          利用料APIでは残高を取得できないため、各サービスのコンソールに表示される残クレジットを入力してください(OpenAI/Claudeは
          USD、Geminiは 円)。空欄のままならダッシュボードには「未設定」と表示されます。
          Geminiは入力時点の残高を基準に、その後同期された利用料金の増分を自動で差し引きます。
        </p>
        <Field label="OpenAI 残クレジット (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={openaiRemainingCreditInput}
            onChange={(e) => setOpenaiRemainingCreditInput(e.target.value)}
            onBlur={() => saveSettings({ openaiRemainingCreditUsd: openaiRemainingCreditInput })}
            className={inputClass}
            placeholder="例: 12.50"
          />
        </Field>
        <Field label="Claude API 残クレジット (USD)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={anthropicRemainingCreditInput}
            onChange={(e) => setAnthropicRemainingCreditInput(e.target.value)}
            onBlur={() =>
              saveSettings({ anthropicRemainingCreditUsd: anthropicRemainingCreditInput })
            }
            className={inputClass}
            placeholder="例: 20.00"
          />
        </Field>
        <Field label="Gemini 残クレジット (円)">
          <input
            type="number"
            min={0}
            step="1"
            value={geminiRemainingCreditInput}
            onChange={(e) => setGeminiRemainingCreditInput(e.target.value)}
            onBlur={() => saveSettings({ geminiRemainingCreditJpy: geminiRemainingCreditInput })}
            className={inputClass}
            placeholder="例: 500"
          />
        </Field>
        <Field label="Gemini AI Studio 今月合計 (円、任意)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={geminiAiStudioMonthTotalInput}
            onChange={(e) => setGeminiAiStudioMonthTotalInput(e.target.value)}
            onBlur={() =>
              saveSettings({ geminiAiStudioMonthTotalJpy: geminiAiStudioMonthTotalInput })
            }
            className={inputClass}
            placeholder="例: 178.81"
          />
        </Field>
        <p className="text-xs text-gray-400">
          AI Studio の「合計費用」を入力すると、Gemini
          の今月料金とダッシュボード合計にその値を優先表示します。翌月は空欄に戻してから新しい合計を入力してください。
        </p>
      </Section>

      <Section title="Gemini / Google Cloud Billing 接続先">
        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
          これらはIDやデータセット名で秘密情報ではないため、ここから設定できます。
          サービスアカウントJSON自体は上の「接続状況」の通り.env.local限定です。
        </p>
        <Field label="GCPプロジェクトID">
          <input
            type="text"
            value={gcpProjectIdInput}
            onChange={(e) => setGcpProjectIdInput(e.target.value)}
            onBlur={() => saveSettings({ gcpBillingProjectId: gcpProjectIdInput })}
            className={inputClass}
            placeholder="my-gcp-project"
          />
        </Field>
        <Field label="BigQueryデータセット名">
          <input
            type="text"
            value={gcpDatasetInput}
            onChange={(e) => setGcpDatasetInput(e.target.value)}
            onBlur={() => saveSettings({ gcpBillingDataset: gcpDatasetInput })}
            className={inputClass}
            placeholder="billing_export"
          />
        </Field>
        <Field label="BigQueryテーブル名">
          <input
            type="text"
            value={gcpTableInput}
            onChange={(e) => setGcpTableInput(e.target.value)}
            onBlur={() => saveSettings({ gcpBillingTable: gcpTableInput })}
            className={inputClass}
            placeholder="gcp_billing_export_v1_XXXXXX"
          />
        </Field>
        <Field label="対象サービス/SKU名 (カンマ区切り)">
          <input
            type="text"
            value={geminiFiltersInput}
            onChange={(e) => setGeminiFiltersInput(e.target.value)}
            onBlur={() => saveSettings({ geminiServiceFilters: geminiFiltersInput })}
            className={inputClass}
            placeholder="Generative Language API, Vertex AI API"
          />
        </Field>
      </Section>

      <Section title="通知しきい値">
        {settings.notificationRules.map((r) => (
          <label
            key={`${r.ruleType}-${r.threshold}`}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span>
              {RULE_LABEL[r.ruleType] ?? r.ruleType}
              {r.threshold > 0 ? ` ${r.threshold}%` : ''}
            </span>
            <input
              type="checkbox"
              checked={r.enabled}
              onChange={(e) => toggleRule(r.ruleType, r.threshold, e.target.checked)}
            />
          </label>
        ))}
        <label className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm dark:border-neutral-800">
          <span>しきい値を下回った後の再通知を許可</span>
          <input
            type="checkbox"
            checked={settings.notificationRepeatAfterDrop}
            onChange={(e) => {
              saveSettings({ notificationRepeatAfterDrop: e.target.checked });
              setSettings((prev) =>
                prev ? { ...prev, notificationRepeatAfterDrop: e.target.checked } : prev,
              );
            }}
          />
        </label>
      </Section>

      <Section title="Claude Code 手動入力">
        <form onSubmit={submitManualClaudeCode} className="space-y-2">
          <Field label="5時間枠 使用率 (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={manualFiveHour}
              onChange={(e) => setManualFiveHour(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="週間枠 使用率 (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={manualWeekly}
              onChange={(e) => setManualWeekly(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="メモ">
            <textarea
              value={manualMemo}
              onChange={(e) => setManualMemo(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            保存
          </button>
        </form>
      </Section>

      {settings.useMockData && (
        <Section title="モックシナリオ (開発用)">
          <select
            value={settings.mockScenario}
            onChange={(e) => {
              saveSettings({ mockScenario: e.target.value });
              setSettings((prev) => (prev ? { ...prev, mockScenario: e.target.value } : prev));
            }}
            className={inputClass}
          >
            {MOCK_SCENARIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Section>
      )}

      <Section title="Web Push 通知">
        <PushSettings />
      </Section>

      <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400">
        ログアウト
      </button>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800';

function SecretRow({
  label,
  configured,
  envVar,
}: {
  label: string;
  configured: boolean;
  envVar: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div>
        <p>{label}</p>
        <p className="text-xs text-gray-400">{envVar}</p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          configured
            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
            : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-gray-400'
        }`}
      >
        {configured ? '設定済み' : '未設定'}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
      <h2 className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}
