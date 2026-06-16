import React, { useEffect, useState } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useEvents } from '../components/EventContext';
import { Alert, Money, Spinner } from '../components/ui';

export default function AdminReports() {
  const { activeId } = useEvents();
  const [shirt, setShirt] = useState(null);
  const [barbie, setBarbie] = useState(null);
  const [fin, setFin] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get(`/admin/events/${activeId}/reports/shirt-order`),
      api.get(`/admin/events/${activeId}/reports/barbie-count`),
      api.get(`/admin/events/${activeId}/reports/financials`),
      api.get(`/admin/events/${activeId}/reports/daily-roster`),
    ]).then(([s, b, f, r]) => { setShirt(s.data); setBarbie(b.data); setFin(f.data); setRoster(r.data); })
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  return (
    <div>
      <h2>Reports</h2>
      <div className="row row-wrap">
        {/* Shirt order */}
        <div className="card" style={{ flex: '1 1 320px' }}>
          <div className="spread"><h3 style={{ margin: 0 }}>Shirt order</h3><span className="badge badge-pending">{shirt.total} total</span></div>
          {!shirt.locked && <Alert kind="warn">{shirt.missing_sizes.length} confirmed marshal(s) have no shirt size yet. Export is not final until all sizes are in.</Alert>}
          <table className="data mt">
            <thead><tr><th>Size</th><th>Qty</th><th>Value</th></tr></thead>
            <tbody>
              {shirt.bySize.length === 0 && <tr><td colSpan={3} className="muted">No shirts yet.</td></tr>}
              {shirt.bySize.map((s) => <tr key={s.size}><td>{s.size}</td><td>{s.quantity}</td><td><Money value={s.value} /></td></tr>)}
            </tbody>
          </table>
          {shirt.missing_sizes.length > 0 && (
            <div className="mt"><div className="eyebrow mb">Missing sizes</div>{shirt.missing_sizes.map((m, i) => <div key={i} className="metadata">{m.forenames} {m.surname}</div>)}</div>
          )}
        </div>

        {/* Barbie */}
        <div className="card" style={{ flex: '1 1 220px' }}>
          <h3>Add-on opt-ins</h3>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-navy)' }}>{barbie.count}</div>
          <div className="metadata">attending · <Money value={barbie.value} /></div>
        </div>

        {/* Financials */}
        <div className="card" style={{ flex: '1 1 260px' }}>
          <h3>Financials</h3>
          <div className="spread"><span className="muted">Confirmed</span><strong>{fin.confirmed}</strong></div>
          <div className="spread"><span className="muted">Total due</span><strong><Money value={fin.total_due} /></strong></div>
          <div className="spread"><span className="muted">Received</span><strong><Money value={fin.total_received} /></strong></div>
          <div className="spread"><span className="muted">Outstanding</span><strong style={{ color: 'var(--color-orange)' }}><Money value={fin.outstanding} /></strong></div>
          <div className="metadata mt">{fin.paid_count} paid · {fin.unpaid_count} unpaid</div>
        </div>
      </div>

      {/* Daily roster */}
      <div className="card mt">
        <div className="spread"><h3 style={{ margin: 0 }}>Daily roster</h3>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/schedule/export`, 'roster.csv')}>Export CSV</button>
        </div>
        {Object.keys(roster.byDay).length === 0 ? <p className="muted">No schedule assignments yet.</p> : (
          Object.entries(roster.byDay).map(([day, people]) => (
            <div key={day} className="mt">
              <div className="eyebrow mb">{day} ({people.length})</div>
              <table className="data">
                <thead><tr><th>Name</th><th>Team</th><th>Role</th><th>Post</th><th>Mobile</th></tr></thead>
                <tbody>{people.map((p, i) => <tr key={i}><td>{p.surname}, {p.forenames}</td><td>{p.ora_team || '—'}</td><td>{p.role}</td><td>{p.post || '—'}</td><td className="metadata">{p.phone_mobile}</td></tr>)}</tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
