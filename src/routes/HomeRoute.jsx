import { Link } from 'react-router-dom';
import { TIERS } from '../lib/pricing.js';

/**
 * Landing page at /. Marketing-first front door.
 * Replaces the old behavior of redirecting straight to /scores.
 */
export default function HomeRoute() {
  return (
    <div className="home route-syne">
      <section className="home-hero">
        <span className="hero-eyebrow">Premium NFL + CFB picks · subscribers only</span>
        <h1>“Be fearful when others are greedy.<br /><span className="accent">Be greedy when others are fearful.”</span></h1>
        <p>
          4 NFL + 4 college picks against the spread, every week.
          Locked until kickoff, never made public. The same handicap that won
          three different football pools across three formats — receipts on the Track Record page.
        </p>
        <div className="hero-cta-row">
          <Link to="/subscribe" className="btn-gold btn-lg">See track record + pricing</Link>
        </div>
      </section>

      <section className="home-stats">
        <div className="hstat">
          <div className="hstat-num">3<span className="hstat-suffix">×</span></div>
          <div className="hstat-label">#1 pool finishes<br />in three different formats</div>
        </div>
        <div className="hstat">
          <div className="hstat-num">~65<span className="hstat-suffix">%</span></div>
          <div className="hstat-label">ATS in our most<br />recent 144-pick season</div>
        </div>
        <div className="hstat">
          <div className="hstat-num">250<span className="hstat-suffix">+</span></div>
          <div className="hstat-label">Combined entrants we've<br />finished ahead of</div>
        </div>
      </section>

      <section className="home-how">
        <h2>How it works</h2>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-num">01</div>
            <h3>Subscribe</h3>
            <p>Pick a tier — weekly, monthly, or annual. Annual saves the most ($9.60/wk effective).</p>
          </div>
          <div className="how-card">
            <div className="how-num">02</div>
            <h3>Get the picks</h3>
            <p>4 NFL + 4 CFB ATS picks dropped each game-day with full reasoning and unit sizing. Push notifications when they go live.</p>
          </div>
          <div className="how-card">
            <div className="how-num">03</div>
            <h3>Bet your size</h3>
            <p>Each pick is rated 1u, 2u, or 3u so you know how much to put on. Picks lock the moment kickoff hits.</p>
          </div>
        </div>
      </section>

      <section className="home-tiers">
        <h2>Pricing</h2>
        <div className="tiers">
          {TIERS.map((t, i) => (
            <div key={t.id} className={'tier' + (t.popular ? ' popular' : '')} style={{ animationDelay: `${i * 0.1}s` }}>
              {t.popular && <span className="tag-pop">POPULAR</span>}
              <h3>{t.name}</h3>
              <div className="price">${t.price}<span className="per">/{t.period}</span></div>
              <div className="note">{t.note}</div>
              <ul>{t.features.map((f) => <li key={f}>{f}</li>)}</ul>
              <Link to="/subscribe" className="btn-tier" style={{
                display: 'block', textAlign: 'center', padding: 12, borderRadius: 10,
                border: '1px solid var(--border-strong)',
                background: t.popular ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
                color: t.popular ? '#000000' : 'var(--ink)',
                textDecoration: 'none', fontFamily: 'var(--disp)', fontWeight: 700,
                fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase'
              }}>{t.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="home-final-cta">
        <h2>Ready to see this season's picks?</h2>
        <p>Free weekly pick goes out Wednesday. Paid picks drop game-day, locked at kickoff.</p>
        <Link to="/subscribe" className="btn-gold btn-lg">Get started</Link>
      </section>
    </div>
  );
}
