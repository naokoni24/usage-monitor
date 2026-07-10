# AI Usage Monitor

OpenAI / Claude API / Gemini / Codex / Claude Code の利用状況を1つのダッシュボードで確認できる、
Mac上で動く個人用Webアプリです。iPhoneからSafari経由・PWAとしてアクセスできます。

- ダッシュボード: 今日・今月の合計料金 (日本円換算)、月額上限に対する消化率
- OpenAI / Claude API / Gemini の料金 (今日・今月・トークン数・確定値/概算値)
- Codex / Claude Code の5時間枠・週間枠の使用率とリセット時刻
- iPhoneへのWeb Push通知 (月額上限到達、利用枠逼迫、同期エラーなど)
- モックモードで、APIキーが無くても全画面を確認可能

詳細な設計は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

## 前提とする制約

- MacがONの間だけ同期・通知が動作します (Mac起動中の常駐前提)
- iOSネイティブアプリ・WidgetKitは今回のスコープ外です (PWAのみ)
- Claude Codeの利用枠は安定した公式APIが無いため、手動入力を主とします
  ([docs/SETUP_CLAUDE_CODE.md](docs/SETUP_CLAUDE_CODE.md))

---

## 1. Node.jsの準備

Node.js 20 LTS以降を推奨します。

```bash
node -v   # v20.x 以上を確認
```

## 2. 依存パッケージのインストール

```bash
cd usage-monitor
npm install
```

## 3. 環境変数設定

```bash
cp .env.example .env.local
```

`.env.local` を編集し、最低限以下を設定してください (他はすべて任意/後述の各docsを参照):

```
APP_PASSWORD=好きなパスワード
SESSION_SECRET=$(openssl rand -base64 32)
USE_MOCK_DATA=true
```

各プロバイダーの詳細設定は以下を参照:

- [docs/SETUP_OPENAI.md](docs/SETUP_OPENAI.md)
- [docs/SETUP_ANTHROPIC.md](docs/SETUP_ANTHROPIC.md)
- [docs/SETUP_GOOGLE_BILLING.md](docs/SETUP_GOOGLE_BILLING.md)
- [docs/SETUP_CODEX.md](docs/SETUP_CODEX.md)
- [docs/SETUP_CLAUDE_CODE.md](docs/SETUP_CLAUDE_CODE.md)
- [docs/SETUP_WEB_PUSH.md](docs/SETUP_WEB_PUSH.md)

### 為替レートの自動取得 (任意・推奨)

`FX_API_URL` を設定すると、同期のたびに (最大1日1回まで) 外部APIから最新のUSD/JPYレートを
自動取得するようになる。無料・APIキー不要の例:

```
FX_API_URL=https://open.er-api.com/v6/latest/USD
```

未設定の場合は `FX_USD_JPY` の固定値、それも無ければ設定画面の手動レートにフォールバックする
(優先順位の詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) と `src/lib/currency/resolve.ts` を参照)。

## 4. SQLite初期化

```bash
npm run db:generate   # スキーマからマイグレーションSQLを生成 (schema.tsを変更した時のみ)
npm run db:migrate     # data/ai-usage.db を作成・更新
```

## 5. モックモード起動

`.env.local` の `USE_MOCK_DATA=true` のまま:

```bash
npm run dev
```

http://localhost:3000 を開き、設定した `APP_PASSWORD` でログインします。
設定画面の「モックシナリオ」から、正常/エラー/月額上限到達などのシナリオを切り替えられます。

## 6. 本番ビルド

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## 7. Macでの常駐起動

```bash
npm run build
npm run service:install
npm run service:start
npm run service:status
```

詳細は [docs/SETUP_LAUNCHD.md](docs/SETUP_LAUNCHD.md)。

## 8. Cloudflare Tunnel設定

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create ai-usage-monitor
cp cloudflared.example.yml ~/.cloudflared/config.yml   # 編集して自分の値に
cloudflared tunnel route dns ai-usage-monitor ai-usage.example.com
sudo cloudflared service install
```

詳細は [docs/SETUP_CLOUDFLARE_TUNNEL.md](docs/SETUP_CLOUDFLARE_TUNNEL.md)
(LAN内アクセスのみで済ませる方法もこちらに記載)。

## 9. iPhoneからのアクセス

Safariで `https://ai-usage.example.com` (またはLAN内URL) を開き、ログインします。

## 10. ホーム画面への追加

Safariの共有ボタン →「ホーム画面に追加」。以後はホーム画面のアイコンから起動してください
(Web Pushはこの状態でのみ機能します)。詳細は [docs/SETUP_PWA.md](docs/SETUP_PWA.md)。

## 11. 通知の有効化

設定画面 →「通知を有効にする」を押し、通知許可ダイアログで「許可」を選択します。

## 12. テスト通知

設定画面 →「テスト通知を送信」を押します。詳細は [docs/SETUP_WEB_PUSH.md](docs/SETUP_WEB_PUSH.md)。

## 13. ログ確認

```bash
npm run service:status
cat ~/Library/Logs/ai-usage-monitor/launchd.out.log
cat ~/Library/Logs/ai-usage-monitor/launchd.err.log
```

## 14. 停止とアンインストール

```bash
npm run service:stop
npm run service:uninstall
```

Cloudflare Tunnelの停止: `sudo cloudflared service uninstall`

---

## npm scripts一覧

| コマンド | 説明 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run db:generate` | Drizzleマイグレーション生成 |
| `npm run db:migrate` | マイグレーション適用 |
| `npm run sync` | 手動で1回同期を実行 (CLI) |
| `npm run push:test` | テストPush送信 (CLI, 要ログイン不要) |
| `npm run service:install` / `start` / `stop` / `status` / `uninstall` | launchd常駐管理 |

## ドキュメント一覧

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 設計・データフロー
- [docs/SECURITY.md](docs/SECURITY.md) — セキュリティ対策一覧
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — よくある問題
- [docs/IOS_FUTURE_PLAN.md](docs/IOS_FUTURE_PLAN.md) — 将来のiOSアプリ移行計画
- [docs/openapi.yaml](docs/openapi.yaml) — OpenAPI仕様書

## 実装状況サマリー

**実装済み:** モック全画面、ログイン、ダッシュボード/設定UI、PWA、Web Push、
OpenAI/Anthropic/Gemini(BigQuery)/Codex連携、Claude Code手動入力+実験的パーサー、
同期エンジン(独立同期・リトライ・バックオフ)、通知ルールエンジン、launchd、
Cloudflare Tunnel設定、Vitestテスト一式。

**モックでのみ動作確認済み (実APIキー無しで検証):** 全体のE2Eフロー。実プロバイダーAPIとの
実地接続は、公式ドキュメントに基づき実装したが実キーでの検証は行っていない。

**未実装:** Claude Codeの公式利用状況API (存在しないため)。iOSネイティブアプリ/WidgetKit。
