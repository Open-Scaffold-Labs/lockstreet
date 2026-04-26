import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useBets, autoGradePending } from '../hooks/useBets.js';
import { useToast } from '../lib/toast.jsx';
import { supabase } from '../lib/supabase.js';
import LogBetForm from '../components/LogBetForm.jsx';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export default function BankrollRoute() {
  return (
    <section>
      <SignedOut>
        <div className="empty">
          <h2 style={{ marginTop: 0 }}>Track your own bankroll</h2>
          <p style={{ color: 'var(--ink-dim)', maxWidth: 480, margin: '8px auto 16px' }}>
            Log every bet you place — Lock Street picks or your own — and see your real ROI,
            unit performance, and breakdown by sport. Sign in to start.
          </p>
          <SignInButton afterSignInUrl="/bankroll">
            <button className="btn-gold">Sign in</button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn><BankrollDashboard /></SignedIn>
    </section>
  );
}

function BankrollDashboard() {
  const { bets, loading, reload, addBet, updateResult, deleteBet } = useBets();
  const [logOpen, setLogOpen] = useState(false);
  const toast = useToast();
  const gradedRef = useRef(false);

  // Auto-grade pending bets once per page mount (looks up ESPN final scores).
  useEffect(() => {
    if (gradedRef.current || loading || !bets.length) return;
    gradedRef.current = true;
    autoGradePending(bets, supabase).then((updates) => {
      if (updates.length) {
        toast(`${updates.length} pending bet${updates.length > 1 ? 's' : ''} auto-graded`, { type: 'success' });
        reload();
      }
    });
  }, [bets, loading, reload, toast]);

  const summary = useMemo(() => computeSummary(bets), [bets]);
  const series  = useMemo(() => computeSeries(bets),  [bets]);

  async function handleLog(bet) {
    try {
      await addBet(bet);
      toast('Bet logged', { type: 'success' });
      setLogOpen(false);
    } catch (e) { toast(e.message || 'Failed to save', { type: 'error', duration: 4000 }); }
  }

  async function handleResult(id, result) {
    try { await updateResult(id, result); toast(`Marked ${result}`, { type: 'success' }); }
    catch (e) { toast(e.message, { type: 'error' }); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this bet?')) return;
    try { await deleteBet(id); toast('Deleted', { type: 'success' }); }
    catch (e) { toast(e.message, { type: 'error' }); }
  }

  return (
    <>
      <div className="bk-header">
        <div>
          <div className="trc-eyebrow">Your bankroll</div>
          <div className="trc-final">
            {summary.netDollars >= 0 ? '+' : ''}${summary.netDollars.toFixed(2)}
            <span className="trc-final-sub">{summary.totalBets} bets · {summary.roi.toFixed(1)}% ROI</span>
          </div>
        </div>
        <button className="btn-gold" onClick={() => setLogOpen(true)}>+ Log bet</button>
      </div>

      <div className="bk-stats">
        <Stat k="Win rate"   v={summary.totalGraded ? `${(summary.wins / summary.totalGraded * 100).toFixed(1)}%` : '—'} sub={`${summary.wins}-${summary.losses}-${summary.pushes}`} />
        <Stat k="Units net"  v={`${summary.unitsNet >= 0 ? '+' : ''}${summary.unitsNet.toFixed(1)}u`} sub="across graded bets" />
        <Stat k="Pending"    v={summary.pending} sub="bets in flight" />
        <Stat k="Avg unit $" v={`$${summary.avgUnitSize.toFixed(0)}`} sub="across logged bets" />
      </div>

      {bets.length > 0 && (
        <div className="about-block" style={{ marginTop: 14 }}>
          <h3>Profit over time</h3>
          <BankrollChart series={series} />
        </div>
      )}

      <div className="about-block" style={{ marginTop: 14 }}>
        <h3>Bet log {bets.length > 0 && <span style={{ color: 'var(--ink-faint)', fontSize: 13, fontWeight: 500 }}>({bets.length})</span>}</h3>
        {loading ? (
          <p style={{ color: 'var(--ink-dim)' }}>Loading...</p>
        ) : bets.length === 0 ? (
          <BetLogEmpty onLog={() => setLogOpen(true)} />
        ) : (
          <BetLogTable bets={bets} onResult={handleResult} onDelete={handleDelete} />
        )}
      </div>

      {logOpen && <LogBetForm onSave={handleLog} onCancel={() => setLogOpen(false)} />}
    </>
  );
}

function Stat({ k, v, sub }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v gold">{v}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

function BetLogEmpty({ onLog }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-dim)' }}>
      <p style={{ marginBottom: 16 }}>No bets logged yet. Log your first bet to start tracking ROI.</p>
      <button className="btn-gold" onClick={onLog}>+ Log your first bet</button>
    </div>
  );
}

