# OpenAI連携セットアップ

## 必要な環境変数

```
OPENAI_ADMIN_API_KEY=sk-admin-...   # 秘密情報。.env.localのみ (UIからは入力不可)
```

`Organization ID` (`org-...`) は秘密情報ではないため、`.env.local` の `OPENAI_ORGANIZATION_ID`
の代わりに設定画面の「OpenAI組織設定」からも入力できる (複数組織に所属している場合のみ必要)。

## Admin API キーの取得方法

1. https://platform.openai.com/settings にログイン
2. 組織の **Admin keys** (Organization > API keys とは別枠) から新規キーを発行する
3. 通常のプロジェクトAPIキー (`sk-proj-...` / `sk-...`) では利用状況・料金APIにアクセスできない。
   必ず **Admin API キー** を使用すること。

## 使用しているエンドポイント (2026年7月時点で確認済み)

- `GET /v1/organization/costs` — 日次コスト (`amount.value` はドル単位)
- `GET /v1/organization/usage/completions` — 日次トークン数・リクエスト数

いずれも `bucket_width=1d` で、Asia/Tokyoの月初〜翌日0時 (UTC変換済み) を範囲として取得する。
ページネーション (`has_more` / `next_page`) に対応済み。

## エラー時の挙動

- キー未設定 → `未設定` として表示
- 401/403 (キーが無効・Admin権限不足) → `エラー` として表示し、詳細メッセージにその旨を表示

## 制約

- OpenAIのAPI仕様は変更される可能性があるため、レスポンス形式が変わった場合は
  `src/lib/providers/openai.ts` の型定義とパース処理を更新する必要がある。
