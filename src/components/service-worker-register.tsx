'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => console.error('Service worker registration failed', err));

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'sw-updated') {
        if (confirm('アプリの新しいバージョンがあります。再読み込みしますか？')) {
          window.location.reload();
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
