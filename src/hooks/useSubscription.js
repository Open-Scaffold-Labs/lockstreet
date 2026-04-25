import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

/**
 * Single source of truth for "can this user see picks?".
 * Asks /api/subscription-status, which consults Stripe via the user's Supabase ID.
 * Cached per session; re-checks on user change and on /success bounce.
 */
export function useSubscription() {
  const { userId, getToken } = useAuth?.() || {};
  const isSignedIn = !!userId;

  const [status, setStatus] = useState({
    loading: true,
    active: false,
    tier: null,
    renewsAt: null,
    signedIn: isSignedIn,
  });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isSignedIn) {
        setStatus({ loading: false, active: false, tier: null, renewsAt: null, signedIn: false });
        return;
      }
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch('/api/subscription-status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const j = res.ok ? await res.json() : { active: false };
        if (cancelled) return;
        setStatus({
          loading: false,
          active: !!j.active,
          tier: j.tier || null,
          renewsAt: j.renewsAt || null,
          signedIn: true,
        });
      } catch {
        if (!cancelled) setStatus((s) => ({ ...s, loading: false }));
      }
    }
    check();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, userId]);

  return status;
}
