'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error === 'too many attempts, try again later' ? 'しばらく待ってから再度お試しください' : 'パスワードが違います');
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
      >
        <h1 className="mb-1 text-xl font-semibold">AI Usage Monitor</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">パスワードを入力してください</p>

        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          パスワード
        </label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
        />

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending || password.length === 0}
          className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}
