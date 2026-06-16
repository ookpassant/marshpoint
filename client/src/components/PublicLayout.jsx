import React from 'react';
import { Logo } from './Logo';

// Centred, mobile-first shell for marshal-facing pages (apply / status).
export default function PublicLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-parchment)' }}>
      <header style={{ background: 'var(--color-white)', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 16px' }}>
          <Logo subline />
        </div>
      </header>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 60px' }}>
        {children}
      </div>
    </div>
  );
}
