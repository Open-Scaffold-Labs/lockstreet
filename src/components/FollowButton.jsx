import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useIsFollowing, useFollows } from '../hooks/useFollows.js';
import { useToast } from '../lib/toast.jsx';

/**
 * Follow / Unfollow button for a profile other than the current user's.
 * Hidden entirely on the user's own profile.
 *
 * Props:
 *   targetUserId   - the user_id to follow/unfollow
 *   compact        - smaller variant for use in lists
 *   onChange(b)    - optional callback fired after a successful toggle
 *   followLabel    - override the default "Follow" text (e.g. "Follow back"
 *                    for the notifications inbox). Only affects the
 *                    not-yet-following state.
 */
export default function FollowButton({ targetUserId, compact = false, onChange, followLabel = 'Follow' }) {
  const { userId: meId, isSignedIn } = useAuth?.() || {};
  const navigate = useNavigate();
  const toast = useToast();

  // Use the lighter hook (count-only query) since we just need the on/off state.
  const { isFollowing, loading, reload } = useIsFollowing(targetUserId);
  // Pull follow/unfollow mutators from the heavier hook (it knows about meId).
  const { follow, unfollow } = useFollows(meId);

  const [busy, setBusy] = useState(false);

  if (!targetUserId || (meId && meId === targetUserId)) return null;

  async function toggle() {
    if (!isSignedIn) {
      navigate('/sign-in?next=' + encodeURIComponent(location.pathname));
      return;
    }
    setBusy(true);
    try {
      if (isFollowing) {
        await unfollow(targetUserId);
        toast('Unfollowed', { type: 'info', duration: 1800 });
      } else {
        await follow(targetUserId);
        toast('Following', { type: 'success', duration: 1800 });
      }
      await reload();
      onChange?.(!isFollowing);
    } catch (e) {
      const msg = e?.message || '';
      if (/Cannot unfollow Lock Street creator/i.test(msg)) {
        toast('You can\'t unfollow the Lock Street account.', { type: 'info', duration: 3000 });
      } else {
        toast(msg || 'Could not update follow', { type: 'error' });
      }
    } finally {
      setBusy(false);
    }
  }

  const cls = isFollowing
    ? 'btn-ghost pf-follow-btn following'
    : 'btn-gold pf-follow-btn';
  const sizeCls = compact ? ' pf-follow-compact' : '';

  return (
    <button
      type="button"
      className={cls + sizeCls}
      onClick={toggle}
      disabled={busy || loading}
      aria-pressed={isFollowing}
    >
      {busy ? '…' : isFollowing ? 'Following' : followLabel}
    </button>
  );
}
