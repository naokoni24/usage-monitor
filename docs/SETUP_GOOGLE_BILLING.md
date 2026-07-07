# Gemini / Google Cloud Billing 連携セットアップ

Geminiの料金はGoogle Cloud Billingの **BigQueryエクスポート** 経由で取得する
(Gemini APIやVertex AIには利用状況取得専用APIがないため)。

## 1. Billingデータのエクスポートを有効化

1. [Cloud Billing コンソール](https://console.cloud.google.com/billing) → 対象の請求先アカウント
   → **Billing export** → **BigQuery export** を有効化
   - Standard usage cost data / Detailed usage cost data のどちらでも動作する
2. エクスポート先のデータセット名・テーブル名を控える
   (テーブル名は `gcp_billing_export_v1_<請求先アカウントID>` の形式)

## 2. サービスアカウントを作成

1. GCPコンソールでサービスアカウントを作成
2. ロール: そのBigQueryデータセットに対する **BigQuery Data Viewer** と、
   クエリ実行のための **BigQuery Job User** (プロジェクトレベル) を付与
3. JSON鍵を発行し、その中身を `GOOGLE_SERVICE_ACCOUNT_JSON` に**1行のJSON文字列として**設定する
   (ファイルパスではなく中身そのもの)

## 必要な環境変数・設定

**秘密情報 (`.env.local` のみ・UIからは入力不可):**

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account", ...}
```

**非秘密の識別子 (設定画面 → 「Gemini / Google Cloud Billing 接続先」から入力可、
または `.env.local` でも可):**

```
GCP_BILLING_PROJECT_ID=your-project-id
GCP_BILLING_DATASET=billing_export
GCP_BILLING_TABLE=gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX
GCP_GEMINI_SERVICE_FILTERS=Generative Language API,Vertex AI API
```

サービスアカウントJSON (秘密鍵を含む) だけは `.env.local` に設定してサーバーを再起動する必要が
あるが、プロジェクトID・データセット名・テーブル名・サービスフィルターはいずれも秘密情報ではない
ため、設定画面から直接入力・変更できる (設定画面の値が優先され、未入力の場合は環境変数にフォール
バックする)。

`GCP_GEMINI_SERVICE_FILTERS` はカンマ区切り、または `["Generative Language API","Vertex AI API"]`
のようなJSON配列で複数のサービス名・SKU名を指定できる。`service.description` または
`sku.description` に部分一致 (LIKE) するレコードのみ集計される。

## 反映遅延について

BigQueryエクスポートには数時間〜1日程度の遅延があるため、本アプリは以下を常に表示する:

- 最終同期時刻 (このアプリがBigQueryにクエリした時刻)
- 最新の請求データ日時 (`usage_end_time` の最大値)
- 上記が48時間以上古い場合は「反映待ち」の警告をダッシュボードに表示

Geminiのコストは常に `confidence: estimated` (概算値) として扱われる。

## BigQuery未設定の場合

`GOOGLE_SERVICE_ACCOUNT_JSON` / `GCP_BILLING_PROJECT_ID` / `GCP_BILLING_DATASET` /
`GCP_BILLING_TABLE` / `GCP_GEMINI_SERVICE_FILTERS` のいずれかが未設定でも、
アプリ全体は起動し、Geminiカードのみ「未設定」と表示される。
