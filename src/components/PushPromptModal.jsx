import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { usePushNotifications } from '../hooks/usePushNotifications.js';

const PROMPT_KEY = 'lockstreet_push_prompted_v1';

/**
 * One-time post-signup push notification prompt. Shown the first time a
 * signed-in user lands on the site after email verification, IF:
 *   - browser supports Notifications + push
 *   - permission is still 'default' (not granted or denied)
 *   - we haven't already prompted (localStorage flag)
 *
 * Choosing "Enable" or "Not now" both set the flag so we never re-prompt.
 */
export default function PushPromptModal() {
  const { isSignedIn, isLoaded } = useAuth();
  const { perm, subscribed, enable } = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'Notification' in window
                  && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!supported) return;
    if (perm !== 'default') return;
    if (subscribed) return;
    try {
      if (localStorage.getItem(PROMPT_KEY)) return;
    } catch { return; }
    // Brief delay so the modal doesn't pop the instant the route renders
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [isLoaded, isSignedIn, perm, subscribed, supported]);

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(PROMPT_KEY, '1'); } catch {}
  }

  async function handleEnable() {
    setBusy(true);
    try { await enable(); } catch {} finally { dismiss(); setBusy(false); }
  }

  if (!open) return null;
  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && dismiss()} role="dialog" aria-modal="true">
      <div className="onboarding-card">
        <button className="ob-skip" onClick={dismiss}>Maybe later</button>
        <div className="ob-eyebrow">Welcome to Lock Street</div>
        <h2 className="ob-title">Get notified the second a pick drops</h2>
        <p className="ob-body">
          Picks lock at kickoff. Turn on push notifications and you'll get a buzz on this device the moment a free pick is posted — or any pick at all once you're a paid subscriber.
        </p>
        <div className="ob-actions">
          <button className="btn-ghost" onClick={dismiss}>Not now</button>
          <button className="btn-gold" onClick={handleEnable} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        </div>
      </div>
    </div>
  );
}
