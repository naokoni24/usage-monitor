# Web Push通知セットアップ

## VAPIDキーの生成

```bash
npx web-push generate-vapid-keys
```

出力された `publicKey` / `privateKey` を以下に設定する:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BI...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

`VAPID_PRIVATE_KEY` はサーバー環境変数のみで保持し、絶対にクライアントへ送らない
(`NEXT_PUBLIC_` プレフィックスが付いているのは公開鍵のみ)。

## iPhoneでの利用条件

iOS Safariの仕様上、**ホーム画面に追加したPWAをそのアイコンから起動した場合のみ**
Web Push通知を受信できる。通常のSafariタブでは通知許可自体は取得できるが、
バックグラウンドでの受信は保証されない。`docs/SETUP_PWA.md` の手順を先に行うこと。

## 有効化の流れ (アプリ内)

1. 設定画面 → 「通知を有効にする」ボタンを押す (ページ表示直後には自動要求しない)
2. `Notification.requestPermission()` が呼ばれ、許可されると
   `PushManager.subscribe()` でSubscriptionを取得
3. `POST /api/push/subscribe` でSQLiteに保存 (`push_subscriptions`, endpointで一意)
4. 「テスト通知を送信」で `POST /api/push/test` を呼び、全Subscriptionに送信

## 無効なSubscriptionの自動削除

`web-push` の送信結果が `404`/`410` (Subscriptionが失効) の場合、
`src/lib/notifications/web-push.ts` が該当行を自動的に削除する。

## 通知ルールと重複防止

`notification_rules` / `notification_events` (`src/lib/notifications/evaluate.ts`) が、
同じ月・同じルール種別・同じしきい値・同じプロバイダーの組み合わせで二重送信しないよう
DBのユニーク制約で保証している。しきい値を下回った後の再送可否は、設定画面の
「しきい値を下回った後の再通知」トグルで制御できる。
