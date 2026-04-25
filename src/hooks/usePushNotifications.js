import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [subscribed, setSubscribed] = useState(false);
  const { getToken } = useAuth?.() || {};

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub));
  }, []);

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC) throw new Error('VITE_VAPID_PUBLIC_KEY missing');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push not supported on this browser');
    }
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== 'granted') return false;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }

    const token = getToken ? await getToken() : null;
    await fetch('/api/notify-subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ subscription: sub }),
    });
    setSubscribed(true);
    return true;
  }, [getToken]);

  return { perm, subscribed, enable };
}
