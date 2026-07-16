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
│  ├─ runcat           RunCat Neo用JSONスナップショット出力
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
   通知ルールのデフォルトをシードし、`startPeriodicSync()` で2本の定期同期ループを開始する。
2. 同期は**更新頻度が全く違う2系統**に分けて独立したループで走る (`src/lib/scheduler/interval.ts`):
   - **コスト系** (`syncCostProviders`): OpenAI / Anthropic / Gemini はどれも実際の反映が
     数時間〜1日遅れるため、`SYNC_INTERVAL_MINUTES` (既定60分、設定画面からも変更可) ごとに
     まとめて同期する。Claude Codeも(手動入力の状態を再確認するだけなので)ここに相乗り。
     為替レートの日次同期 (`syncFxRateIfDue`) もこのタイミングで行う。
   - **Codex** (`syncCodex`): 利用枠はリクエストのたびに変わるため、`CODEX_SYNC_INTERVAL_MINUTES`
     (既定5分) という別間隔で単独同期する。
3. どちらのループも `src/lib/scheduler/sync-engine.ts` の `syncOneProvider()` を経由し、
   各プロバイダーの成功/失敗は `provider_connections` と `sync_runs` に記録される。
   1つのプロバイダーが失敗しても他のプロバイダーの同期は継続する (`Promise.allSettled`)。
   手動同期 (`POST /api/sync`, `npm run sync`) は両ループを1回ずつ即時実行する `runFullSync()` を使う。
4. コスト系同期の完了後、`src/lib/runcat/write-metric.ts` がダッシュボードと同じ集計結果から
   `/Users/nao/.runcat/ai-usage.json` を生成する。表示値に変更がない場合は既存ファイルと更新時刻を
   保持する。テストでは `RUNCAT_METRIC_FILE` を一時ファイルへ向け、本番のRunCat表示を上書きしない。
5. 各ループの同期後に `evaluateAndSendNotifications()` が現在のダッシュボード状態を計算し、
   しきい値を超えた通知ルールについて Web Push を送信する (`notification_events` で月内の重複を防止)。
6. ダッシュボード / iPhone PWA は `GET /api/dashboard` を呼び出し、上記のテーブルから
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
