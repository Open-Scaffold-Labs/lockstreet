import { Link } from 'react-router-dom';
import { winPayoff, fmtNet } from '../lib/userPicks.js';

/**
 * One pick row inside a profile. Self-contained: renders from the
 * snapshot columns on user_picks (home_abbr/away_abbr/logos/line) so
 * the row stays correct even after ESPN scoreboard data ages out.
 *
 * Visual: leans on the existing .bk-row family. We add .res-* borders
 * for pending/win/loss/push, and use .pf-* classes for the bits
 * specific to user picks (line+juice pill, bet-type tag, side label).
 */
export default function UserPickCard({ pick, showAuthor = false, author = null }) {
  if (!pick) return null;
  const result = pick.result || 'pending';
  const isGraded = result === 'win' || result === 'loss' || result === 'push';
  const matchup = matchupLabel(pick);

  const linePill = formatLinePill(pick);
  const juicePill = formatJuicePill(pick);
  const sideLabel = formatSideLabel(pick);

  const net = isGraded ? netForRow(pick) : null;
  const netCls = net == null ? '' : (net > 0 ? 'pos' : net < 0 ? 'neg' : '');

  return (
    <div className={`bk-row pf-pick res-${result}` + (pick.isFreePick ? ' pf-pick-free' : '')}>
      <div className="bk-row-main">
        <div className="bk-row-desc">
          <span className={'lg-badge ' + (pick.league || 'nfl')}>
            {(pick.league || 'NFL').toUpperCase()}
          </span>
          {pick.isFreePick ? (
            <span className="pf-free-badge" title="Lock Street's free weekly pick">FREE PICK</span>
          ) : null}
          {showAuthor && author ? (
            <Link to={`/u/${author.handle}`} className="pf-pick-author">
              @{author.handle}
            </Link>
          ) : null}
          <strong>{sideLabel}</strong>
          <span className="pf-bet-type">{pick.betType?.toUpperCase()}</span>
          {linePill && <span className="bk-odds">{linePill}</span>}
          {juicePill && <span className="bk-odds">{juicePill}</span>}
        </div>
        <div className="bk-row-meta">
          {matchup} · {pick.units}u
          {pick.pointBuys > 0 ? <> · bought {pick.pointBuys} half-{pick.pointBuys === 1 ? 'point' : 'points'}</> : null}
          {pick.lockedAt && <> · locked {fmtRelDate(pick.lockedAt)}</>}
          {pick.gradedAt && <> · graded {fmtRelDate(pick.gradedAt)}</>}
        </div>
      </div>
      <div className="bk-row-pl">
        {result === 'pending' ? (
          <div className="pf-pending-badge">PENDING</div>
        ) : (
          <>
            <div className={'bk-pl ' + netCls}>{net == null ? '—' : fmtNet(net)}</div>
            <div className={'pf-result-badge res-' + result}>{result.toUpperCase()}</div>
          </>
        )}
      </div>
    </div>
  );
}

function netForRow(p) {
  const u = Number(p.units) || 0;
  if (p.result === 'win')  return u * winPayoff(p.juiceAtPick ?? p.juice_at_pick);
  if (p.result === 'loss') return -u;
  return 0;
}

function matchupLabel(p) {
  if (p.awayAbbr && p.homeAbbr) return `${p.awayAbbr} @ ${p.homeAbbr}`;
  return p.gameId || '—';
}

function formatLinePill(p) {
  if (p.betType === 'ml') return null; // line shown via odds for ML
  if (p.lineAtPick == null) return null;
  const sign = p.lineAtPick > 0 ? '+' : '';
  if (p.betType === 'total') {
    return p.side === 'over' ? `O ${p.lineAtPick}` : `U ${p.lineAtPick}`;
  }
  return `${sign}${p.lineAtPick}`;
}

function formatJuicePill(p) {
  const j = p.juiceAtPick ?? p.juice_at_pick ?? -110;
  return j > 0 ? `+${j}` : `${j}`;
}

function formatSideLabel(p) {
  if (p.betType === 'total') return p.side === 'over' ? 'OVER' : 'UNDER';
  if (p.side === 'home' && p.homeAbbr) return p.homeAbbr.toUpperCase();
  if (p.side === 'away' && p.awayAbbr) return p.awayAbbr.toUpperCase();
  return (p.side || '').toUpperCase();
}

function fmtRelDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < day) return `${Math.round(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return d.toLocaleDateString();
}
