import React from 'react';

interface State { failed: boolean; message: string }

/**
 * Without this, one exception while drawing any screen leaves a blank page with no way out.
 * It shows what happened in plain words and two ways back: reload, or sign out and start fresh.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  // Type-only declaration (no emitted field), so React's own this.props is left alone.
  declare readonly props: Readonly<{ children?: React.ReactNode }>;
  state: State = { failed: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Screen failed to draw:', error, info.componentStack);
  }

  signOut = () => {
    try { localStorage.removeItem('flowcrm_session'); sessionStorage.clear(); } catch { /* storage blocked */ }
    window.location.assign('/login');
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f7f8', color: '#253341', fontFamily: '"Figtree","Segoe UI",system-ui,sans-serif' }}>
        <div style={{ maxWidth: 440, width: '100%', background: '#fff', border: '1px solid #dde3e8', borderRadius: 16, padding: 32 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: '#0d2b3e' }}>This screen could not load</h1>
          <p style={{ margin: '12px 0 0', lineHeight: 1.6, color: '#5f6d7b' }}>
            Something in your workspace data did not look right, so the page stopped. Reload to try again. If it keeps happening, sign out and back in, or ask your administrator to check the menu and settings.
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 13, color: '#8a96a3', wordBreak: 'break-word' }}>{this.state.message}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={{ height: 44, padding: '0 22px', borderRadius: 999, border: 0, background: '#f4a621', color: '#0d2b3e', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Reload</button>
            <button onClick={this.signOut} style={{ height: 44, padding: '0 22px', borderRadius: 999, border: '1.5px solid #dde3e8', background: '#fff', color: '#0d2b3e', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }
}
