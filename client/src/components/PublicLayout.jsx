import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';

// Centred, mobile-first shell for marshal-facing pages (apply / status).
export default function PublicLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-parchment)' }}>
      <header style={{ background: 'var(--color-white)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 16px' }}>
          <Logo subline />
        </div>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 40px', width: '100%', flex: 1 }}>
        {children}
      </div>
      <footer style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px', width: '100%' }} className="metadata">
        <Link to="/privacy">Privacy notice</Link> · Your data is stored privately and never sold.
      </footer>
    </div>
  );
}
