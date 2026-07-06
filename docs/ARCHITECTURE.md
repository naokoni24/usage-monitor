# アーキテクチャ

## 全体構成

```
Mac (Next.js 本番ビルド, launchdで常駐)
├─ src/app            App Router (pages + API route handlers)
├─ src/instrumentation.ts   起動時フック: 通知ルールのシード + 定期同期ループ開始
├─ src/proxy.ts        認証ガード (旧middleware.ts。Next.js 16でproxyに改称)
├─ src/lib
│  ├─ auth             パスワード認証・署名Cookie・レート制限
│  ├─ database         Drizzle ORM スキーマ / クライアント / app_settings
│  ├─ providers         OpenAI / Anthropic / Gemini(BigQuery) のコスト取得クライアント
│  ├─ codex             Codex App Server JSON-RPCクライアント
│  ├─ claude-code       手動入力 + 実験的パーサー
│  ├─ currency          為替レート解決 (優先順位フォールバック)
│  ├─ budget            月次予算の取得/更新
│  ├─ notifications     通知ルール評価 + Web Push送信
│  ├─ mock              モックモード用シナリオ生成
│  ├─ scheduler         同期エンジン (リトライ/バックオフ) + 定期実行ループ
│  └─ dashboard         ダッシュボードJSON組み立て
├─ SQLite (data/ai-usage.db)
└─ Cloudflare Tunnel (任意) 経由でHTTPS公開

iPhone
├─ Safari → ホーム画面に追加 → standalone PWA
└─ Web Push通知を受信 (Service Worker: public/sw.js)
```

## データフロー

1. `src/instrumentation.ts` の `register()` がサーバー起動時に一度だけ実行され、
   通知ルールのデフォルトをシードし、`startPeriodicSync()` で定期同期ループを開始する。
2. 定期同期ループ (`src/lib/scheduler/interval.ts`) は `SYNC_INTERVAL_MINUTES` (設定画面からも変更可) ごとに
   `runFullSync()` を呼び出す。
3. `runFullSync()` (`src/lib/scheduler/sync-engine.ts`) は以下を独立して並行実行する:
   - 為替レートの日次同期 (`syncFxRateIfDue`)
   - OpenAI / Anthropic / Gemini のコスト取得 → `usage_daily` へ upsert
   - Codex / Claude Code の利用枠取得 → `subscription_limits` へ追記
   - 各プロバイダーの成功/失敗は `provider_connections` と `sync_runs` に記録され、
     1つのプロバイダーが失敗しても他のプロバイダーの同期は継続する (`Promise.allSettled`)。
4. 同期後に `evaluateAndSendNotifications()` が現在のダッシュボード状態を計算し、
   しきい値を超えた通知ルールについて Web Push を送信する (`notification_events` で月内の重複を防止)。
5. ダッシュボード / iPhone PWA は `GET /api/dashboard` を呼び出し、上記のテーブルから
   組み立てられたJSONを表示する。

## 金額の扱い

`usage_daily.cost_original` / `cost_jpy` / `fx_rate` はすべて **decimal文字列** として保存する
(JavaScriptの`number`の丸め誤差を避けるため)。計算には `decimal.js` を使用する
(`src/lib/currency/resolve.ts`)。

## 認証の分離

`src/lib/auth/session.ts` と `src/lib/auth/guard.ts` に認証ロジックを集約している。
将来OAuthに置き換える場合は、この2ファイルと `src/proxy.ts` / `src/app/login` /
`src/app/api/auth/*` のみを差し替えればよい。

## モックモード

`USE_MOCK_DATA=true` の場合、各プロバイダークライアント (`src/lib/providers/*.ts`,
`src/lib/codex/sync.ts`, `src/lib/claude-code/sync.ts`) は実際のネットワーク呼び出しを行わず、
`src/lib/mock/*` のシナリオ生成関数を呼び出す。同期エンジン・ダッシュボード集計・通知評価は
本番と全く同じコードパスを通るため、モックと実データで挙動が分岐しない。
