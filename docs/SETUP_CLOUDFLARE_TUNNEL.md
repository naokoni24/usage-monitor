# Cloudflare Tunnel セットアップ

iPhoneからMac上のアプリへHTTPSでアクセスするために使用する。

## 1. cloudflaredのインストール

```bash
brew install cloudflared
```

## 2. Cloudflareにログイン & トンネル作成

```bash
cloudflared tunnel login
cloudflared tunnel create ai-usage-monitor
```

出力される `Tunnel ID` と認証情報ファイル (`~/.cloudflared/<ID>.json`) を控える。

## 3. 設定ファイル

`cloudflared.example.yml` を `~/.cloudflared/config.yml` にコピーし、
`tunnel` / `credentials-file` / `hostname` を自分の値に置き換える。

## 4. DNSルーティング設定

```bash
cloudflared tunnel route dns ai-usage-monitor ai-usage.example.com
```

## 5. Next.js接続確認

Next.js本番サーバー (`npm run start`, 既定ポート3000) が起動していることを確認した上で、

```bash
cloudflared tunnel run ai-usage-monitor
```

を実行し、`https://ai-usage.example.com` にアクセスできるか確認する。

## 6. 自動起動 (launchd登録)

```bash
sudo cloudflared service install
```

cloudflaredには公式のlaunchd登録コマンドが用意されているため、これを使うのが最も確実。
アンインストールは `sudo cloudflared service uninstall`。

## Cloudflare Tunnelを使わない場合 (同一LAN内アクセス)

Mac側で `npm run start` を実行後、iPhoneが同じWi-Fiに接続していれば
`http://<MacのローカルIP>:3000` で直接アクセスできる (`ifconfig` や
`npm run dev` のログに表示される `Network:` のURLを参照)。

**ただしHTTP接続では以下が動作しない:**
- Service Workerの登録 (`localhost`以外はHTTPS必須)
- Web Push通知
- 一部のPWA機能 (ホーム画面追加自体はできるがstandalone表示が不安定な場合がある)

そのため実運用ではCloudflare Tunnel (またはその他のHTTPSリバースプロキシ) を推奨する。

## セキュリティ上の注意事項

- このアプリは個人利用前提のシンプルなパスワード認証のみを持つ。
  **インターネットに公開する場合は、Cloudflare Access を必ず併用することを強く推奨する。**
- Cloudflare Zero Trust ダッシュボード → Access → Applications で、
  対象ホスト名に対して「指定したメールアドレスのみアクセス可能」なポリシーを設定できる。
  これにより、アプリのログイン画面に到達する前段階で認証を要求できる。
- Tunnel経由で公開する場合も、`APP_PASSWORD` は推測されにくい十分な長さのものを設定すること。
