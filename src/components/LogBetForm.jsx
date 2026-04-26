import { useState } from 'react';

/**
 * Modal form for logging a bet to the user's bankroll.
 * onSave receives the bet object; parent handles the actual insert.
 */
export default function LogBetForm({ onSave, onCancel, defaultUnitSize = 25 }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    league: 'nfl',
    description: '',
    betType: 'spread',
    units: '1',
    odds: '-110',
    result: 'pending',
    unitSize: String(defaultUnitSize),
    notes: '',
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try { await onSave(form); }
    finally { setBusy(false); }
  }

  return (
    <div className="onboarding-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="onboarding-card lbf-card" role="dialog" aria-modal="true">
        <button className="ob-skip" onClick={onCancel}>Cancel</button>
        <div className="ob-eyebrow">Log a bet</div>
        <h2 className="ob-title" style={{ fontSize: 22 }}>What did you bet?</h2>

        <form onSubmit={submit} className="lbf-form">
          <label>League
            <select value={form.league} onChange={(e) => set('league', e.target.value)}>
              <option value="nfl">NFL</option>
              <option value="cfb">CFB</option>
              <option value="nba">NBA</option>
              <option value="mlb">MLB</option>
              <option value="nhl">NHL</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>Bet description
            <input value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="PHI -3.5 / Over 47.5 / Lions ML" required maxLength={120} autoFocus />
          </label>

          <div className="lbf-row">
            <label>Type
              <select value={form.betType} onChange={(e) => set('betType', e.target.value)}>
                <option value="spread">Spread</option>
                <option value="total">Total</option>
                <option value="moneyline">Moneyline</option>
                <option value="prop">Prop</option>
                <option value="parlay">Parlay</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Odds
              <input value={form.odds} onChange={(e) => set('odds', e.target.value)} placeholder="-110" />
            </label>
          </div>

          <div className="lbf-row">
            <label>Units
              <input type="number" min="0.5" step="0.5" value={form.units} onChange={(e) => set('units', e.target.value)} required />
            </label>
            <label>Unit size ($)
              <input type="number" min="1" step="1" value={form.unitSize} onChange={(e) => set('unitSize', e.target.value)} required />
            </label>
          </div>

          <label>Result
            <select value={form.result} onChange={(e) => set('result', e.target.value)}>
              <option value="pending">Pending</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="push">Push</option>
            </select>
          </label>

          <label>Notes (optional)
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Sharp line move, public on the other side, etc." maxLength={240} />
          </label>

          <div className="ob-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-gold" disabled={busy || !form.description}>
              {busy ? 'Saving...' : 'Save bet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
