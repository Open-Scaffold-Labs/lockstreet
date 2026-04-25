// Supabase auth wrapper that mimics @clerk/clerk-react's API surface
// so existing components don't need invasive changes.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabase.js';

const AuthCtx = createContext({
  isLoaded: false,
  session: null,
  user: null,
});

export function AuthProvider({ children }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabase) { setIsLoaded(true); return; }
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setIsLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!mounted) return;
      setSession(sess);
    });

    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  return <AuthCtx.Provider value={{ isLoaded, session, user: session?.user ?? null }}>{children}</AuthCtx.Provider>;
}

/** Mirror Clerk's useAuth() shape: { isLoaded, isSignedIn, userId, getToken }. */
export function useAuth() {
  const { isLoaded, session } = useContext(AuthCtx);
  const userId = session?.user?.id ?? null;
  const getToken = useCallback(async () => session?.access_token ?? null, [session]);
  return { isLoaded, isSignedIn: !!userId, userId, getToken };
}

/** Mirror Clerk's useUser() shape: { isLoaded, isSignedIn, user }. */
export function useUser() {
  const { isLoaded, user } = useContext(AuthCtx);
  return { isLoaded, isSignedIn: !!user, user: user ? mapUser(user) : null };
}

/** Map a Supabase user object to a Clerk-ish shape so component code reads the same. */
function mapUser(u) {
  return {
    id: u.id,
    primaryEmailAddress: u.email ? { emailAddress: u.email } : null,
    publicMetadata: { role: u.app_metadata?.role || u.user_metadata?.role || null },
    fullName: u.user_metadata?.full_name || null,
    imageUrl: u.user_metadata?.avatar_url || null,
  };
}

export function SignedIn({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return !isSignedIn ? <>{children}</> : null;
}

/** Drop-in for Clerk's <SignInButton mode="modal" afterSignInUrl="...">.
 *  We don't truly modal it - just navigate to /sign-in. */
export function SignInButton({ children, afterSignInUrl }) {
  const navigate = useNavigate();
  const onClick = (e) => {
    e?.preventDefault?.();
    const target = afterSignInUrl ? `/sign-in?next=${encodeURIComponent(afterSignInUrl)}` : '/sign-in';
    navigate(target);
  };
  // If a single child (typically a button) is passed, clone it with onClick
  if (children) {
    if (Array.isArray(children) && children.length === 1) children = children[0];
    if (children && typeof children === 'object' && 'props' in children) {
      const merged = (...args) => { children.props.onClick?.(...args); onClick(...args); };
      return { ...children, props: { ...children.props, onClick: merged } };
    }
  }
  return <button type="button" onClick={onClick}>Sign in</button>;
}

/** Small avatar + sign-out button. Replaces Clerk's <UserButton />. */
export function UserButton() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const initials = (user?.fullName || user?.primaryEmailAddress?.emailAddress || '?')
    .split(/\s+|@/)[0].slice(0, 2).toUpperCase();
  async function signOut() { try { await supabase?.auth.signOut(); } catch {} setOpen(false); }
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
              style={{ width:32, height:32, borderRadius:'50%', background:'#1f2937', color:'#fff', fontSize:11, fontWeight:700, border:'1px solid #334155', cursor:'pointer' }}>
        {initials}
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, top:38, background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:8, minWidth:160, zIndex:10 }}>
          <div style={{ padding:'6px 8px', fontSize:12, color:'#94a3b8' }}>{user?.primaryEmailAddress?.emailAddress}</div>
          <button type="button" onClick={signOut} style={{ width:'100%', padding:'6px 8px', background:'transparent', border:'none', color:'#fff', textAlign:'left', cursor:'pointer' }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
