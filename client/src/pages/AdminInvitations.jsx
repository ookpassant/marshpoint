import React, { useEffect, useState, useCallback } from 'react';
import api, { errMessage } from '../api';
import { useAuth } from '../auth';
import { useEvents } from '../components/EventContext';
import { Alert, Modal, Spinner } from '../components/ui';

const STATUS_BADGE = {
  sent: 'applied', opened: 'pending', accepted: 'confirmed', declined: 'cancelled', expired: 'cancelled',
};

function applyUrl(token) {
  return `${window.location.origin}/apply/${token}`;
}

export default function AdminInvitations() {
  const { activeId, activeEvent } = useEvents();
  const { isCoordinator } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = useCallback(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/events/${activeId}/invitations`)
      .then((res) => setRows(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);
  useEffect(() => { load(); }, [load]);

  async function remindAll() {
    setMsg('');
    try {
      const res = await api.post(`/admin/events/${activeId}/invitations/remind`, {});
      setMsg(`Reminders sent to ${res.data.sent} of ${res.data.total} non-responder(s).`);
      load();
    } catch (err) { setMsg(errMessage(err)); }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this invitation? Their link will stop working.')) return;
    try { await api.delete(`/admin/invitations/${id}`); load(); }
    catch (err) { setMsg(errMessage(err)); }
  }

  async function copyLink(token) {
    try { await navigator.clipboard.writeText(applyUrl(token)); setCopied(token); setTimeout(() => setCopied(null), 1500); }
    catch { window.prompt('Copy the apply link:', applyUrl(token)); }
  }

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  const counts = rows.reduce((c, r) => { c[r.status] = (c[r.status] || 0) + 1; return c; }, {});

  return (
    <div>
      <div className="spread mb">
        <div>
          <h2 style={{ margin: 0 }}>Invitations</h2>
          <div className="metadata">{rows.length} sent · {counts.accepted || 0} accepted · {(counts.sent || 0) + (counts.opened || 0)} awaiting · {counts.declined || 0} declined</div>
        </div>
        {isCoordinator && (
          <div className="row gap-sm">
            <button className="btn btn-secondary btn-sm" onClick={remindAll}>Remind non-responders</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setError(''); setAddOpen(true); }}>+ Add invitees</button>
          </div>
        )}
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Applied?</th><th>Reminders</th><th>Sent</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="center muted" style={{ padding: 24 }}>No invitations yet. Add invitees to send their personal links.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>{r.surname ? `${r.surname}, ${r.forenames}` : <span className="muted">—</span>}</td>
                <td><span className={`badge badge-${STATUS_BADGE[r.status] || 'applied'}`}>{r.status}</span></td>
                <td>{r.application_id ? '✓' : '—'}</td>
                <td>{r.reminder_count || 0}</td>
                <td className="metadata nowrap">{r.sent_at ? new Date(r.sent_at).toLocaleDateString('en-GB') : '—'}</td>
                <td className="nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => copyLink(r.token)}>{copied === r.token ? 'Copied!' : 'Copy link'}</button>
                  {isCoordinator && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => revoke(r.id)}>Revoke</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && <AddInvitees eventId={activeId} shirtsOrdered={activeEvent && activeEvent.shirts_ordered} onClose={() => setAddOpen(false)} onDone={(m) => { setAddOpen(false); setMsg(m); load(); }} />}
    </div>
  );
}

function AddInvitees({ eventId, onClose, onDone }) {
  const [bulk, setBulk] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Parse "Name <email>" or "email" lines, comma- or newline-separated.
  function parse() {
    return bulk.split(/[\n,]+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const m = line.match(/^(.*?)<([^>]+)>$/);
      if (m) return { email: m[2].trim(), name: m[1].trim() };
      return { email: line };
    }).filter((x) => /\S+@\S+\.\S+/.test(x.email));
  }

  async function submit() {
    const items = parse();
    if (!items.length) { setError('No valid email addresses found.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api.post(`/admin/events/${eventId}/invitations`, { invitations: items, send });
      const errs = (res.data.errors || []).length;
      onDone(`Created ${res.data.count} invitation(s)${send ? ' and sent emails' : ''}.${errs ? ` ${errs} skipped.` : ''}`);
    } catch (err) { setError(errMessage(err)); } finally { setBusy(false); }
  }

  const preview = parse();
  return (
    <Modal open title="Add invitees" onClose={onClose} width={520}
      footer={<div className="spread"><button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy || !preview.length} onClick={submit}>{busy ? 'Adding…' : `Add ${preview.length || ''} invitee(s)`}</button></div>}>
      <Alert kind="error">{error}</Alert>
      <div className="field">
        <label className="field-label">Email addresses</label>
        <textarea rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'One per line or comma-separated.\nsarah@example.com\nDaniel Okafor <daniel@example.com>'} />
        <div className="field-hint">Accepts plain emails or "Name &lt;email&gt;" format. {preview.length} valid so far.</div>
      </div>
      <label className="check-row"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} /> Send invitation emails now</label>
    </Modal>
  );
}
