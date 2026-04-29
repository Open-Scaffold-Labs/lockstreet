import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth, SignedIn, SignedOut, SignInButton } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import MakePickFlow from './MakePickFlow.jsx';
import UserPickCard from './UserPickCard.jsx';

const MAX_BODY = 280;

/**
 * /feed page composer. Lets a signed-in user post text + optionally
 * attach one pick they're making right now. Layout (matches the spec
 * the user asked for):
 *
 *   [ textarea                                              ]
 *   [ "Include pick" button ] [ char count ]   [ Post button ]
 *
 *   If a pick is attached, the pick card renders inline inside the
 *   composer so the user can see what they're posting before submit.
 *
 * Submit behavior:
 *   - body empty + no pick   → button disabled.
 *   - body empty + pick      → just creates the pick (already in
 *     user_picks via MakePickFlow). No post row inserted — the bare
 *     pick will appear in the feed naturally.
 *   - body present (any pick)→ inserts a row in posts (with pick_id
 *     if attached) AND the pick is in user_picks. Feed dedupes so the
 *     pick doesn't render twice.
 */
export default function PostComposer({ onPosted }) {
  return (
    <>
      <SignedIn><Composer onPosted={onPosted} /></SignedIn>
      <SignedOut><ComposerSignedOut /></SignedOut>
    </>
  );
}

function ComposerSignedOut() {
  return (
    <div className="post-composer post-composer-signedout">
      <p style={{ color: 'var(--ink-dim)', margin: 0, fontSize: 13 }}>
        Sign in to post — text, pick, or both. Locked at kickoff. Permanent.
      </p>
      <SignInButton afterSignInUrl="/feed">
        <button className="btn-gold" style={{ padding: '8px 18px', fontSize: 13 }}>Sign in</button>
      </SignInButton>
    </div>
  );
}

function Composer({ onPosted }) {
  const { userId } = useAuth?.() || {};
  const toast = useToast();
  const [body, setBody] = useState('');
  const [pick, setPick] = useState(null); // attached pick after MakePickFlow lock
  const [pickFlowOpen, setPickFlowOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = body.trim();
  const overLimit = body.length > MAX_BODY;
  const canPost = !busy && !overLimit && (trimmed.length > 0 || pick);

  function clearPick() { setPick(null); }

  async function submit(e) {
    e?.preventDefault?.();
    if (!canPost || !userId) return;
    setBusy(true);
    try {
      // If body is empty and a pick was attached, the pick was
      // already inserted by MakePickFlow / submitUserPick. Nothing
      // else to do — it'll appear in the feed as a bare pick.
      if (!trimmed && pick) {
        toast('Pick posted', { type: 'success' });
      } else {
        const { error } = await supabase.from('posts').insert({
          user_id: userId,
          body: trimmed,
          pick_id: pick?.id ?? null,
        });
        if (error) throw error;
        toast(pick ? 'Posted with pick' : 'Posted', { type: 'success' });
      }
      setBody('');
      setPick(null);
      onPosted?.();
    } catch (e) {
      toast(e?.message || 'Could not post', { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="post-composer" onSubmit={submit}>
      <textarea
        className="post-composer-input"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={pick ? 'Add commentary on your pick (optional)…' : 'Drop a take, post a pick, or both…'}
        rows={3}
        maxLength={MAX_BODY + 40 /* hard ceiling, soft warning under */}
      />

      {pick ? (
        <div className="post-composer-pick">
          <UserPickCard pick={pick} />
          <button
            type="button"
            className="post-composer-pick-clear"
            onClick={clearPick}
            aria-label="Remove attached pick"
          >×</button>
        </div>
      ) : null}

      <div className="post-composer-actions">
        <button
          type="button"
          className="btn-ghost post-composer-include-pick"
          onClick={() => setPickFlowOpen(true)}
          disabled={!!pick || busy}
          title={pick ? 'You already attached a pick' : 'Lock a pick to attach to this post'}
        >
          + Include pick
        </button>
        <span className={'post-composer-count' + (overLimit ? ' over' : '')}>
          {body.length}/{MAX_BODY}
        </span>
        <button
          type="submit"
          className="btn-gold post-composer-submit"
          disabled={!canPost}
        >
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>

      {pickFlowOpen && (
        <MakePickFlow
          onClose={() => setPickFlowOpen(false)}
          onSubmitted={(p) => { setPick(p); setPickFlowOpen(false); }}
        />
      )}
    </form>
  );
}
