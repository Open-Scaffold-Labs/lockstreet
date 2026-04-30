import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications.js';
import FollowButton from './FollowButton.jsx';

/**
 * Notification inbox rendered on /profile (own user only). Lists
 * notifications newest first, marks a row as read when clicked, and
 * exposes a "Mark all read" button when there are unread items.
 *
 * Grouping rule (per Matt, 2026-04-30):
 *   - Push delivery is per-event (each interaction = one push).
 *   - Inbox display groups when the same target accumulates 6+ events
 *     of the same type. The group renders as a single row showing the
 *     most recent few actor handles + total count. Click expands to the
 *     full list. This keeps the inbox legible when a popular pick gets
 *     piled on with tails or comments.
 */
export default function NotificationsSection() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => new Set());

  const groups = useMemo(() => buildGroups(notifications), [notifications]);

  function clickRow(n) {
    if (!n.readAt) markRead(n.id).catch(() => {});
    if (n.url) navigate(n.url);
  }

  function clickGroup(g) {
    // Mark every unread row in the group as read on click.
    for (const item of g.items) {
      if (!item.readAt) markRead(item.id).catch(() => {});
    }
    if (g.url) navigate(g.url);
  }

  function toggleGroupExpand(key) {
    setExpandedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
          No notifications yet. New followers, comments, tails/fades, and graded picks will land here.
        </p>
      ) : (
        <div className="bk-table">
          {groups.map((g) => {
            if (g.kind === 'single') {
              return <SingleNotifRow key={g.items[0].id} n={g.items[0]} onClick={clickRow} />;
            }
            const expanded = expandedGroupKeys.has(g.key);
            return (
              <GroupedNotifRow
                key={g.key}
                group={g}
                expanded={expanded}
                onToggleExpand={() => toggleGroupExpand(g.key)}
                onGroupClick={clickGroup}
                onItemClick={clickRow}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SingleNotifRow({ n, onClick }) {
  const followerId = n.type === 'new_follower' ? n.meta?.follower_id : null;
  return (
    <div
      role="button"
      tabIndex={0}
      className={'bk-row pf-notif-row' + (n.readAt ? '' : ' is-unread')}
      onClick={() => onClick(n)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(n); } }}
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
}

function GroupedNotifRow({ group, expanded, onToggleExpand, onGroupClick, onItemClick }) {
  const { items, type, count } = group;
  const unreadCount = items.filter((it) => !it.readAt).length;
  const recentHandles = Array.from(new Set(
    items.slice(0, 5).map((it) => it.meta?.actor_handle || it.meta?.commenter_handle).filter(Boolean)
  ));
  const handlesPreview = recentHandles.length > 0
    ? recentHandles.map((h) => '@' + h).join(', ')
    : null;

  return (
    <div className={'bk-row pf-notif-row pf-notif-group' + (unreadCount > 0 ? ' is-unread' : '')}>
      <div
        role="button"
        tabIndex={0}
        className="bk-row-main pf-notif-group-summary"
        onClick={() => onGroupClick(group)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGroupClick(group); } }}
      >
        <div className="bk-row-desc">
          <span className={'pf-notif-type-badge type-' + type}>{labelForType(type)}</span>
          <strong>{summaryTitle(group)}</strong>
        </div>
        {handlesPreview ? (
          <div className="bk-row-meta">{handlesPreview}{count > recentHandles.length ? ' and others' : ''}</div>
        ) : null}
        <div className="bk-row-meta" style={{ color: 'var(--ink-faint)' }}>
          {fmtRelDate(items[0].createdAt)} · {count} {count === 1 ? 'event' : 'events'}
        </div>
      </div>
      <div
        className="pf-notif-actions"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="pf-notif-expand-btn"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Show all'}
        >
          {expanded ? '▴' : '▾'}
        </button>
        {unreadCount > 0 ? <span className="pf-notif-dot" aria-label="Unread" /> : null}
      </div>
      {expanded ? (
        <div className="pf-notif-group-children">
          {items.map((it) => (
            <SingleNotifRow key={it.id} n={it} onClick={onItemClick} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Walk the (already newest-first) notifications array and bucket
 * contiguous runs of same-(type, target_id) into groups. Bucket of
 * 5 or fewer items renders as individual rows; 6+ collapses into a
 * grouped row.
 *
 * "Target" key derivation:
 *   - new_comment        → meta.target_type + ':' + meta.target_id
 *   - new_tail/new_fade  → 'pick:' + meta.pick_id
 *   - everything else    → never grouped
 */
function buildGroups(notifications) {
  const GROUPABLE = new Set(['new_comment', 'new_tail', 'new_fade']);
  const THRESHOLD = 5;
  const out = [];
  let i = 0;
  while (i < notifications.length) {
    const n = notifications[i];
    const tk = targetKeyFor(n);
    if (!GROUPABLE.has(n.type) || !tk) {
      out.push({ kind: 'single', items: [n] });
      i++;
      continue;
    }
    // Walk forward as long as type + target match.
    let j = i;
    const items = [];
    while (j < notifications.length) {
      const m = notifications[j];
      if (m.type !== n.type) break;
      const mk = targetKeyFor(m);
      if (mk !== tk) break;
      items.push(m);
      j++;
    }
    if (items.length > THRESHOLD) {
      out.push({
        kind: 'group',
        key: `${n.type}:${tk}:${items[0].id}`,
        type: n.type,
        targetKey: tk,
        items,
        count: items.length,
        url: items[0].url || null,
      });
    } else {
      for (const it of items) out.push({ kind: 'single', items: [it] });
    }
    i = j;
  }
  return out;
}

function targetKeyFor(n) {
  if (n.type === 'new_comment') {
    const t = n.meta?.target_type;
    const id = n.meta?.target_id;
    return t && id ? `${t}:${id}` : null;
  }
  if (n.type === 'new_tail' || n.type === 'new_fade') {
    return n.meta?.pick_id ? `pick:${n.meta.pick_id}` : null;
  }
  return null;
}

function summaryTitle(group) {
  const { type, count, items } = group;
  const targetWord = items[0]?.meta?.target_type === 'post' ? 'your post' : 'your pick';
  if (type === 'new_comment') return `${count} new comments on ${targetWord}`;
  if (type === 'new_tail')    return `${count} new tails on your pick`;
  if (type === 'new_fade')    return `${count} new fades on your pick`;
  return `${count} new updates`;
}

function labelForType(type) {
  switch (type) {
    case 'new_follower':   return 'FOLLOWER';
    case 'pick_graded':    return 'GRADED';
    case 'free_pick_drop': return 'FREE PICK';
    case 'system':         return 'SYSTEM';
    case 'new_comment':    return 'COMMENT';
    case 'new_tail':       return 'TAIL';
    case 'new_fade':       return 'FADE';
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
