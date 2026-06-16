import React from 'react';
import { Logo } from './Logo';

// Catches render-time errors so a single broken screen doesn't blank the app.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
            <div className="center mb"><Logo /></div>
            <h2>Something broke on this screen</h2>
            <p className="muted">Sorry — that's on us. Try reloading the page. If it keeps happening, let Jon know what you were doing.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
