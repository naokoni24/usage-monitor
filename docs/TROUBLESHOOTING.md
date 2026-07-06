# トラブルシューティング

## ログインできない / `500 server is not configured`

`APP_PASSWORD` が `.env.local` に設定されていない。設定して再起動する。

## ダッシュボードが真っ白 / 401が返る

Cookieの署名検証に失敗している可能性が高い。`SESSION_SECRET` を変更した場合、
既存のCookieは無効になるため再ログインが必要。

## Codexカードが「App Server未起動」と表示される

- `codex` CLIがインストールされているか (`command -v codex`)
- `CODEX_APP_SERVER_COMMAND` を指定している場合、そのコマンドが実行可能か
- 手動で `codex app-server` を実行してエラーが出ないか確認する

## Codexカードが「未ログイン」と表示される

`codex login` (または `codex login --with-access-token` 等) でログイン済みか確認する。

## Geminiカードが「未設定」のまま

`GOOGLE_SERVICE_ACCOUNT_JSON` / `GCP_BILLING_PROJECT_ID` / `GCP_BILLING_DATASET` /
`GCP_BILLING_TABLE` / `GCP_GEMINI_SERVICE_FILTERS` の5つすべてが設定されているか確認する。
サービスアカウントに `BigQuery Data Viewer` / `BigQuery Job User` 権限があるか確認する。

## Web Push通知が届かない (iPhone)

- Safariでホーム画面に追加し、**そのアイコンから起動しているか** (Safariタブからは不可)
- HTTPS経由でアクセスしているか (HTTPでは通知が機能しない)
- 設定画面で「通知を有効にする」を押し、通知許可ダイアログで「許可」を選んだか
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` が設定されているか

## `npm run db:migrate` が失敗する

`data/` ディレクトリの書き込み権限を確認する。既存のDBファイルが壊れている場合は
`data/ai-usage.db*` を削除して再度マイグレーションを実行する (データは失われる)。

## launchd起動後にアプリが立ち上がらない

`logs/launchd.err.log` を確認する。多くの場合 `npm run build` を実行していないことが原因。

```bash
cat logs/launchd.err.log
npm run service:status
```

## ポート3000が使用中

`npm run dev` / `npm run start` はデフォルトで3000番ポートを使う。
使用中の場合は `PORT=3001 npm run start` のように環境変数で変更できる。
Cloudflare Tunnelの`config.yml`の`service:`も同じポートに合わせること。

## モックモードから実データに切り替えたい

`.env.local` の `USE_MOCK_DATA=false` に変更し、各プロバイダーの環境変数を設定した上で
サーバーを再起動する。
