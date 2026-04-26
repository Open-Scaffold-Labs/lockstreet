import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { useAuth, SignInButton, useUser } from '../lib/auth.jsx';
import { TIERS } from '../lib/pricing.js';
import { useSubscription } from '../hooks/useSubscription.js';

const stripePromise = (() => {
  const k = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return k ? loadStripe(k) : null;
})();

export default function SubscribeRoute() {
  const { getToken } = useAuth?.() || {};
  const { user } = useUser?.() || {};
  const sub = useSubscription();
  const [loadingTier, setLoadingTier] = useState(null);
  const [err, setErr] = useState(null);

  async function checkout(tierId) {
    setLoadingTier(tierId);
    setErr(null);
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tier: tierId,
          email: user?.primaryEmailAddress?.emailAddress || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.sessionId) throw new Error(j.error || `HTTP ${res.status}`);
      const stripe = await stripePromise;
      if (!stripe) throw new Error('Stripe key missing - set VITE_STRIPE_PUBLISHABLE_KEY.');
      const { error } = await stripe.redirectToCheckout({ sessionId: j.sessionId });
      if (error) throw error;
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <section className="route-syne">
      <div className="sub-hero">
        <h2>Unlock the <span className="accent">real picks</span>.</h2>
        <p>
          Free tier shows you every line, every ATS record, and every line movement we're tracking.
          Subscribe to see the actual pick side and unit size on every game - locked until kickoff.
        </p>
        {sub.active && (
          <p style={{ color: 'var(--green)', marginTop: 14, fontFamily: 'var(--mono)', fontSize: 12 }}>
            OK You're subscribed - {sub.tier}{sub.renewsAt ? ` / renews ${new Date(sub.renewsAt).toLocaleDateString()}` : ''}.
          </p>
        )}
        {err && <p style={{ color: 'var(--red)', marginTop: 10, fontFamily: 'var(--mono)', fontSize: 12 }}>{err}</p>}
      </div>

      <div className="tiers">
        {TIERS.map((t, i) => (
          <div key={t.id} className={'tier' + (t.popular ? ' popular' : '')} style={{ animationDelay: `${i * 0.1}s` }}>
            {t.popular && <span className="tag-pop">POPULAR</span>}
            <h3>{t.name}</h3>
            <div className="price">${t.price}<span className="per">/{t.period}</span></div>
            <div className="note">{t.note}</div>
            <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>

            {sub.signedIn ? (
              <button onClick={() => checkout(t.id)} disabled={loadingTier === t.id || sub.active}>
                {sub.active ? 'Subscribed' : loadingTier === t.id ? 'Redirecting...' : t.cta}
              </button>
            ) : (
              <SignInButton afterSignInUrl="/subscribe">
                <button>{t.cta}</button>
              </SignInButton>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
