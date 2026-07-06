'use client';

import { useEffect, useState } from 'react';
import { subscribeToPush, unsubscribeFromPush } from '@/lib/push/client';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function PushSettings() {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects a browser API read on mount
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as PermissionState);
  }, []);

  async function handleEnable() {
    if (!vapidPublicKey) {
      setMessage('VAPID公開鍵が未設定です(.env.localを確認してください)');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
      if (result !== 'granted') {
        setMessage('通知が許可されませんでした');
        return;
      }
      await subscribeToPush(vapidPublicKey);
      setMessage('通知を有効にしました');
    } catch (err) {
      setMessage(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setMessage('通知を無効にしました');
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = (await res.json()) as { sent?: number; failed?: number };
      setMessage(`テスト通知を送信しました (成功:${data.sent ?? 0} / 失敗:${data.failed ?? 0})`);
    } catch (err) {
      setMessage(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        通知許可の状態:{' '}
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {permission === 'granted' && '許可済み'}
          {permission === 'denied' && '拒否されています'}
          {permission === 'default' && '未設定'}
          {permission === 'unsupported' && 'このブラウザは非対応'}
        </span>
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        iPhoneで通知を受け取るには、Safariでこのアプリをホーム画面に追加し、そのアイコンから起動してから「通知を有効にする」を押してください。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleEnable}
          disabled={busy || permission === 'unsupported'}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          通知を有効にする
        </button>
        <button
          onClick={handleDisable}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          通知を無効にする
        </button>
        <button
          onClick={handleTest}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          テスト通知を送信
        </button>
      </div>
      {message && <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>}
    </div>
  );
}
