import { useEffect, useState } from 'react';

/**
 * Mobile-only install prompt.
 * - On Android: uses the beforeinstallprompt event to fire the native install dialog.
 * - On iOS: shows instructions ("tap Share -> Add to Home Screen") since iOS doesn't expose a programmatic install.
 * Hides automatically when running in standalone (already installed) or after dismissal (sticky 7 days).
 */
const DISMISS_KEY = 'ls_install_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

function isIOS() {
  return typeof navigator !== 'undefined'
      && /iPad|iPhone|iPod/.test(navigator.userAgent)
      && !window.MSStream;
}

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth <= 600;
}

function recentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY));
    return t && (Date.now() - t) < DISMISS_TTL_MS;
  } catch { return false; }
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState(null); // Android beforeinstallprompt event
  const ios = isIOS();

  useEffect(() => {
    if (isStandalone() || recentlyDismissed() || !isMobileViewport()) return;

    if (ios) {
      // iOS: no programmatic install, just show instructions after a brief delay.
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    }

    // Android: wait for beforeinstallprompt
    function handler(e) {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [ios]);

  if (!show) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setShow(false);
    if (outcome !== 'accepted') dismiss();
  }

  return (
    <div className="install-prompt" role="dialog" aria-label="Install Lock Street app">
      <button className="ip-x" onClick={dismiss} aria-label="Dismiss">×</button>
      <div className="ip-text">
        <div className="ip-title">Install Lock Street</div>
        {ios ? (
          <div className="ip-body">
            Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong> to use Lock Street like a native app.
          </div>
        ) : (
          <div className="ip-body">Add Lock Street to your home screen for fastest access.</div>
        )}
      </div>
      {!ios && deferred && (
        <button className="ip-install" onClick={install}>Install</button>
      )}
    </div>
  );
}
