import { Component } from 'react';

/**
 * Root error boundary. Catches render errors anywhere in the app and shows
 * a friendly fallback instead of the white-screen-of-death you get when an
 * uncaught error rips through React's reconciliation.
 *
 * Usage: wrap whatever subtree you want isolated.
 *   <ErrorBoundary><Routes>...</Routes></ErrorBoundary>
 *
 * Pass `fallback={(err, reset) => ...}` to customize the rendered output;
 * default is a centered "Something went wrong" with a Reload button.
 *
 * Note: error boundaries don't catch async errors, event handlers, or SSR
 * — only render-phase exceptions. For async failures, use try/catch + toast.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { fallback, children } = this.props;
    if (!error) return children;
    if (typeof fallback === 'function') return fallback(error, this.reset);

    return (
      <div className="wrap" style={{ paddingTop: 80 }}>
        <div className="about-block" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong.</h2>
          <p style={{ color: 'var(--ink-dim)', marginBottom: 24 }}>
            The page hit an unexpected error. Reloading usually fixes it; if it keeps happening, let Matt know.
          </p>
          <button
            type="button"
            className="btn-gold"
            onClick={() => { this.reset(); if (typeof window !== 'undefined') window.location.reload(); }}
            style={{ padding: '12px 24px' }}
          >
            Reload
          </button>
          {error?.message && (
            <details style={{ marginTop: 24, color: 'var(--ink-faint)', fontSize: 12 }}>
              <summary style={{ cursor: 'pointer' }}>Error details</summary>
              <pre style={{ textAlign: 'left', overflow: 'auto', marginTop: 8 }}>{String(error.message)}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
