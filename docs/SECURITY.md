# セキュリティ

## 実施済みの対策

- **APIキーの隔離**: OpenAI/Anthropic/Google/VAPIDの秘密鍵はすべてサーバー側の環境変数
  (`.env.local`) のみで保持し、クライアントへ送信・HTML/JSへの埋め込みは一切行わない。
  SQLiteにも保存しない。
- **ログへの機密情報出力禁止**: `src/lib/logging/logger.ts` を通じた構造化ログは
  provider名・件数・エラーメッセージのみを出力し、APIキー・パスワード・Push Subscriptionの
  鍵情報・会話内容を含めない設計にしている。
- **認証**: `APP_PASSWORD` による簡易パスワード認証。ログイン成功時にHMAC-SHA256で
  署名したCookieを発行する (`HttpOnly` / `Secure` (本番) / `SameSite=Lax` / 30日有効期限)。
  `src/proxy.ts` が `/login` と `/api/auth/login` 以外の全ルートで認証を要求する。
- **レート制限**: ログインエンドポイントに1分あたり5回までのインメモリレート制限
  (`src/lib/auth/rate-limit.ts`)。
- **CSRF対策**: SameSite=Laxのセッションcookieに加え、状態変更を伴うAPI
  (`/api/settings`, `/api/sync`, `/api/push/*`, `/api/claude-code/manual` など) では
  `Origin` ヘッダーがホストと一致するかを検証する (`requireSameOrigin`)。
- **入力検証**: すべてのAPIエンドポイントの入力をZodで検証している。
- **SQLインジェクション対策**: Drizzle ORMのパラメータ化クエリのみを使用し、
  文字列連結によるSQL構築は行っていない (BigQueryクエリもnamed parameterを使用)。
- **HTTPS**: Cloudflare Tunnel経由の公開を前提とし、本番環境のCookieには`Secure`属性を付与。
- **Push Subscriptionの保護**: エンドポイントURLなどをAPIレスポンスに含める際は
  オリジンのみを返し、フルパス (トークンを含む) は返さない (`/api/push/status`)。

## 運用上の注意

- `.env.local` はGit管理対象外 (`.gitignore`)。誤ってコミットしないよう注意する。
- Cloudflare Tunnelでインターネットに公開する場合は、**Cloudflare Accessの併用を強く推奨**
  (`docs/SETUP_CLOUDFLARE_TUNNEL.md` 参照)。
- `SESSION_SECRET` は十分にランダムな文字列を使うこと (`openssl rand -base64 32` 等)。
- エラー画面・APIエラーレスポンスには、スタックトレースや秘密情報を含めない。
