# Claude Code利用枠セットアップ

Claude Codeの個人サブスクリプションの5時間枠・週間枠には、安定した一般公開APIが
存在しない (2026年7月時点)。そのため本アプリは3段階のフォールバックを実装している。

## 第1優先: 公式情報 (未対応)

現時点でClaude Codeの利用状況を取得できる安定した公式API/コマンドは確認できなかったため、
このパスは実装していない。将来公式APIが提供された場合は `src/lib/claude-code/sync.ts` に
実装を追加する想定。

## 第2優先: 手動入力 (推奨・実装済み)

設定画面 (`/settings`) から以下を入力できる:

- 5時間枠の使用率 (%)
- 週間枠の使用率 (%)
- メモ

保存は `POST /api/claude-code/manual` で行われ、`subscription_limits` に
`source: manual` として記録される。ダッシュボードには「取得元: manual」「概算」と表示される。

## 第3優先: 実験的ローカル解析 (既定で無効)

```
ENABLE_CLAUDE_USAGE_PARSER=false   # trueにすると有効化
CLAUDE_CODE_USAGE_COMMAND=          # 利用状況をテキスト出力するコマンド
```

`ENABLE_CLAUDE_USAGE_PARSER=true` かつ `CLAUDE_CODE_USAGE_COMMAND` が設定されている場合のみ、
そのコマンドを実行し、標準出力からANSI制御文字を除去した上で `5-hour: NN%` / `weekly: NN%`
のようなパターンを正規表現で探す。

**制約・注意事項:**

- これは非公式・実験的な機能であり、Claude Codeのバージョンアップで簡単に壊れる
- 会話内容やプロンプトは一切読み取らない。利用状況の出力のみを対象とする
- 解析に失敗した場合、**0%として保存することは絶対にしない**。「取得不可」として扱う
- 成功時も `source: experimental-parser` / `confidence: low` として記録され、
  画面には「非公式取得」と明示される
- 現状は `node:child_process` の通常パイプ経由での実行であり、**真のPTYエミュレーションは
  行っていない** (node-ptyのようなネイティブ依存を追加しない方針のため)。
  対話的UIしか利用状況を出さないツールの場合は動作しない可能性がある
- `ENABLE_CLAUDE_USAGE_PARSER=false` に戻すだけでいつでも無効化できる
- このパーサーが例外を投げても、アプリ全体やほかのプロバイダーの同期には影響しない
