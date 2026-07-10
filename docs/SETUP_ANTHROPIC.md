# Anthropic (Claude API) 連携セットアップ

## 必要な環境変数

```
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin...
```

## 重要: Admin API キーが必要

通常のClaude APIキー (`sk-ant-api03-...`) では利用状況・コストAPIにアクセスできない。
**Admin API キー** (`sk-ant-admin01-...`) が必要。

1. https://platform.claude.com/settings/admin-keys を開く
   (Claude Console/Claude Platform用。組織の **admin** ロールを持つメンバーのみ作成可能)
2. **Create key** → 名前を付けて **Create**
3. 表示された `sk-ant-admin01-...` を `ANTHROPIC_ADMIN_API_KEY` に設定する (この画面でしか表示されないため必ずコピーしておく)

**注意:** Admin APIキーは個人アカウントでは発行できない。組織 (Team/Enterprise等の有料プラン)
に所属し、admin ロールを持っている必要がある。個人プランのみの場合はこの経路での取得はできない。

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
