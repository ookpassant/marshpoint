import React, { useEffect, useState, useCallback } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useAuth } from '../auth';
import { useEvents } from '../components/EventContext';
import { Alert, Money, Spinner, StatusBadge, SlideOver } from '../components/ui';
import ApplicationDetail from '../components/ApplicationDetail';

const STATUS_OPTS = ['applied', 'licence_pending', 'confirmed', 'cancelled', 'no_show'];

export default function AdminApplications() {
  const { activeId } = useEvents();
  const { isCoordinator } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);

  // Filters
  const [status, setStatus] = useState([]);
  const [role, setRole] = useState('');
  const [day, setDay] = useState('');
  const [oraTeam, setOraTeam] = useState('');
  const [licence, setLicence] = useState('');
  const [payment, setPayment] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('submitted_at');
  const [dir, setDir] = useState('desc');

  const load = useCallback(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    const params = { sort, dir };
    if (status.length) params.status = status.join(',');
    if (role) params.role = role;
    if (day) params.day = day;
    if (oraTeam) params.ora_team = oraTeam;
    if (licence) params.licence = licence;
    if (payment) params.payment = payment;
    if (search) params.search = search;
    api.get(`/admin/events/${activeId}/applications`, { params })
      .then((res) => setRows(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId, status, role, day, oraTeam, licence, payment, search, sort, dir]);

  useEffect(() => { load(); }, [load]);

  function toggleStatus(s) {
    setStatus((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  }
  function toggleSort(col) {
    if (sort === col) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(col); setDir('asc'); }
  }
  function toggleSelect(id) {
    setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulk(action) {
    setMsg('');
    const ids = [...selected];
    if (!ids.length) return;
    try {
      if (action === 'confirm') {
        for (const id of ids) { try { await api.put(`/admin/applications/${id}/confirm`); } catch { /* skip */ } }
        setMsg('Confirmed selected (where licence verified).');
      } else if (action === 'paid') {
        for (const id of ids) await api.put(`/admin/applications/${id}/payment`, { payment_received: true });
        setMsg('Marked selected as paid.');
      } else if (action === 'payment_request') {
        const marshalIds = rows.filter((r) => selected.has(r.id)).map((r) => r.marshal_id);
        const res = await api.post(`/admin/events/${activeId}/comms/payment-request`, { recipients: 'specific', marshal_ids: marshalIds });
        setMsg(`Payment requests sent to ${res.data.sent}.`);
      } else if (action === 'remind') {
        const marshalIds = rows.filter((r) => selected.has(r.id)).map((r) => r.marshal_id);
        const res = await api.post(`/admin/events/${activeId}/comms/remind`, { recipients: 'specific', marshal_ids: marshalIds });
        setMsg(`Reminders sent to ${res.data.sent}.`);
      }
      setSelected(new Set());
      load();
    } catch (err) { setMsg(errMessage(err)); }
  }

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;

  const licenceCell = (r) => r.licence_verified ? <span className="badge badge-confirmed">Verified</span>
    : r.licence_upload_path ? <span className="badge badge-pending">Unverified</span>
      : <span className="badge badge-cancelled">Missing</span>;

  return (
    <div>
      <div className="spread mb">
        <h2 style={{ margin: 0 }}>Applications</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/applications/export`, 'applications.csv')}>Export CSV</button>
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {/* Filters */}
      <div className="card mb">
        <div className="row row-wrap" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 220px' }}>
            <label className="field-label">Search</label>
            <input placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label className="field-label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">Any</option><option value="ora">ORA</option><option value="stage">Stage</option><option value="flexible">Flexible</option></select>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label className="field-label">Day</label>
            <select value={day} onChange={(e) => setDay(e.target.value)}><option value="">Any</option>{['Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label className="field-label">ORA team</label>
            <select value={oraTeam} onChange={(e) => setOraTeam(e.target.value)}><option value="">Any</option><option value="A">A</option><option value="B">B</option><option value="unassigned">Unassigned</option></select>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label className="field-label">Licence</label>
            <select value={licence} onChange={(e) => setLicence(e.target.value)}><option value="">Any</option><option value="verified">Verified</option><option value="unverified">Unverified</option><option value="missing">Missing</option></select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label className="field-label">Payment</label>
            <select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">Any</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select>
          </div>
        </div>
        <div className="row row-wrap gap-sm mt">
          {STATUS_OPTS.map((s) => (
            <button key={s} className={`btn btn-sm ${status.includes(s) ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => toggleStatus(s)}>{s}</button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {isCoordinator && selected.size > 0 && (
        <div className="card card-accent mb spread">
          <span>{selected.size} selected</span>
          <div className="row gap-sm row-wrap">
            <button className="btn btn-ghost btn-sm" onClick={() => bulk('remind')}>Send reminder</button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulk('confirm')}>Mark confirmed</button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulk('paid')}>Mark paid</button>
            <button className="btn btn-ghost btn-sm" onClick={() => bulk('payment_request')}>Send payment request</button>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                {isCoordinator && <th />}
                <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>Name</th>
                <th>Role</th><th>Days</th><th>Team</th><th>Licence</th>
                <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>Status</th>
                <th>Shirts</th><th>Add-on</th><th>Payment</th>
                <th onClick={() => toggleSort('submitted_at')} style={{ cursor: 'pointer' }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={11} className="center muted" style={{ padding: 30 }}>Invitations are out. Nothing back yet — that's normal. Reminders go out in 3 days.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setOpenId(r.id)}>
                  {isCoordinator && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>}
                  <td><strong>{r.surname}</strong>, {r.forenames}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.role_preference}</td>
                  <td className="metadata">{(r.marshalling_days || []).map((d) => d.slice(0, 3)).join(' ')}</td>
                  <td>{r.ora_team || '—'}</td>
                  <td>{licenceCell(r)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.shirt_qty}</td>
                  <td>{r.barbie_attending ? '✓' : '—'}</td>
                  <td>{r.payment_received ? <span className="badge badge-paid">Paid</span> : <Money value={r.total_due} />}</td>
                  <td className="metadata nowrap">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SlideOver open={!!openId} onClose={() => setOpenId(null)} title="Application">
        {openId && <ApplicationDetail applicationId={openId} eventId={activeId} onChanged={load} />}
      </SlideOver>
    </div>
  );
}
