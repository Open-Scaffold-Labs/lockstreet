import { Link } from 'react-router-dom';
import UserPickCard from './UserPickCard.jsx';

/**
 * Renders a /feed post: body text + optional embedded pick card.
 * Bare picks (no wrapping post) render via UserPickCard directly;
 * this component is for posts that have body text.
 *
 * Props:
 *   post         — { id, userId, body, pick, createdAt, pinned }
 *   author       — { handle, displayName, avatarUrl, favTeamLogo }
 *   canPin       — true when the viewer is allowed to toggle pinned
 *                  on this post (creator-author of the post)
 *   onTogglePin  — (postId, nextPinned) => Promise; called when the
 *                  pin button is tapped
 */
export default function PostCard({ post, author, canPin = false, onTogglePin }) {
  if (!post) return null;
  const handleLink = author?.handle ? `/u/${author.handle}` : null;
  const pinned = !!post.pinned;

  return (
    <article className={'post-card' + (pinned ? ' is-pinned' : '')}>
      <header className="post-card-head">
        {handleLink ? (
          <Link to={handleLink} className="post-card-author">
            <PostAuthorAvatar author={author} />
            <span className="post-card-handle">@{author.handle}</span>
            {author?.displayName ? (
              <span className="post-card-name">· {author.displayName}</span>
            ) : null}
          </Link>
        ) : (
          <div className="post-card-author">
            <PostAuthorAvatar author={author} />
            <span className="post-card-handle">@unknown</span>
          </div>
        )}
        {pinned ? <span className="post-card-pinned-badge">PINNED</span> : null}
        <span className="post-card-time">{fmtRel(post.createdAt)}</span>
        {canPin ? (
          <button
            type="button"
            className={'post-card-pin-btn' + (pinned ? ' active' : '')}
            onClick={() => onTogglePin?.(post.id, !pinned)}
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin this post' : 'Pin this post'}
            title={pinned ? 'Unpin' : 'Pin to top of feed'}
          >
            {pinned ? '📌 Unpin' : '📌 Pin'}
          </button>
        ) : null}
      </header>

      <p className="post-card-body">{post.body}</p>

      {post.pick ? (
        <div className="post-card-pick">
          <UserPickCard pick={post.pick} />
        </div>
      ) : null}
    </article>
  );
}

function PostAuthorAvatar({ author }) {
  if (author?.avatarUrl) {
    return <img src={author.avatarUrl} alt="" className="post-card-avatar" />;
  }
  if (author?.favTeamLogo) {
    return <img src={author.favTeamLogo} alt="" className="post-card-avatar post-card-avatar-team" />;
  }
  const initials = (author?.displayName || author?.handle || '?')
    .split(/\s+|@/)[0].slice(0, 2).toUpperCase();
  return <span className="post-card-avatar post-card-avatar-fallback">{initials}</span>;
}

function fmtRel(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - t) / 1000);
  if (sec < 60)        return `${sec}s`;
  if (sec < 3600)      return `${Math.floor(sec / 60)}m`;
  if (sec < 86400)     return `${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
