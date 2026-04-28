import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

/**
 * /reset-password
 *
 * Landing page for the password-reset email link. Supabase-js parses the
 * URL fragment and creates a temporary "recovery" session — we listen for
 * PASSWORD_RECOVERY to know we're allowed to call updateUser({ password }).
 * Without that signal we show a "link expired" message rather than a form
 * the user can't actually submit.
 */
export default function ResetPasswordRoute() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // If the user landed here via a recovery link, supabase-js fires a
    // PASSWORD_RECOVERY event after parsing the URL fragment.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'INITIAL_SESSION' && session)) {
        setReady(true);
      }
    });
    // Fallback: a session may already exist if the page reloads.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
    return () => sub.subscription?.unsubscribe?.();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (pwd.length < 6)   return setErr('Password must be at least 6 characters.');
    if (pwd !== pwd2)     return setErr("Passwords don't match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setDone(true);
      // Sign out so the user has to sign in fresh with the new password.
      await supabase.auth.signOut();
      setTimeout(() => navigate('/sign-in', { replace: true }), 1500);
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: '40px 0' }}>
      <form onSubmit={submit} style={{
        width: 'min(380px, 92vw)', padding: 24, background: '#0f172a',
        border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 12,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h2 style={{ margin: 0 }}>Set new password</h2>
        {!ready ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>
            Verifying reset link... if this hangs, the link may have expired.
            Request a new one from the sign-in page.
          </div>
        ) : done ? (
          <div style={{ color: '#10b981', fontSize: 13 }}>
            Password updated. Redirecting to sign in...
          </div>
        ) : (
          <>
            <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
              placeholder="new password (min 6 chars)" required minLength={6} autoFocus
              style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
            <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)}
              placeholder="confirm new password" required minLength={6}
              style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
            {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
            <button type="submit" disabled={busy} className="btn-gold"
              style={{ padding: 10, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Saving...' : 'Update password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
