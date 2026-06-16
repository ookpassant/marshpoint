import React from 'react';

export function Spinner({ label = 'Loading…' }) {
  return <div className="spinner-wrap">{label}</div>;
}

const STATUS_LABELS = {
  applied: 'Applied',
  licence_pending: 'Licence Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

export function StatusBadge({ status }) {
  if (!status) return <span className="muted">—</span>;
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Badge({ kind, children }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function Money({ value }) {
  const n = Number(value || 0);
  return <>£{n.toFixed(2)}</>;
}

export function Alert({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

// Simple right-hand slide-over panel.
export function SlideOver({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,43,60,0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', height: '100%', background: 'var(--color-parchment)', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}
      >
        <div className="spread" style={{ padding: '16px 20px', background: 'var(--color-white)', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', background: 'var(--color-white)', borderTop: '1px solid var(--color-border)' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 480 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,43,60,0.35)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: `min(${width}px, 100%)`, maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
        <div className="spread" style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {footer && <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)' }}>{footer}</div>}
      </div>
    </div>
  );
}

// A labelled key/value pair for detail views.
export function Detail({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="eyebrow" style={{ marginBottom: 2 }}>{label}</div>
      <div>{children || <span className="muted">—</span>}</div>
    </div>
  );
}
