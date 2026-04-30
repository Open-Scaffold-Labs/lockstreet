import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { usePickActions } from '../hooks/usePickActions.js';

/**
 * Tail / Fade engagement buttons for a user_pick. Replaces the
 * like/dislike pattern from social apps with the betting-native signal:
 *
 *   Tail = "I'd take the same side" (you'd copy this play)
 *   Fade = "I'd take the other side" (you'd bet against this play)
 *
 * Display: pair of pill-shaped buttons with current count. Selected
 * state shows the pill in --gold (tail) or --red (fade). Clicking
 * the same pill twice clears your action.
 *
 * Locking: DB trigger blocks any insert/update after the parent pick's
 * kickoff. Past-kickoff renders the counts as read-only.
 *
 * Self-interaction: the pick author can still tail/fade their own pick
 * (no client-side block) — Lock Street doesn't pretend you wouldn't take
 * your own side.
 */
export default function TailFadeButtons({ pick }) {
  const { userId } = useAuth?.() || {};
  const toast = useToast();
  const [busy, setBusy] = useState(null); // 'tail' | 'fade' | null
  const {
    tailCount,
    fadeCount,
    myAction,
    setAction,
    clearAction,
  } = usePickActions(pick?.id, userId);

  if (!pick?.id) return null;

  // Lock check — kickoff in the past means counts are read-only.
  const kickoffMs = pick.kickoffAt ? new Date(pick.kickoffAt).getTime() : 0;
  const locked = kickoffMs > 0 && Date.now() >= kickoffMs;

  async function handleClick(action) {
    if (busy) return;
    if (!userId) {
      toast('Sign in to tail or fade', { type: 'error' });
      return;
    }
    if (locked) {
      toast('Locked at kickoff', { type: 'error' });
      return;
    }
    setBusy(action);
    try {
      if (myAction === action) {
        // Clicking the same button I already chose clears my action.
        await clearAction();
      } else {
        await setAction(action);
      }
    } catch (e) {
      toast(e?.message || 'Could not save', { type: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tf-row" role="group" aria-label="Tail or fade this pick">
      <button
        type="button"
        className={'tf-btn tf-tail' + (myAction === 'tail' ? ' active' : '') + (locked ? ' locked' : '')}
        onClick={() => handleClick('tail')}
        disabled={!!busy || locked}
        aria-pressed={myAction === 'tail'}
        title={locked ? 'Locked at kickoff' : myAction === 'tail' ? 'You tailed this — click to undo' : 'Tail this play'}
      >
        <TailIcon />
        <span className="tf-label">TAIL</span>
        <span className="tf-count">{tailCount}</span>
      </button>

      <button
        type="button"
        className={'tf-btn tf-fade' + (myAction === 'fade' ? ' active' : '') + (locked ? ' locked' : '')}
        onClick={() => handleClick('fade')}
        disabled={!!busy || locked}
        aria-pressed={myAction === 'fade'}
        title={locked ? 'Locked at kickoff' : myAction === 'fade' ? 'You faded this — click to undo' : 'Fade this play'}
      >
        <FadeIcon />
        <span className="tf-label">FADE</span>
        <span className="tf-count">{fadeCount}</span>
      </button>
    </div>
  );
}

function TailIcon() {
  // Up-chevron — "I'm with this side, going up"
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

function FadeIcon() {
  // Down-chevron — "going against, going down"
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
