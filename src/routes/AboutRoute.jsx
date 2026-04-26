import TrackRecordChart from '../components/TrackRecordChart.jsx';

/**
 * About / Credentials page.
 * Public, no auth required. The credibility-first page.
 *
 * Frame: Lock Street is a father/son handicap operation.
 * The father (Lucky Shawn) developed the system; Mlav1114 (Matt) learned it,
 * runs day-to-day, and the receipts back up both of them.
 */
export default function AboutRoute() {
  return (
    <section className="about route-syne">
      <div className="sub-hero">
        <h2>Two generations. <span className="accent">One system.</span></h2>
        <p>
          Lock Street is run by a father and son who handicap NFL and college football
          off the same framework — taught from one to the other, refined over years
          of betting actual money. We don't sell picks we wouldn't bet ourselves.
        </p>
      </div>

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

      <div className="about-block">
        <h3>Cumulative units · most recent ATS season</h3>
        <TrackRecordChart />
      </div>

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

      <div className="about-block about-block-cta">
        <h3>Ready to see this season's picks?</h3>
        <p>The free weekly pick goes out Wednesday. Paid picks drop game-day, locked the moment kickoff hits.</p>
        <a href="/subscribe" className="btn-gold" style={{ display: 'inline-block', padding: '12px 24px', marginTop: 8, textDecoration: 'none' }}>
          See subscription tiers
        </a>
      </div>

      <p className="footnote-disclaimer">
        Past performance does not guarantee future results. Lock Street is for
        entertainment purposes only. Bet responsibly. If you have a gambling problem,
        call 1-800-GAMBLER.
      </p>
    </section>
  );
}
