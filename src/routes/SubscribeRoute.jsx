import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { useAuth, SignInButton, useUser } from '../lib/auth.jsx';
import { TIERS } from '../lib/pricing.js';
import { useSubscription } from '../hooks/useSubscription.js';
import TrackRecordChart from '../components/TrackRecordChart.jsx';

const stripePromise = (() => {
  const k = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return k ? loadStripe(k) : null;
})();

/**
 * /subscribe — the Pro page.
 *
 * Combines the credentials/track-record narrative (formerly /about /
 * /record) with the pricing tiers and Stripe checkout. The page is
 * structured as a single sales funnel:
 *   1. Hero
 *   2. Credentials (Two generations / Who you're paying)
 *   3. Track-record chart + verifiable pool finishes
 *   4. What you get + how we make picks
 *   5. Pricing tiers (the actual CTA)
 *
 * /about and /record both redirect here so old links don't break.
 */
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
    <section className="about route-syne">
      {/* ============== Hero ============== */}
      <div className="sub-hero">
        <h2>Two generations. <span className="accent">One system.</span></h2>
        <p>
          Lock Street is run by a father and son who handicap NFL and college football
          off the same framework — taught from one to the other, refined over years
          of betting actual money. We don't sell picks we wouldn't bet ourselves.
        </p>
        {sub.active && (
          <p style={{ color: 'var(--green)', marginTop: 14, fontFamily: 'var(--mono)', fontSize: 12 }}>
            OK You're subscribed - {sub.tier}{sub.renewsAt ? ` / renews ${new Date(sub.renewsAt).toLocaleDateString()}` : ''}.
          </p>
        )}
      </div>

      {/* ============== Who you're paying ============== */}
      <div className="about-block">
        <h3>Who you're paying</h3>
        <p>
          <strong>Shawn (the father)</strong> developed the handicapping system
          we use — line-movement reading, situational angles, market timing.
          He's been doing this longer than I have.
        </p>
        <p>
          <strong>Matt (the son)</strong> learned the system from him,
          runs Lock Street day-to-day, and posts the picks subscribers see.
          Every play that goes out is filtered through both of us.
        </p>
        <p style={{ color: 'var(--ink-faint)', fontSize: 12, marginTop: 8, fontFamily: 'var(--mono)' }}>
          Online handles: Matt = "Mlav1114" · Shawn = "Lucky Shawn" — used in the verifiable pool standings below.
        </p>
        <p style={{ color: 'var(--ink-dim)', fontSize: 13, marginTop: 12 }}>
          Most picks subscriptions are a single guy with a Twitter account and
          screenshots from one good month. We're not that. The receipts below are
          three separate seasons across three formats, with two of us showing up
          in the standings independently.
        </p>
      </div>

      {/* ============== Track-record chart ============== */}
      <div className="about-block">
        <h3>Cumulative units · most recent ATS season</h3>
        <TrackRecordChart />
      </div>

      {/* ============== Three #1 finishes ============== */}
      <div className="about-block">
        <h3>Track record — three #1 finishes, three formats, ~250 combined entrants</h3>

        <div className="credential-card">
          <div className="cred-rank">#1<span className="cred-of">/84</span></div>
          <div className="cred-body">
            <div className="cred-title">Karen's NFL Pool — straight-up pick'em, full season</div>
            <div className="cred-detail">
              Both of us entered independently. <strong>Matt finished 1st (165-107).
              Shawn finished 2nd (155-117).</strong> Same system, two different
              pickers, top of an 84-person field.
            </div>
            <div className="cred-why">
              This is the strongest system-validation result we have. Two independent
              entries from the same framework finishing 1-2 against 82 unrelated bettors
              isn't a lucky season — it's a repeatable edge.
            </div>
          </div>
        </div>

        <div className="credential-card">
          <div className="cred-rank">#1<span className="cred-of">/100</span></div>
          <div className="cred-body">
            <div className="cred-title">W3P1 ATS Pool — most recent season (joint entry)</div>
            <div className="cred-detail">
              <strong>Father and son split this entry — 4 picks each, every week, against
              the spread.</strong> 18 weeks. 4 college + 4 NFL per week.
              Combined finish: <strong>94 / 144 — ~65% ATS</strong>. 1st out of 100 entries.
            </div>
            <div className="cred-why">
              The format here is identical to what Lock Street subscribers receive:
              4 NFL + 4 CFB ATS picks every week. The pool was effectively a live
              proof-of-concept for the product you're considering subscribing to.
            </div>
          </div>
        </div>

        <div className="credential-card">
          <div className="cred-rank">#1<span className="cred-of">/66</span></div>
          <div className="cred-body">
            <div className="cred-title">Office Football Pool — solo, confidence-weighted</div>
            <div className="cred-detail">
              <strong>Matt solo: 67-44-3 record, 23 key wins, 160.5 points.</strong>
              Finished 3.5 points clear of 2nd place. 6 picks per week with 2
              confidence-weighted "key" picks worth bonus points.
            </div>
            <div className="cred-why">
              The "key picks" mechanic is unit-sizing in disguise — pick which side
              wins AND which side you weight bigger. 23 of those landed correctly.
              That same skill is what determines whether a pick goes out as 1u, 2u, or 3u.
            </div>
          </div>
        </div>
      </div>

      {/* ============== What you get ============== */}
      <div className="about-block">
        <h3>What you get for your subscription</h3>
        <ul className="about-list">
          <li><strong>4 NFL + 4 CFB picks against the spread, every week</strong> — same format we just won the W3P1 pool with</li>
          <li><strong>Unit sizing on every pick</strong> (1u, 2u, 3u) — you know exactly how big to bet</li>
          <li><strong>Reasoning attached to every paid pick</strong> — the "why" matters as much as the "what"</li>
          <li><strong>Locked until kickoff, private to subscribers forever</strong> — your edge stays your edge</li>
          <li><strong>Push notifications the moment a pick drops</strong> — line value disappears fast</li>
          <li><strong>Free weekly pick</strong> for non-subscribers — sample the work before paying</li>
        </ul>
      </div>

      {/* ============== How we make picks ============== */}
      <div className="about-block">
        <h3>How we make picks</h3>
        <p>
          Lines aren't a prediction — they're a balancing tool. Vegas sets a number
          designed to split public action, not to forecast the actual game.
          The opportunity is in the gap between the line and reality.
          We look for it three ways:
        </p>
        <ol className="about-list">
          <li><strong>Line movement vs. public splits.</strong> When the line moves <em>against</em> the public's heavy side, sharp money is moving it. We tail the sharps, not the public.</li>
          <li><strong>Situational angles.</strong> Lookahead spots, road favorites coming off Monday Night, divisional dogs in November — situations where market sentiment runs ahead of the football reality.</li>
          <li><strong>Injury and weather adjustments.</strong> Markets are fast on starting QBs but slow on third receivers, secondary impacts, and weather — particularly mid-week.</li>
        </ol>
        <p style={{ marginTop: 14, color: 'var(--ink-dim)', fontSize: 13 }}>
          Every paid pick gets the reasoning, not just a side. You're not paying
          $100 a week to be told "PHI -3" with no context.
        </p>
      </div>

      {/* ============== Pricing tiers (the CTA) ============== */}
      <div className="about-block" id="pricing">
        <h3>Subscribe</h3>
        <p style={{ color: 'var(--ink-dim)', marginBottom: 18 }}>
          Free tier shows you every line, every ATS record, and every line movement we're tracking.
          Subscribe to see the actual pick side and unit size on every game — locked until kickoff.
        </p>
        {err && <p style={{ color: 'var(--red)', marginTop: 10, fontFamily: 'var(--mono)', fontSize: 12 }}>{err}</p>}

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
      </div>

      <p className="footnote-disclaimer">
        Past performance does not guarantee future results. Lock Street is for
        entertainment purposes only. Bet responsibly. If you have a gambling problem,
        call 1-800-GAMBLER.
      </p>
    </section>
  );
}
