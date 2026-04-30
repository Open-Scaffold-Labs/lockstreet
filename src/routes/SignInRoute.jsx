import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

export default function SignInRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isSignedIn } = useAuth();
  // Sanitize the post-signin redirect target. Reject anything that isn't
  // same-origin OR a relative path starting with '/'. Open redirects are a
  // classic phishing vector — never trust ?next=https://attacker.example.
  const rawNext = params.get('next') || '/';
  const next = sanitizeNext(rawNext);

  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => { if (isSignedIn) navigate(next, { replace: true }); }, [isSignedIn, next, navigate]);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setInfo(null); setBusy(true);
    try {
      if (!supabase) throw new Error('Supabase not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo('Account created. Check your email for confirmation if required, then sign in.');
        setMode('signin');
      } else if (mode === 'reset') {
        // Send Supabase password-reset email. The link drops the user on
        // /reset-password (a recovery session is created automatically by
        // the supabase-js client when the URL fragment is parsed).
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo('Check your email for a password reset link.');
      }
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
        border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <h2 style={{ margin: 0 }}>
          {mode === 'signin' && 'Sign in'}
          {mode === 'signup' && 'Create account'}
          {mode === 'reset'  && 'Reset password'}
        </h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com" required autoFocus
          style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
        {mode !== 'reset' && (
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password (min 6 chars)" required minLength={6}
            style={{ padding: 10, background: '#0a0e17', border: '1px solid rgba(192, 132, 252, 0.35)', borderRadius: 6, color: '#fff' }} />
        )}
        {err && <div style={{ color: '#ef4444', fontSize: 13 }}>{err}</div>}
        {info && <div style={{ color: '#10b981', fontSize: 13 }}>{info}</div>}
        <button type="submit" disabled={busy} className="btn-gold"
          style={{ padding: 10, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Working...' : (
            mode === 'signin' ? 'Sign in' :
            mode === 'signup' ? 'Sign up' :
            'Send reset link'
          )}
        </button>
        {mode === 'signin' && (
          <button type="button" onClick={() => { setMode('reset'); setErr(null); setInfo(null); }}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            Forgot password?
          </button>
        )}
        <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null); setInfo(null); }}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
          {mode === 'signin' && "Don't have an account? Sign up"}
          {mode === 'signup' && 'Already have an account? Sign in'}
          {mode === 'reset'  && '← Back to sign in'}
        </button>
      </form>
    </div>
  );
}

/**
 * Whitelist the post-signin redirect target. Accept:
 *   - relative paths starting with '/' that don't try to escape via '//'
 *     (which browsers treat as protocol-relative).
 *   - absolute URLs whose origin matches window.location.origin.
 * Reject everything else by collapsing to '/'.
 */
function sanitizeNext(raw) {
  if (!raw) return '/';
  // Block protocol-relative ('//evil.example/path') early.
  if (raw.startsWith('//')) return '/';
  if (raw.startsWith('/')) return raw;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
  } catch { /* fall through */ }
  return '/';
}
