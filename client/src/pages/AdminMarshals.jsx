import React, { useEffect, useState, useCallback } from 'react';
import api, { errMessage } from '../api';
import { useAuth } from '../auth';
import { Alert, Spinner, SlideOver, StatusBadge, Detail } from '../components/ui';

export default function AdminMarshals() {
  const { isCoordinator } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/marshals', { params: search ? { search } : {} })
      .then((res) => setRows(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      <h2>Marshals</h2>
      <div className="metadata mb">Everyone on record, across all events.</div>
      {error && <Alert kind="error">{error}</Alert>}

      <div className="field" style={{ maxWidth: 320 }}>
        <input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Licence</th><th>GFoS yrs</th><th>ORA exp.</th><th>Active</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="center muted" style={{ padding: 24 }}>No marshals found.</td></tr>}
              {rows.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => setOpenId(m.id)}>
                  <td><strong>{m.surname}</strong>, {m.forenames}{m.preferred_name ? ` (${m.preferred_name})` : ''}</td>
                  <td className="metadata">{m.email}</td>
                  <td className="metadata">{m.phone_mobile}</td>
                  <td>{m.licence_verified ? <span className="badge badge-confirmed">Verified</span> : m.licence_upload_path ? <span className="badge badge-pending">Unverified</span> : <span className="muted">—</span>}</td>
                  <td>{m.gfos_years_attended}</td>
                  <td>{m.ora_experienced ? '✓' : '—'}</td>
                  <td>{m.is_active ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver open={!!openId} onClose={() => setOpenId(null)} title="Marshal">
        {openId && <MarshalDetail marshalId={openId} canEdit={isCoordinator} onChanged={load} />}
      </SlideOver>
    </div>
  );
}

function MarshalDetail({ marshalId, canEdit, onChanged }) {
  const [m, setM] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    setLoading(true);
    return Promise.all([
      api.get(`/admin/marshals/${marshalId}`),
      api.get(`/admin/marshals/${marshalId}/applications`),
    ]).then(([mr, hr]) => { setM(mr.data); setNotes(mr.data.notes || ''); setHistory(hr.data); })
      .catch(() => {}).finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [marshalId]);

  async function patch(body) {
    setMsg('');
    try { await api.put(`/admin/marshals/${marshalId}`, body); await load(); if (onChanged) onChanged(); }
    catch (err) { setMsg(errMessage(err)); }
  }

  if (loading) return <Spinner />;
  if (!m) return null;

  return (
    <div>
      {msg && <Alert kind="info">{msg}</Alert>}
      <h3 style={{ marginBottom: 2 }}>{m.forenames} {m.surname}</h3>
      <div className="metadata mb">{m.email} · {m.phone_mobile}</div>

      <div className="card mb">
        <Detail label="Address">{[m.address_line1, m.address_line2, m.address_town, m.address_postcode].filter(Boolean).join(', ')}</Detail>
        <Detail label="MSUK licence">{m.msuk_licence_number} · {m.msuk_licence_grades}</Detail>
        <Detail label="WDMC member">{m.wdmc_member_number}</Detail>
        <Detail label="Interests">{(m.motorsport_interests || []).join(', ')}</Detail>
        <Detail label="GFoS years">{m.gfos_years_attended}</Detail>
      </div>

      {canEdit && (
        <div className="card mb">
          <div className="eyebrow mb">Manage</div>
          <label className="check-row"><input type="checkbox" checked={m.ora_experienced} onChange={(e) => patch({ ora_experienced: e.target.checked })} /> ORA-experienced (can cover ORA)</label>
          <label className="check-row"><input type="checkbox" checked={m.is_active} onChange={(e) => patch({ is_active: e.target.checked })} /> Active</label>
          <div className="field mt">
            <label className="field-label">Coordinator notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => patch({ notes })} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="eyebrow mb">Event history</div>
        {history.length === 0 ? <span className="muted">No applications yet.</span> : (
          <table className="data">
            <thead><tr><th>Event</th><th>Status</th><th>Role</th><th>Team</th><th>Paid</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.event_name}</td>
                  <td><StatusBadge status={h.status} /></td>
                  <td style={{ textTransform: 'capitalize' }}>{h.role_preference || '—'}</td>
                  <td>{h.ora_team || '—'}</td>
                  <td>{h.payment_received ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
