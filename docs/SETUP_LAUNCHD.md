# launchd常駐化セットアップ

Mac起動・ログイン後にNext.jsの本番サーバーを自動起動し続けるための設定。

## 前提

`npm run build` が正常に完了していること (launchdは本番ビルドを `npm run start` で
起動するだけで、ビルド自体は行わない)。

## ファイル構成

- `scripts/launchd/com.aiusagemonitor.app.plist.template` — plistテンプレート
  (`__PROJECT_DIR__` / `__NPM_BIN__` / `__PATH_ENV__` をインストール時に実値へ置換)
- `scripts/service-install.sh` — テンプレートから実plistを生成し `~/Library/LaunchAgents/` へ配置、
  `launchctl bootstrap` で登録
- `scripts/service-start.sh` — `launchctl kickstart -k` で起動/再起動
- `scripts/service-stop.sh` — `launchctl bootout` で停止 (次回起動まで自動再起動しない)
- `scripts/service-status.sh` — `launchctl print` で状態確認
- `scripts/service-uninstall.sh` — 登録解除 + plist削除

## コマンド

```bash
npm run build
npm run service:install
npm run service:start
npm run service:status
npm run service:stop
npm run service:uninstall
```

## ログ

標準出力・標準エラーは `logs/launchd.out.log` / `logs/launchd.err.log` に出力される
(APIキーやパスワードはログに出力しない設計になっている)。

## 環境変数について

launchdのplistには秘密情報を一切埋め込んでいない。Next.jsの本番サーバーは
起動時にプロジェクトルートの `.env.local` を自動的に読み込むため、
`.env.local` のファイルパーミッションのみで秘密情報を保護できる。

```bash
chmod 600 .env.local
```

を実行しておくことを推奨する。
