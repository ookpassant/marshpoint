import React from 'react';

// Pin with a marshal's flag. variant: 'light' (default), 'dark'.
export function Logomark({ size = 32, variant = 'light' }) {
  const pin = variant === 'dark' ? '#F5F2ED' : '#1A2B3C';
  const inner = variant === 'dark' ? '#1A2B3C' : '#F5F2ED';
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M28 4C19.163 4 12 11.163 12 20C12 31 28 52 28 52C28 52 44 31 44 20C44 11.163 36.837 4 28 4Z" fill={pin} />
      <circle cx="28" cy="20" r="9" fill={inner} />
      <rect x="26.5" y="14" width="2" height="12" rx="1" fill={pin} />
      <path d="M28.5 14.5 L35 17.5 L28.5 20 Z" fill="#E85D2F" />
    </svg>
  );
}

export function Wordmark({ size = 22, variant = 'light' }) {
  const base = variant === 'dark' ? '#FFFFFF' : '#1A2B3C';
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: base, lineHeight: 1 }}>
      marsh<span style={{ color: '#E85D2F' }}>point</span>
    </span>
  );
}

export function Logo({ variant = 'light', logoSize = 30, wordSize = 22, subline = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <Logomark size={logoSize} variant={variant} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <Wordmark size={wordSize} variant={variant} />
        {subline && (
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6B7A8A', marginTop: 3 }}>
            Marshal Event Management
          </span>
        )}
      </span>
    </span>
  );
}
