import { useState, useEffect } from 'react';
import { supabase } from './supabase.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// Shared between ProfileScreen's toggle and the onboarding "enable notifications"
// step, so the subscribe/unsubscribe flow only lives in one place.
export default function usePushNotifications(currentUserId) {
  const [status, setStatus] = useState('checking'); // 'unsupported' | 'ios-need-install' | 'denied' | 'off' | 'on' | 'checking'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus('unsupported');
        return;
      }
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (isIOS && !isStandalone) {
        setStatus('ios-need-install');
        return;
      }
      if (Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? 'on' : 'off');
      } else {
        setStatus('off');
      }
    }
    check();
  }, []);

  async function enable() {
    if (busy || !supabase || !currentUserId) return;
    setBusy(true);
    setError(null);
    try {
      // Once denied, the browser silently no-ops requestPermission() forever
      // instead of re-prompting — surface that instead of pretending to try.
      if (Notification.permission === 'denied') {
        setStatus('denied');
        setBusy(false);
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === 'denied') { setStatus('denied'); setBusy(false); return; }
      if (perm !== 'granted') { setStatus('off'); setBusy(false); return; }
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('Missing VAPID key — restart the dev server (env vars only load at startup)');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const j = sub.toJSON();
      let timezone = null;
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
      const { error: upsertErr } = await supabase.from('push_subscriptions').upsert(
        { user_id: currentUserId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, timezone },
        { onConflict: 'endpoint' }
      );
      if (upsertErr) throw upsertErr;
      setStatus('on');
    } catch (err) {
      console.error('[push] enable failed:', err);
      setError(err?.message || String(err));
      setStatus('off');
    }
    setBusy(false);
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch {}
    setBusy(false);
  }

  return { status, busy, error, enable, disable };
}
