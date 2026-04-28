import { useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications.js';

/**
 * Inline settings panel rendered inside the UserButton dropdown.
 * Currently just exposes a push-notifications toggle. Pulled into its own
 * file to avoid a circular import (auth.jsx ↔ usePushNotifications).
 */
export default function UserSettings() {
  const { perm, subscribed, enable } = usePushNotifications();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const supported = typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';

  async function turnOn() {
    setErr(null); setBusy(true);
    try { await enable(); }
    catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  }

  let body;
  if (!supported) {
    body = <div style={muted}>Push notifications not supported on this device.</div>;
  } else if (perm === 'denied') {
    body = <div style={muted}>Notifications blocked in browser settings — enable them in your system settings, then refresh.</div>;
  } else if (subscribed) {
    body = <div style={{ ...muted, color: '#10b981' }}>Notifications enabled on this device.</div>;
  } else {
    body = (
      <button type="button" onClick={turnOn} disabled={busy} className="btn-gold"
        style={{ padding: '6px 10px', fontSize: 12, cursor: busy ? 'wait' : 'pointer', width: '100%' }}>
        {busy ? 'Enabling...' : 'Turn on notifications'}
      </button>
    );
  }

  return (
    <div style={{ padding: '8px 8px 4px', borderTop: '1px solid rgba(192, 132, 252, 0.18)', marginTop: 4 }}>
      <div style={{ ...muted, marginBottom: 6, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Settings</div>
      <div style={{ ...muted, marginBottom: 6 }}>Push notifications</div>
      {body}
      {err && <div style={{ ...muted, color: '#ef4444', marginTop: 6 }}>{err}</div>}
    </div>
  );
}

const muted = { fontSize: 11, color: '#94a3b8' };
