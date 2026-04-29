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
