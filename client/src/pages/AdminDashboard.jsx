import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMessage, downloadFile } from '../api';
import { useEvents } from '../components/EventContext';
import { Alert, Money, Spinner } from '../components/ui';

function StatCard({ label, value, sub, warn }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: warn ? 'var(--color-orange)' : 'var(--color-navy)', lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div className="metadata mt">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const { activeId, activeEvent, loading: evLoading } = useEvents();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/events/${activeId}/summary`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);

  async function sendReminders() {
    setMsg('');
    try {
      const res = await api.post(`/admin/events/${activeId}/comms/remind`, { recipients: 'non_responders' });
      setMsg(`Reminders sent to ${res.data.sent} non-responder(s).`);
    } catch (err) { setMsg(errMessage(err)); }
  }

  if (evLoading || loading) return <Spinner />;
  if (!activeId) return <div className="card"><h2>No event yet</h2><p>Create an event to get started.</p><button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/events')}>Go to Events</button></div>;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!summary) return null;

  const s = summary;
  return (
    <div>
      <div className="spread mb">
        <div>
          <h2 style={{ marginBottom: 2 }}>{activeEvent ? activeEvent.name : 'Dashboard'}</h2>
          <div className="metadata">Overview</div>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" onClick={sendReminders}>Send reminders</button>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/applications/export`, 'applications.csv')}>Export applications</button>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/schedule/export`, 'schedule.csv')}>Export roster</button>
        </div>
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}

      <div className="row row-wrap mb">
        <StatCard label="Invited" value={s.invitations.total} />
        <StatCard label="Responded" value={s.applications.total} sub={`${s.applications.byStatus.applied + s.applications.byStatus.licence_pending} pending review`} />
        <StatCard label="Confirmed" value={s.applications.confirmed} />
        <StatCard label="Paid" value={s.applications.paid} sub={`of ${s.applications.confirmed} confirmed`} />
      </div>

      {/* Rally stage is the priority team — shown first. */}
      {s.stage && (
        <div className="card mb" style={s.stage.anyBelow ? { borderLeft: '3px solid var(--color-orange)' } : undefined}>
          <div className="spread mb">
            <div className="eyebrow">Rally stage coverage — priority team</div>
            <span className="metadata">target {s.stage.target}/shift · {s.stage.applicants} stage applicant(s)</span>
          </div>
          {s.stage.days.length === 0 ? <span className="muted">No event days yet.</span> : (
            <table className="data">
              <thead><tr><th>Day</th><th>AM</th><th>PM</th></tr></thead>
              <tbody>
                {s.stage.days.map((d) => (
                  <tr key={d.day_name}>
                    <td>{d.day_name}</td>
                    <td style={d.amBelow ? { color: 'var(--color-orange)', fontWeight: 700 } : undefined}>{d.am} / {s.stage.target}{d.amBelow ? ' ⚠' : ''}</td>
                    <td style={d.pmBelow ? { color: 'var(--color-orange)', fontWeight: 700 } : undefined}>{d.pm} / {s.stage.target}{d.pmBelow ? ' ⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt"><button className="btn btn-secondary btn-sm" onClick={() => navigate('/admin/schedule')}>Open schedule →</button></div>
        </div>
      )}

      <div className="row row-wrap mb">
        <StatCard label="ORA Team A" value={`${s.ora.teamA} / ${s.ora.target}`} warn={s.ora.teamABelow} sub={s.ora.teamABelow ? 'Below target' : 'On target'} />
        <StatCard label="ORA Team B" value={`${s.ora.teamB} / ${s.ora.target}`} warn={s.ora.teamBBelow} sub={s.ora.teamBBelow ? 'Below target' : 'On target'} />
        <StatCard label="Licences verified" value={s.licences.verified} sub={`${s.licences.pending} pending · ${s.licences.missing} missing`} warn={s.licences.missing > 0} />
        <StatCard label="Add-on" value={s.barbie.attending} sub="opted in" />
      </div>

      <div className="row row-wrap">
        <div className="card" style={{ flex: '2 1 320px' }}>
          <div className="eyebrow mb">Shirts ordered by size</div>
          {s.shirts.totalQty === 0 ? <span className="muted">No shirts yet</span> : (
            <table className="data">
              <thead><tr>{['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].map((z) => <th key={z}>{z}</th>)}<th>Total</th></tr></thead>
              <tbody><tr>{['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].map((z) => <td key={z}>{s.shirts.bySize[z] || 0}</td>)}<td><strong>{s.shirts.totalQty}</strong></td></tr></tbody>
            </table>
          )}
        </div>
        <div className="card" style={{ flex: '1 1 220px' }}>
          <div className="eyebrow mb">Revenue</div>
          <div className="spread"><span className="muted">Due</span><strong><Money value={s.revenue.due} /></strong></div>
          <div className="spread"><span className="muted">Received</span><strong><Money value={s.revenue.received} /></strong></div>
          <div className="spread" style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
            <span className="muted">Outstanding</span><strong style={{ color: 'var(--color-orange)' }}><Money value={s.revenue.due - s.revenue.received} /></strong>
          </div>
        </div>
      </div>

      <div className="mt"><button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/applications')}>View all applications →</button></div>
    </div>
  );
}
