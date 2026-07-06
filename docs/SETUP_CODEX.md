# Codex利用枠セットアップ

## 前提

- `codex` CLI (Codex App Serverを含む) がMacにインストール済みで、ログイン済みであること
- 環境変数 `CODEX_APP_SERVER_COMMAND` を設定しない場合、既定で `codex app-server` を起動する

```
CODEX_ENABLED=true
CODEX_APP_SERVER_COMMAND=   # 例: /usr/local/bin/codex app-server (通常は空欄でOK)
CODEX_SYNC_INTERVAL_MINUTES=15
```

## 仕組み

同期のたびに、本アプリは **専用の** `codex app-server` プロセスを子プロセスとして起動し、
JSON-RPC (stdio, 改行区切り) で以下を呼び出す:

1. `initialize` → `initialized` (ハンドシェイク)
2. `account/read` — ログイン状態の確認
3. `account/rateLimits/read` — 5時間枠・週間枠の使用率とリセット時刻を取得
   (`primary`/`secondary` の `windowDurationMins` から、360分以下を5時間枠、それ以上を週間枠として分類)

このプロセスは同期完了後に本アプリ自身が終了させる。**ユーザーが対話的に使っている
別のCodexセッション (TUIなど) には一切干渉しない** (別プロセスのため)。

Codexのログイン認証情報・会話内容・プロンプト・コード・ファイルパスは一切保存しない。
SQLiteに保存するのは利用率とリセット日時のみ。

## 表示される状態

- **未ログイン**: `account/read` が `requiresOpenaiAuth: true` かつアカウント未設定
- **App Server未起動**: `codex app-server` の起動に失敗 (CLI未インストールなど)
- **メソッド未対応**: `account/rateLimits/read` がJSON-RPCエラー `-32601` (Method not found) を返した場合
  (古いCodexバージョンなど)
- **取得失敗**: タイムアウトやその他のエラー
- **データ期限切れ**: 表示側で最終取得から一定時間が経過している場合に警告表示
