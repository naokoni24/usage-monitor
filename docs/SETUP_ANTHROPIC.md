# Anthropic (Claude API) 連携セットアップ

## 必要な環境変数

```
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin...
```

## 重要: Admin API キーが必要

通常のClaude APIキー (`sk-ant-api03-...`) では利用状況・コストAPIにアクセスできない。
**Admin API キー** が必要。

1. https://console.anthropic.com/ の組織設定 (Organization) から
   **Admin API Keys** を発行する (Owner/Adminロールが必要)
2. 発行したキーを `ANTHROPIC_ADMIN_API_KEY` に設定する

## 使用しているエンドポイント (2026年7月時点で確認済み)

- `GET /v1/organizations/cost_report` — 日次コスト
  - `amount` は **最小通貨単位 (セント) の10進数文字列** で返る (例: `"150.00"` = $1.50)。
    本アプリはこれを100で割ってドルに変換している。
- `GET /v1/organizations/usage_report/messages` — 日次トークン数
  - `uncached_input_tokens` / `output_tokens` / `cache_read_input_tokens` /
    `cache_creation.ephemeral_{1h,5m}_input_tokens` を集計する。
  - **リクエスト数を示すフィールドは存在しない** ため、Claude APIカードの「リクエスト数」は
    常に「取得不可」と表示される (推測で埋めない)。

認証ヘッダーは `x-api-key` + `anthropic-version: 2023-06-01`。

## Claude Code との違い

このドキュメントはAPI従量課金 (Claude API) の料金取得についてのみ扱う。
Claude Codeサブスクリプションの5時間枠・週間枠は別物であり、
`docs/SETUP_CLAUDE_CODE.md` を参照すること。
