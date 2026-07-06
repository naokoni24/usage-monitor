# PWAセットアップ

## 構成済みのファイル

- `public/manifest.webmanifest` — アプリ名・アイコン・`display: standalone`・テーマカラー
- `public/sw.js` — Service Worker (オフラインキャッシュ・Push受信・通知クリック処理)
- `public/offline.html` — オフライン時のフォールバック画面
- `public/icons/icon-192.png` / `icon-512.png` / `apple-touch-icon.png` — プレースホルダーアイコン
- `src/app/layout.tsx` — `apple-mobile-web-app-capable` 等のAppleメタタグ、`theme-color`

## アイコンの差し替え方法

`public/icons/` 配下の3つのPNG (192×192, 512×512, 180×180) を、実際のロゴ画像で
同名のまま上書きするだけでよい。追加のビルド設定は不要。

## iPhoneでの利用手順

1. Safariで公開URL (Cloudflare Tunnel経由、またはLAN内URL) にアクセス
2. 共有ボタン → 「ホーム画面に追加」
3. ホーム画面のアイコンから起動する (Safariタブではなくstandaloneアプリとして開く)
4. 設定画面から「通知を有効にする」を押して通知許可を行う

**重要:** HTTP接続では Service Worker・Web Push・一部のPWA機能が動作しない。
Cloudflare Tunnel等でHTTPS公開するか、`localhost`でのみ動作確認する。

## 更新通知

Service Workerが新しいバージョンに置き換わると (`activate`イベント)、開いている
クライアントに `postMessage({type:'sw-updated'})` が送られ、画面上に再読み込みの
確認ダイアログが表示される (`src/components/service-worker-register.tsx`)。
