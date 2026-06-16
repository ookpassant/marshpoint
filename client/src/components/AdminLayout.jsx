import React, { useState } from 'react';
import { NavLink, useNavigate, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuth } from '../auth';
import { useEvents } from './EventContext';
import { Spinner } from './ui';

const NAV = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/invitations', label: 'Invitations', coordinatorOnly: true },
  { to: '/admin/applications', label: 'Applications' },
  { to: '/admin/marshals', label: 'Marshals' },
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
      className="mp-event-select"
      value={activeId || ''}
      onChange={(e) => selectEvent(e.target.value)}
      aria-label="Active event"
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
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/admin/login" replace />;

  const links = NAV.filter((n) => (!n.coordinatorOnly || isCoordinator) && (!n.committeeOnly || !isCoordinator));
  const linkClass = ({ isActive }) => `mp-navlink${isActive ? ' active' : ''}`;

  return (
    <div className="mp-admin">
      {/* Mobile top bar */}
      <header className="mp-topbar">
        <button className="mp-burger" aria-label="Toggle menu" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
          <span /><span /><span />
        </button>
        <Logo variant="light" logoSize={26} wordSize={18} />
        <div style={{ width: 40 }} />
      </header>

      {navOpen && <div className="mp-scrim" onClick={() => setNavOpen(false)} />}

      <aside className={`mp-sidebar${navOpen ? ' open' : ''}`}>
        <div className="mp-sidebar-logo">
          <Logo variant="dark" logoSize={28} wordSize={19} />
        </div>
        <div className="mp-sidebar-event">
          <EventSelector />
        </div>
        <nav className="mp-nav" onClick={() => setNavOpen(false)}>
          {links.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="mp-sidebar-foot">
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{user.name}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'capitalize', marginBottom: 8 }}>{user.role}</div>
          <button className="btn btn-ghost btn-sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)', width: '100%' }} onClick={() => { logout(); navigate('/admin/login'); }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="mp-main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
