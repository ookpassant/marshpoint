import React, { useEffect, useState } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useEvents } from '../components/EventContext';
import { Alert, Money, Spinner } from '../components/ui';

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ flex: '1 1 150px', minWidth: 140 }}>
      <div className="eyebrow">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-navy)', marginTop: 4 }}>{value}</div>
      {sub && <div className="metadata mt">{sub}</div>}
    </div>
  );
}

export default function CommitteeView() {
  const { activeId, activeEvent } = useEvents();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/events/${activeId}/summary`)
      .then((res) => setSummary(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;
  const s = summary;

  return (
    <div>
      <div className="spread mb">
        <div><h2 style={{ marginBottom: 2 }}>{activeEvent ? activeEvent.name : 'Committee overview'}</h2><div className="metadata">Read-only committee view</div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/applications/export`, 'applications.csv')}>Export</button>
      </div>

      <div className="row row-wrap mb">
        <Stat label="Invited" value={s.invitations.total} />
        <Stat label="Applied" value={s.applications.total} />
        <Stat label="Confirmed" value={s.applications.confirmed} />
        <Stat label="Paid" value={s.applications.paid} sub={`of ${s.applications.confirmed}`} />
      </div>

      <div className="row row-wrap mb">
        <Stat label="ORA Team A" value={`${s.ora.teamA}/${s.ora.target}`} />
        <Stat label="ORA Team B" value={`${s.ora.teamB}/${s.ora.target}`} />
        <Stat label="Barbie" value={s.barbie.attending} />
        <Stat label="Shirts" value={s.shirts.totalQty} />
      </div>

      <div className="card">
        <div className="eyebrow mb">Financial summary</div>
        <div className="spread"><span className="muted">Total due</span><strong><Money value={s.revenue.due} /></strong></div>
        <div className="spread"><span className="muted">Received</span><strong><Money value={s.revenue.received} /></strong></div>
        <div className="spread" style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
          <span className="muted">Outstanding</span><strong style={{ color: 'var(--color-orange)' }}><Money value={s.revenue.due - s.revenue.received} /></strong>
        </div>
      </div>
    </div>
  );
}
