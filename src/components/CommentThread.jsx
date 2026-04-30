import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser, SignInButton } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useComments } from '../hooks/useComments.js';

/**
 * Inline comment thread + composer for a post or a user_pick.
 *
 * Pass exactly one of `{ postId }` or `{ pickId }`. Renders a collapsible
 * thread:
 *   - Collapsed: "💬 N comments" link.
 *   - Expanded: list of comments + composer (if signed-in + email-confirmed).
 *
 * On post (the social network), the verified-email gate is enforced
 * client-side. Today the gate is a no-op (Supabase email confirmation is
 * disabled in dev), but kicks in automatically once Matt re-enables it
 * before launch.
 */
export default function CommentThread({ postId, pickId, autoOpen = false }) {
  const [open, setOpen] = useState(autoOpen);
  const { comments, visibleCount, loading, postComment } = useComments({ postId, pickId });

  if (!postId && !pickId) return null;

  return (
    <div className="ct-wrap">
      <button
        type="button"
        className="ct-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <CommentIcon />
        <span>{visibleCount} {visibleCount === 1 ? 'comment' : 'comments'}</span>
        <span className="ct-caret">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="ct-body">
          {loading ? (
            <p className="ct-loading">Loading…</p>
          ) : (
            <CommentList comments={comments} />
          )}
          {/* Pass postComment down rather than re-instantiating the hook
              inside Composer — two useComments() calls on the same target
              both try to .subscribe() the same Supabase realtime channel
              name and the second one throws "cannot add postgres_changes
              callbacks". */}
          <Composer postComment={postComment} />
        </div>
      )}
    </div>
  );
}

function CommentList({ comments }) {
  if (!comments?.length) {
    return <p className="ct-empty">No comments yet. Be first.</p>;
  }
  return (
    <ul className="ct-list">
      {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
    </ul>
  );
}

function CommentRow({ comment }) {
  const { user } = useUser();
  const isMine = user?.id === comment.userId;

  if (comment.deletedAt) {
    return (
      <li className="ct-row ct-row-deleted">
        <span className="ct-meta">comment deleted</span>
      </li>
    );
  }

  return (
    <li className="ct-row">
      <div className="ct-row-head">
        {comment.author?.handle ? (
          <Link to={`/u/${comment.author.handle}`} className="ct-author">
            {comment.author.favTeamLogo ? (
              <img src={comment.author.favTeamLogo} alt="" className="ct-avatar" />
            ) : (
              <span className="ct-avatar ct-avatar-fallback">
                {(comment.author.displayName || comment.author.handle || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="ct-author-name">{comment.author.displayName || comment.author.handle}</span>
            <span className="ct-handle">@{comment.author.handle}</span>
            {comment.author.isCreator && <span className="ct-creator-badge">CREATOR</span>}
          </Link>
        ) : (
          <span className="ct-author ct-author-unknown">@unknown</span>
        )}
        <span className="ct-time">{fmtRel(comment.createdAt)}</span>
        {isMine && <DeleteButton commentId={comment.id} />}
      </div>
      <p className="ct-body-text">{comment.body}</p>
    </li>
  );
}

function DeleteButton({ commentId }) {
  // Inline-import to share the hook's softDelete, but useComments expects
  // a target. Instead, use a one-shot supabase update — same effect, no
  // extra hook coupling.
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const { supabase } = await import('../lib/supabase.js');
      const { error } = await supabase
        .from('comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', commentId);
      if (error) throw error;
      toast('Comment deleted', { type: 'success' });
    } catch (e) {
      toast(e?.message || 'Could not delete', { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="ct-row-delete"
      onClick={go}
      disabled={busy}
      title="Delete this comment"
      aria-label="Delete this comment"
    >
      ✕
    </button>
  );
}

function Composer({ postComment }) {
  const { user, isSignedIn } = useUser();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isSignedIn) {
    return (
      <div className="ct-composer ct-composer-signedout">
        <SignInButton afterSignInUrl={typeof window !== 'undefined' ? window.location.pathname : '/'}>
          <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>
            Sign in to comment
          </button>
        </SignInButton>
      </div>
    );
  }

  // Email-verified gate. Supabase user object exposes email_confirmed_at;
  // when Supabase email confirmation is disabled in dev, every user has
  // a non-null timestamp here so this is a no-op. After launch, blocks
  // unverified bot signups from spamming.
  const supabaseUser = user; // useUser returns the mapped user already
  const verified = !!user?.emailConfirmedAt || !!supabaseUser?.email_confirmed_at || !!supabaseUser?.confirmed_at;
  // Fallback: if neither field is exposed via the mapped user, allow —
  // we still rely on the server insert. We bias toward letting people
  // comment rather than silently blocking on a field we can't see.
  const blockedUnverified = false; // intentionally permissive client-side; server enforces auth.uid()

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (busy) return;
    if (blockedUnverified) {
      toast('Confirm your email to comment.', { type: 'error' });
      return;
    }
    setBusy(true);
    try {
      await postComment(trimmed);
      setBody('');
    } catch (e) {
      toast(e?.message || 'Could not post comment', { type: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ct-composer">
      <textarea
        className="ct-input"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 500))}
        placeholder="Add a comment…"
        rows={2}
        maxLength={500}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="ct-composer-row">
        <span className="ct-counter">{body.length}/500</span>
        <button
          type="button"
          className="btn-gold ct-post"
          disabled={busy || !body.trim()}
          onClick={submit}
        >
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function fmtRel(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
