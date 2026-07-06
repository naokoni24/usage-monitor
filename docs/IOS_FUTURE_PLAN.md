# 将来のiOSネイティブアプリ移行プラン

現時点ではPWA (Safari + ホーム画面追加 + Web Push) のみを実装しているが、
`GET /api/dashboard` のレスポンスはSwiftの `Codable` で直接デコードできるよう、
フラットな構造・camelCaseキー・明示的な `null` (undefinedではなく) で設計してある
(`src/types/dashboard.ts`)。

## そのまま再利用できるもの

- `GET /api/dashboard` — ダッシュボード全体のJSON (今日/今月合計、プロバイダー別カード、
  利用枠カード、通知状況、警告一覧)
- `GET /api/usage/daily` / `GET /api/usage/monthly` — 日別・月別の生データ
- `GET /api/providers/status` — 接続状態
- `POST /api/sync` — 手動同期トリガー
- `POST /api/claude-code/manual` — Claude Code手動入力
- 認証: `APP_PASSWORD` ベースのログイン (`POST /api/auth/login`) は、iOS側でCookieを
  保持できるURLSessionの設定さえすれば流用可能。将来的にはOAuthやトークン認証への
  切り替えも、`src/lib/auth/` 以下の差し替えのみで対応できるよう分離してある。

## ネイティブアプリ化にあたって追加検討が必要なもの

- **プッシュ通知**: 現在はWeb Push (VAPID) だが、ネイティブアプリではAPNs
  (Apple Push Notification service) への切り替えが必要。`push_subscriptions` テーブルの
  スキーマをAPNsデバイストークン用に拡張するか、別テーブルを追加する。
- **WidgetKit**: ホーム画面ウィジェットで今日/今月の金額を表示する場合、
  App GroupsでSQLiteまたはUserDefaultsを共有するか、`/api/dashboard` を
  ウィジェットのタイムラインプロバイダーから定期的に呼び出す構成にする。
- **認証トークン**: Cookieベースの認証はネイティブアプリとは相性が悪いため、
  Bearerトークン方式への移行を推奨。
- **オフライン**: 現在はService Workerによるキャッシュのみ。ネイティブアプリでは
  CoreDataやSwiftDataでのローカルキャッシュ実装が必要。

## 非対応 (今回のスコープ外)

- iOSネイティブアプリの実装そのもの
- WidgetKitの実装
- APNs送信ロジック