function BetLogTable({ bets, onResult, onDelete }) {
  return (
    <div className="bk-table">
      {bets.map((b) => {
        const pl = (b.payout != null) ? b.payout : 0;
        const isPending = b.result === 'pending';
        return (
          <div key={b.id} className={`bk-row res-${b.result}`}>
            <div className="bk-row-main">
              <div className="bk-row-desc">
                <span className={'lg-badge ' + (b.league || 'nfl')}>{(b.league || 'NFL').toUpperCase()}</span>
                <strong>{b.description}</strong>
                {b.odds && <span className="bk-odds">{b.odds}</span>}
              </div>
              <div className="bk-row-meta">
                {b.units}u · ${(Number(b.units) * Number(b.unit_size)).toFixed(0)} risk · {new Date(b.placed_at).toLocaleDateString()}
              </div>
            </div>
            <div className="bk-row-pl">
              {isPending ? (
                <div className="bk-actions">
                  <button onClick={() => onResult(b.id, 'win')}  className="btn-ghost win">Win</button>
                  <button onClick={() => onResult(b.id, 'loss')} className="btn-ghost loss">Loss</button>
                  <button onClick={() => onResult(b.id, 'push')} className="btn-ghost">Push</button>
                </div>
              ) : (
                <div className={'bk-pl ' + (pl > 0 ? 'pos' : pl < 0 ? 'neg' : '')}>
                  {pl > 0 ? '+' : ''}${pl.toFixed(2)}
                </div>
              )}
              <button className="bk-x" onClick={() => onDelete(b.id)} aria-label="Delete">×</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BankrollChart({ series }) {
  if (!series.length) return null;
  const data = {
    labels: series.map((p) => new Date(p.t).toLocaleDateString()),
    datasets: [{
      label: 'Cumulative profit',
      data: series.map((p) => Math.round(p.cum * 100) / 100),
      borderColor: '#c084fc',
      backgroundColor: (ctx) => {
        const { ctx: c, chartArea } = ctx.chart;
        if (!chartArea) return 'rgba(192,132,252,0.15)';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, 'rgba(192,132,252,0.32)');
        g.addColorStop(1, 'rgba(192,132,252,0.00)');
        return g;
      },
      borderWidth: 2.5, tension: 0.3, fill: true,
      pointRadius: 0, pointHoverRadius: 5,
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0a0a0a', borderColor: 'rgba(192, 132, 252, 0.35)', borderWidth: 1,
        titleColor: '#c084fc', bodyColor: '#f4eeff',
        callbacks: { label: (ctx) => `${ctx.parsed.y >= 0 ? '+' : ''}$${ctx.parsed.y}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#5a4f6f', font: { size: 10 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' },
           ticks: { color: '#5a4f6f', font: { size: 10 }, callback: (v) => (v >= 0 ? '+' : '') + '$' + v } },
    },
  };
  return <div style={{ height: 220 }}><Line data={data} options={options} /></div>;
}

// ---- helpers --------------------------------------------------------------

function computeSummary(bets) {
  const totalBets = bets.length;
  const graded = bets.filter((b) => b.result !== 'pending');
  const wins = bets.filter((b) => b.result === 'win').length;
  const losses = bets.filter((b) => b.result === 'loss').length;
  const pushes = bets.filter((b) => b.result === 'push').length;
  const pending = bets.filter((b) => b.result === 'pending').length;
  const netDollars = graded.reduce((s, b) => s + Number(b.payout || 0), 0);
  const unitsNet = graded.reduce((s, b) => {
    if (b.result === 'win')  return s + Number(b.units);
    if (b.result === 'loss') return s - Number(b.units);
    return s;
  }, 0);
  const risked = graded.reduce((s, b) => s + Number(b.units) * Number(b.unit_size), 0);
  const roi = risked > 0 ? (netDollars / risked) * 100 : 0;
  const avgUnitSize = bets.length
    ? bets.reduce((s, b) => s + Number(b.unit_size), 0) / bets.length
    : 25;
  return { totalBets, totalGraded: graded.length, wins, losses, pushes, pending, netDollars, unitsNet, roi, avgUnitSize };
}

function computeSeries(bets) {
  const graded = bets.filter((b) => b.result !== 'pending')
    .sort((a, b) => new Date(a.graded_at || a.placed_at) - new Date(b.graded_at || b.placed_at));
  let cum = 0;
  return graded.map((b) => {
    cum += Number(b.payout || 0);
    return { t: b.graded_at || b.placed_at, cum };
  });
}
