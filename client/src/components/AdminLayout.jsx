import React from 'react';
import { NavLink, useNavigate, Outlet, Navigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth';
import { useEvents } from './EventContext';
import { Spinner } from './ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/applications', label: 'Applications' },
  { to: '/admin/schedule', label: 'Schedule', coordinatorOnly: true },
  { to: '/admin/comms', label: 'Communications', coordinatorOnly: true },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/committee', label: 'Committee view', committeeOnly: true },
];

function EventSelector() {
  const { events, activeId, selectEvent } = useEvents();
  if (!events.length) return null;
  return (
    <select
      value={activeId || ''}
      onChange={(e) => selectEvent(e.target.value)}
      style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }}
    >
      {events.map((e) => (
        <option key={e.id} value={e.id} style={{ color: '#1A2B3C' }}>{e.name}</option>
      ))}
    </select>
  );
}

export default function AdminLayout() {
  const { user, loading, logout, isCoordinator } = useAuth();
  const navigate = useNavigate();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/admin/login" replace />;

  const linkStyle = ({ isActive }) => ({
    display: 'block',
    padding: '10px 16px',
    color: isActive ? '#fff' : 'rgba(255,255,255,0.75)',
    fontWeight: isActive ? 700 : 500,
    fontSize: 13,
    borderLeft: isActive ? '3px solid #E85D2F' : '3px solid transparent',
    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
    textDecoration: 'none',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 220, background: 'var(--color-navy)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
        <div style={{ padding: '18px 16px' }}>
          <Logo variant="dark" logoSize={28} wordSize={19} />
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <EventSelector />
        </div>
        <nav style={{ flex: 1 }}>
          {NAV.filter((n) => (!n.coordinatorOnly || isCoordinator) && (!n.committeeOnly || !isCoordinator)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={linkStyle}>{n.label}</NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'capitalize', marginBottom: 8 }}>{user.role}</div>
          <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', width: '100%' }} onClick={() => { logout(); navigate('/admin/login'); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1200 }}>
        <Outlet />
      </main>
    </div>
  );
}
