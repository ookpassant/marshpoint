import React, { useEffect, useState, useRef } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useAuth } from '../auth';
import { Alert, Detail, Money, Spinner, StatusBadge, Modal } from './ui';

const ROLE_LABELS = { ora: 'ORA', stage: 'Rally Stage', flexible: 'Flexible' };
const STATUSES = ['applied', 'licence_pending', 'confirmed', 'cancelled', 'no_show'];

export default function ApplicationDetail({ applicationId, eventId, onChanged }) {
  const { isCoordinator } = useAuth();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [compose, setCompose] = useState(false);
  const fileRef = useRef(null);

  function load() {
    setLoading(true);
    return api.get(`/admin/applications/${applicationId}`)
      .then((res) => { setApp(res.data); setNotes(res.data.coordinator_notes || ''); })
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [applicationId]);

  async function patch(body, successMsg) {
    setMsg('');
    try {
      await api.put(`/admin/applications/${applicationId}`, body);
      await load();
      if (onChanged) onChanged();
      if (successMsg) setMsg(successMsg);
    } catch (err) { setMsg(errMessage(err)); }
  }

  async function verifyLicence(verified) {
    setMsg('');
    try {
      await api.put(`/admin/applications/${applicationId}/verify-licence`, { verified });
      await load(); if (onChanged) onChanged();
    } catch (err) { setMsg(errMessage(err)); }
  }

  async function confirmMarshal() {
    setMsg('');
    try {
      await api.put(`/admin/applications/${applicationId}/confirm`);
      await load(); if (onChanged) onChanged();
      setMsg('Marshal confirmed.');
    } catch (err) { setMsg(errMessage(err)); }
  }

  async function uploadLicence(file) {
    if (!file) return;
    setMsg('');
    try {
      const fd = new FormData(); fd.append('licence', file);
      await api.post(`/admin/applications/${applicationId}/licence`, fd);
      await load(); if (onChanged) onChanged();
      setMsg('Licence uploaded on behalf of marshal.');
    } catch (err) { setMsg(errMessage(err)); }
  }

  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (!app) return null;

  const licenceState = app.licence_verified ? 'Verified' : app.licence_upload_path ? 'Uploaded, not verified' : 'Not uploaded';

  return (
    <div>
      {msg && <Alert kind="info">{msg}</Alert>}

      <div className="spread mb">
        <div>
          <h3 style={{ marginBottom: 2 }}>{app.forenames} {app.surname}{app.preferred_name ? ` (${app.preferred_name})` : ''}</h3>
          <div className="metadata">{app.email} · {app.phone_mobile}</div>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Coordinator controls */}
      {isCoordinator && (
        <div className="card mb">
          <div className="eyebrow mb">Manage</div>
          <div className="field">
            <label className="field-label">Status</label>
            <select value={app.status} onChange={(e) => patch({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="row row-wrap">
            <div className="col" style={{ minWidth: 140 }}>
              <label className="field-label">ORA team</label>
              <select value={app.ora_team || ''} onChange={(e) => patch({ ora_team: e.target.value || null })}>
                <option value="">Unassigned</option><option value="A">Team A</option><option value="B">Team B</option>
              </select>
            </div>
            <div className="col" style={{ minWidth: 140 }}>
              <label className="field-label">Schedule</label>
              <label className="check-row"><input type="checkbox" checked={!app.schedule_provisional} onChange={(e) => patch({ schedule_provisional: !e.target.checked })} /> Finalised (not provisional)</label>
            </div>
          </div>
          <div className="field mt">
            <label className="field-label">Coordinator notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => patch({ coordinator_notes: notes })} />
          </div>
          <div className="row gap-sm mt">
            <button className="btn btn-primary btn-sm" disabled={!app.licence_verified || app.status === 'confirmed'} onClick={confirmMarshal}>Confirm marshal</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setCompose(true)}>Email marshal</button>
          </div>
          {!app.licence_verified && <div className="field-hint mt">Confirm is locked until the licence is verified.</div>}
        </div>
      )}

      {/* Licence */}
      <div className="card mb">
        <div className="eyebrow mb">Licence</div>
        <div className="spread">
          <div>
            <div>{app.msuk_licence_number || '—'} · {app.msuk_licence_grades || '—'}</div>
            <div className="metadata">{licenceState}{app.licence_verified_by_name ? ` by ${app.licence_verified_by_name}` : ''}</div>
          </div>
        </div>
        <div className="row gap-sm mt">
          {app.licence_upload_path && <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/applications/${applicationId}/licence`, `licence-${app.surname}.file`)}>Download</button>}
          {isCoordinator && (
            <>
              <label className="check-row" style={{ margin: 0 }}><input type="checkbox" checked={app.licence_verified} onChange={(e) => verifyLicence(e.target.checked)} /> Verified</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => uploadLicence(e.target.files[0])} />
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current && fileRef.current.click()}>Upload</button>
            </>
          )}
        </div>
      </div>

      {/* Submitted details */}
      <div className="card mb">
        <div className="eyebrow mb">Application</div>
        <Detail label="Role preference">{ROLE_LABELS[app.role_preference]}</Detail>
        <Detail label="Marshalling days">{(app.marshalling_days || []).join(', ')}</Detail>
        <Detail label="Arrival">{app.arrival_day}{app.arrival_time_approx ? ` ~${String(app.arrival_time_approx).slice(0, 5)}` : ''}</Detail>
        <Detail label="Departure">{app.departure_option}</Detail>
        <Detail label="Stage shift">{app.stage_shift_preference}</Detail>
        <Detail label="Accommodation">{app.accommodation_type}{app.accommodation_size_l ? ` (${app.accommodation_size_l}×${app.accommodation_size_w}m)` : ''}</Detail>
        <Detail label="Sharing with">{app.sharing_with_names}</Detail>
        <Detail label="Travelling with">{app.travelling_with_names}</Detail>
        <Detail label="Unavailability">{app.unavailable_notes}</Detail>
        <Detail label="WDMC member">{app.wdmc_member_number}</Detail>
        <Detail label="ORA experienced">{app.ora_experienced ? 'Yes' : 'No'}</Detail>
        <Detail label="GFoS years">{app.gfos_years_attended}</Detail>
      </div>

      {/* Kit + payment */}
      <div className="card mb">
        <div className="eyebrow mb">Kit &amp; payment</div>
        <Detail label="Shirts">{app.shirts && app.shirts.length ? app.shirts.map((s) => `${s.quantity}× ${s.size}`).join(', ') : '—'}</Detail>
        <Detail label="Barbie">{app.barbie_attending ? 'Yes' : 'No'}</Detail>
        <Detail label="Total due"><Money value={app.total_due} /></Detail>
        {isCoordinator ? (
          <div className="row row-wrap mt">
            <label className="check-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={app.payment_received} onChange={(e) => patch({ payment_received: e.target.checked, payment_received_date: e.target.checked ? new Date().toISOString().slice(0, 10) : null })} /> Payment received
            </label>
            {app.payment_received && (
              <select value={app.payment_method || 'BACS'} onChange={(e) => patch({ payment_method: e.target.value })} style={{ maxWidth: 120 }}>
                <option>BACS</option><option>cash</option><option>other</option>
              </select>
            )}
          </div>
        ) : (
          <Detail label="Payment">{app.payment_received ? 'Received' : 'Outstanding'}</Detail>
        )}
      </div>

      {compose && <ComposeModal app={app} eventId={eventId} onClose={() => setCompose(false)} onSent={() => { setCompose(false); setMsg('Email sent.'); }} />}
    </div>
  );
}

function ComposeModal({ app, eventId, onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    setBusy(true); setErr('');
    try {
      await api.post('/admin/comms/individual', { event_id: eventId, marshal_id: app.marshal_id, subject, body, type: 'general' });
      onSent();
    } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Modal open title={`Email ${app.forenames}`} onClose={onClose}
      footer={<div className="spread"><button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy || !subject || !body} onClick={send}>{busy ? 'Sending…' : 'Send'}</button></div>}>
      <Alert kind="error">{err}</Alert>
      <div className="field"><label className="field-label">To</label><input value={app.email} readOnly style={{ background: 'var(--color-border-light)' }} /></div>
      <div className="field"><label className="field-label">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field"><label className="field-label">Message</label><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /><div className="field-hint">Merge fields: {'{{marshal_name}}'}, {'{{status_url}}'}, {'{{apply_url}}'}</div></div>
    </Modal>
  );
}
