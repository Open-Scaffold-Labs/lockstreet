import { useState } from 'react';
import { useToast } from '../lib/toast.jsx';

/**
 * Parlay builder + EV calculator.
 * - User adds legs, each with American odds and (optionally) their estimated true probability.
 * - App computes combined American odds, decimal odds, implied probability, payout per $100,
 *   and EV (when true probabilities are entered for every leg).
 * - Pure client-side, no backend.
 */

function americanToDecimal(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}
function decimalToAmerican(d) {
  if (!Number.isFinite(d) || d <= 1) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1));
}
function impliedProb(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

export default function ParlayRoute() {
  const toast = useToast();
  const [legs, setLegs] = useState([
    { id: 1, label: '', odds: '-110', truePct: '' },
    { id: 2, label: '', odds: '-110', truePct: '' },
  ]);
  const [stake, setStake] = useState('100');

  function update(id, patch) { setLegs((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))); }
  function add()  { setLegs((l) => [...l, { id: (l.at(-1)?.id || 0) + 1, label: '', odds: '-110', truePct: '' }]); }
  function remove(id) { setLegs((l) => l.length > 1 ? l.filter((x) => x.id !== id) : l); }

  // Math
  const decimals  = legs.map((l) => americanToDecimal(l.odds)).filter(Boolean);
  const implieds  = legs.map((l) => impliedProb(l.odds)).filter(Boolean);
  const decimalCombined = decimals.length === legs.length ? decimals.reduce((p, d) => p * d, 1) : null;
  const americanCombined = decimalCombined ? decimalToAmerican(decimalCombined) : null;
  const impliedCombined  = implieds.length === legs.length ? implieds.reduce((p, d) => p * d, 1) : null;
  const stakeNum = Number(stake) || 0;
  const payout = decimalCombined ? stakeNum * decimalCombined : null;
  const profit = payout != null ? payout - stakeNum : null;

  const trueProbs = legs.map((l) => Number(l.truePct) / 100).filter((n) => Number.isFinite(n) && n > 0 && n < 1);
  const allTrueFilled = trueProbs.length === legs.length;
  const trueCombined = allTrueFilled ? trueProbs.reduce((p, d) => p * d, 1) : null;
  const ev = (trueCombined != null && payout != null)
    ? (trueCombined * profit) - ((1 - trueCombined) * stakeNum)
    : null;
  const evPct = ev != null && stakeNum > 0 ? (ev / stakeNum) * 100 : null;

  return (
    <section>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Parlay calculator</div>
          <div className="trc-final">
            {americanCombined != null
              ? <>{americanCombined > 0 ? '+' : ''}{americanCombined}<span className="trc-final-sub">{decimalCombined?.toFixed(2)}× decimal · {(impliedCombined * 100).toFixed(1)}% implied</span></>
              : <>—<span className="trc-final-sub">enter odds for every leg</span></>}
          </div>
        </div>
        <button className="btn-ghost" onClick={add}>+ Add leg</button>
      </div>

      <div className="about-block">
        <h3>Legs ({legs.length})</h3>
        <div className="bk-table">
          {legs.map((leg, i) => {
            const dec = americanToDecimal(leg.odds);
            const imp = impliedProb(leg.odds);
            return (
              <div key={leg.id} className="bk-row res-pending parlay-row">
                <div className="bk-row-main">
                  <div className="lbf-row">
                    <label>Leg {i + 1} · description (optional)
                      <input value={leg.label} onChange={(e) => update(leg.id, { label: e.target.value })}
                        placeholder="PHI -3.5 / Over 47.5 / Lions ML" maxLength={120} />
                    </label>
                  </div>
                  <div className="lbf-row" style={{ marginTop: 8 }}>
                    <label>American odds
                      <input value={leg.odds} onChange={(e) => update(leg.id, { odds: e.target.value })} placeholder="-110" />
                    </label>
                    <label>Decimal
                      <input value={dec ? dec.toFixed(2) : ''} disabled placeholder="auto" />
                    </label>
                  </div>
                  <div className="lbf-row" style={{ marginTop: 8 }}>
                    <label>Implied %
                      <input value={imp ? (imp * 100).toFixed(1) : ''} disabled placeholder="auto" />
                    </label>
                    <label>Your true % (for EV)
                      <input value={leg.truePct} onChange={(e) => update(leg.id, { truePct: e.target.value })}
                        placeholder="optional · 55" />
                    </label>
                  </div>
                </div>
                <button className="bk-x" onClick={() => remove(leg.id)} aria-label="Remove leg">×</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="about-block">
        <h3>Sizing</h3>
        <div className="lbf-row">
          <label>Stake ($)
            <input type="number" min="1" step="1" value={stake} onChange={(e) => setStake(e.target.value)} />
          </label>
          <label>Profit if it hits
            <input value={profit != null ? `+$${profit.toFixed(2)}` : '—'} disabled />
          </label>
        </div>
        <div className="lbf-row" style={{ marginTop: 8 }}>
          <label>Total payout
            <input value={payout != null ? `$${payout.toFixed(2)}` : '—'} disabled />
          </label>
          <label>Vig (book hold)
            <input value={impliedCombined != null && trueCombined != null ?
              `${((impliedCombined - trueCombined) * 100).toFixed(1)}%` :
              impliedCombined != null ? `${(impliedCombined * 100).toFixed(1)}% implied` : '—'} disabled />
          </label>
        </div>
      </div>

      <div className={'about-block' + (evPct != null && evPct > 0 ? ' ev-positive' : evPct != null && evPct < 0 ? ' ev-negative' : '')}>
        <h3>Expected value</h3>
        {!allTrueFilled ? (
          <p style={{ color: 'var(--ink-dim)', fontSize: 13.5, lineHeight: 1.6 }}>
            Enter your <strong>true probability</strong> for every leg (above) to compute EV. The book gives you the
            implied prob from the odds; if you think a side is sharper than the line, plug your read in here.
          </p>
        ) : (
          <div className="ev-result">
            <div className="ev-num">
              {ev > 0 ? '+' : ''}${ev.toFixed(2)}
              <span className="ev-pct">{evPct > 0 ? '+' : ''}{evPct.toFixed(1)}% EV</span>
            </div>
            <p style={{ marginTop: 10, color: 'var(--ink-dim)', fontSize: 13, lineHeight: 1.6 }}>
              Given a {(trueCombined * 100).toFixed(1)}% true probability and {(impliedCombined * 100).toFixed(1)}% implied,
              this parlay has {ev > 0 ? <strong style={{ color: 'var(--green)' }}>positive expected value</strong> : <strong style={{ color: 'var(--red)' }}>negative expected value</strong>} at the current price.
              Long-run average per $${stakeNum} stake: {ev > 0 ? '+' : ''}${ev.toFixed(2)}.
            </p>
          </div>
        )}
      </div>

      <p className="footnote-disclaimer" style={{ maxWidth: 600 }}>
        Parlay math is exact (American → decimal multiplication). EV depends on your inputs.
        Most parlays are -EV at sportsbook prices because of compounding vig.
      </p>
    </section>
  );
}
