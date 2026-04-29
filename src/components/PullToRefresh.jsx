import { useEffect, useRef, useState } from 'react';

/**
 * iOS-style pull-to-refresh. Native Safari has this built in, but the
 * standalone PWA (home-screen icon) does not — so we re-implement it
 * for the installed app. Activates only when scrollY === 0 at touch
 * start, tracks vertical drag with a resistance curve, and on release
 * past the threshold reloads the page. (window.location.reload picks
 * up the latest deployed bundle and refetches every data hook —
 * simpler than threading a route-aware refresh callback.)
 *
 * No-ops on desktop (touch events never fire on a mouse).
 */
const THRESHOLD = 70;   // px past which we'll refresh on release
const MAX_PULL  = 130;  // visual cap so the indicator doesn't drag forever

export default function PullToRefresh() {
  const [pull, setPull]               = useState(0);
  const [refreshing, setRefreshing]   = useState(false);
  const startY      = useRef(null);
  const tracking    = useRef(false);
  const pullRef     = useRef(0);

  useEffect(() => {
    function shouldSkip(target) {
      // Don't hijack pulls when the user is interacting with an input,
      // textarea, or any contenteditable element — they may be trying
      // to position the caret with a downward drag.
      if (!target) return false;
      const tag = (target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      // Skip while a modal overlay is open (their own scroll handling
      // shouldn't fight ours).
      if (document.querySelector('.pf-modal-overlay, .onboarding-overlay')) return true;
      return false;
    }

    function onTouchStart(e) {
      if (refreshing) return;
      if (e.touches.length !== 1) { tracking.current = false; return; }
      if (window.scrollY > 0) { tracking.current = false; return; }
      if (shouldSkip(e.target)) { tracking.current = false; return; }
      startY.current   = e.touches[0].clientY;
      tracking.current = true;
      pullRef.current  = 0;
    }

    function onTouchMove(e) {
      if (!tracking.current || startY.current == null) return;
      // If the user scrolled the page (window.scrollY > 0), drop tracking.
      if (window.scrollY > 0) {
        tracking.current = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { pullRef.current = 0; setPull(0); return; }
      // Resistance curve — first 60px scaled 0.6x, then taper to MAX.
      const resisted = Math.min(MAX_PULL, delta * 0.55);
      pullRef.current = resisted;
      setPull(resisted);
      // Prevent native overscroll bounce / native pull behavior.
      if (e.cancelable && delta > 6) e.preventDefault();
    }

    function onTouchEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      const final = pullRef.current;
      startY.current = null;

      if (final >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        // Hold the indicator visible briefly so the user sees the
        // commit before the page begins reloading.
        setTimeout(() => { window.location.reload(); }, 150);
      } else {
        setPull(0);
      }
    }

    // touchmove must be passive: false so we can preventDefault the
    // native overscroll. The other two stay passive for perf.
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    window.addEventListener('touchcancel', onTouchEnd,  { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove',  onTouchMove);
      window.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshing]);

  if (pull <= 0 && !refreshing) return null;
  const ready = pull >= THRESHOLD || refreshing;

  return (
    <div
      className={'ptr-indicator' + (ready ? ' ready' : '')}
      style={{ transform: `translate3d(0, ${Math.max(0, pull - 30)}px, 0)` }}
      aria-live="polite"
    >
      <div className={'ptr-spinner' + (refreshing ? ' spinning' : '')}>
        {refreshing ? '⟳' : ready ? '↑' : '↓'}
      </div>
      <div className="ptr-label">
        {refreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
      </div>
    </div>
  );
}
