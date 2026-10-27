import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: if the UI throws while rendering, show a 500 page in the
 * same style as the server's status pages instead of a blank screen.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('FoleyCraft crashed while rendering', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          background: '#000',
          color: '#fff',
          padding: 'clamp(16px, 3.2vw, 44px)',
          fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 16,
        }}
      >
        <h1 style={{ margin: 0, fontFamily: "'Anton', Impact, sans-serif", fontWeight: 400, fontSize: 'clamp(9rem, 32vw, 28rem)', lineHeight: 0.85, color: '#FF8A3D' }}>
          500
        </h1>
        <h2 style={{ margin: 0, fontFamily: "'Anton', Impact, sans-serif", fontWeight: 400, fontSize: 'clamp(2.5rem, 6vw, 5rem)', lineHeight: 1 }}>
          The studio crashed.
        </h2>
        <p style={{ margin: 0, fontSize: 20, color: '#cfcfcf', maxWidth: '28em' }}>
          Something broke in the page. It is not your fault. Reload to start again; your saved presets are untouched.
        </p>
        <p style={{ margin: 0, fontSize: 14, color: '#a2a2a2' }}>{this.state.error.message}</p>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
            style={{ minHeight: 56, padding: '0 32px', borderRadius: 999, border: 0, background: '#fff', color: '#000', font: "700 18px 'Hanken Grotesk', sans-serif", cursor: 'pointer' }}
          >
            Reload FoleyCraft
          </button>
          <a href="/status/" style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
            See all status pages
          </a>
        </div>
      </main>
    );
  }
}
