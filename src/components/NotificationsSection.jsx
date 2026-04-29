import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications.js';
import FollowButton from './FollowButton.jsx';

/**
 * Notification inbox rendered on /profile (own user only). Lists
 * notifications newest first, marks a row as read when clicked, and
 * exposes a "Mark all read" button when there are unread items.
 *
 * Data lives in `public.notifications` (see migration); rows are
 * inserted by /api/send-notifications variants whenever a delivery
 * happens.
 */
export default function NotificationsSection() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();

  function clickRow(n) {
    if (!n.readAt) markRead(n.id).catch(() => {});
    if (n.url) navigate(n.url);
  }

  return (
    <div className="about-block">
      <div className="pf-picks-head">
        <h3>
          Notifications
          {unreadCount > 0 ? <span className="pf-notif-unread-badge">{unreadCount}</span> : null}
        </h3>
        {unreadCount > 0 ? (
          <button type="button" className="btn-ghost pf-notif-mark-all" onClick={() => markAllRead().catch(() => {})}>
            Mark all read
          </button>
        ) : null}
      </div>

      {loading ? (
        <p style={{ color: 'var(--ink-dim)' }}>Loading…</p>
      ) : notifications.length === 0 ? (
        <p style={{ color: 'var(--ink-dim)', padding: '12px 0' }}>
          No notifications yet. New followers and graded picks will land here.
        </p>
      ) : (
        <div className="bk-table">
          {notifications.map((n) => {
            const followerId = n.type === 'new_follower' ? n.meta?.follower_id : null;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                className={'bk-row pf-notif-row' + (n.readAt ? '' : ' is-unread')}
                onClick={() => clickRow(n)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickRow(n); } }}
              >
                <div className="bk-row-main">
                  <div className="bk-row-desc">
                    <span className={'pf-notif-type-badge type-' + n.type}>{labelForType(n.type)}</span>
                    <strong>{n.title}</strong>
                  </div>
                  {n.body ? <div className="bk-row-meta">{n.body}</div> : null}
                  <div className="bk-row-meta" style={{ color: 'var(--ink-faint)' }}>
                    {fmtRelDate(n.createdAt)}
                  </div>
                </div>
                <div
                  className="pf-notif-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {followerId ? (
                    <FollowButton targetUserId={followerId} compact followLabel="Follow back" />
                  ) : null}
                  {!n.readAt ? <span className="pf-notif-dot" aria-label="Unread" /> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelForType(type) {
  switch (type) {
    case 'new_follower':   return 'FOLLOWER';
    case 'pick_graded':    return 'GRADED';
    case 'free_pick_drop': return 'FREE PICK';
    case 'system':         return 'SYSTEM';
    default:               return (type || '').toUpperCase();
  }
}

function fmtRelDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < day) return `${Math.round(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return d.toLocaleDateString();
}
