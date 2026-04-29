import { useState } from 'react';
import GamePicker from './GamePicker.jsx';
import PickModal from './PickModal.jsx';

/**
 * Two-step flow for entering a pick from anywhere in the app:
 *   1. Pick a game (GamePicker — league + week/date + game list, upcoming only)
 *   2. Pick a side / units / line (PickModal)
 *
 * Used by the "+ Make a Pick" button on /profile so the user doesn't have
 * to navigate to /scores → game detail to lock a pick.
 *
 * Props:
 *   onClose        - called when the user dismisses the flow (any step)
 *   onSubmitted?   - called after a successful pick lock (from PickModal)
 *   defaultLeague? - league to start GamePicker on
 */
export default function MakePickFlow({ onClose, onSubmitted, defaultLeague = 'nfl' }) {
  const [game, setGame] = useState(null);

  if (game) {
    return (
      <PickModal
        game={{
          gameId: game.id,
          league: game.league,
          kickoffAt: game.kickoff,
          season: game.season,
          home: game.home,
          away: game.away,
          // ESPN's scoreboard endpoint already returns the live line on
          // every event (`spread` like "DET -4.5", `ou` like "215.5",
          // mlHome/mlAway). GamePicker reads them straight off `g.spread`
          // / `g.ou`, so the previous list page already shows a spread.
          // Build a consensus object from those strings here so PickModal
          // prefills the line input automatically — no extra fetch, no
          // dependency on the public_betting scraper being up-to-date.
          consensus: {
            spreadHome: parseEspnSpreadToHome(game.spread, game.home?.abbr, game.away?.abbr),
            total:      game.ou != null && game.ou !== '' ? Number(game.ou) : null,
            mlHome:     game.mlHome,
            mlAway:     game.mlAway,
          },
        }}
        onClose={() => { setGame(null); onClose?.(); }}
        onSubmitted={(p) => { onSubmitted?.(p); onClose?.(); }}
      />
    );
  }

  return (
    <div className="pf-modal-overlay" role="dialog" aria-modal="true" aria-label="Make a pick">
      <div className="pf-modal-card mp-card">
        <button type="button" className="pm-close" onClick={onClose} aria-label="Close">×</button>
        <div className="pf-modal-eyebrow">Make a pick</div>
        <h2 className="pf-modal-title">Pick a game</h2>
        <p className="pf-modal-body">
          Choose a sport and an upcoming game. You'll set side, units, and line on the next step.
        </p>
        <GamePicker
          filterStatus="upcoming"
          defaultLeague={defaultLeague}
          onPick={(g) => setGame(g)}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

/**
 * Convert ESPN's `odds.details` string ("DET -4.5", "ORL +2", "EVEN",
 * "PK") into a home-perspective spread number that PickModal expects.
 * The favorite's abbr is at the start; the number after it is always
 * negative for the favorite. We flip sign if the favorite is the away
 * team so the result is always home-perspective.
 *
 * Returns null if the string can't be parsed.
 */
function parseEspnSpreadToHome(details, homeAbbr, awayAbbr) {
  if (!details || !homeAbbr) return null;
  const s = String(details).trim();
  if (/^(EVEN|PK|PICK[''-]?EM)$/i.test(s)) return 0;
  const m = s.match(/^(\S+)\s+([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const favored = m[1].toUpperCase();
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;
  const home = String(homeAbbr).toUpperCase();
  const away = String(awayAbbr || '').toUpperCase();
  if (favored === home) return num;
  if (favored === away) return -num;
  return null;
}
