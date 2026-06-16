import React, { useEffect, useState } from 'react';
import api, { errMessage } from '../api';
import { useEvents } from '../components/EventContext';
import { Alert, Spinner } from '../components/ui';

const TEMPLATES = [
  { v: 'invitation', l: 'Invitation' },
  { v: 'reminder', l: 'Reminder' },
  { v: 'confirmation', l: 'Confirmation' },
  { v: 'schedule_update', l: 'Schedule update' },
  { v: 'payment_request', l: 'Payment request' },
  { v: 'licence_nudge', l: 'Licence nudge' },
  { v: 'custom', l: 'Custom' },
];
const RECIPIENTS = [
  { v: 'all', l: 'All invited' },
  { v: 'non_responders', l: 'Non-responders' },
  { v: 'confirmed', l: 'Confirmed' },
  { v: 'unpaid', l: 'Unpaid (confirmed)' },
  { v: 'licence_missing', l: 'Licence outstanding' },
];

export default function AdminComms() {
  const { activeId, activeEvent } = useEvents();
  const [tab, setTab] = useState('send');
  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  return (
    <div>
      <h2>Communications</h2>
      <div className="row gap-sm mb">
        <button className={`btn btn-sm ${tab === 'send' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTab('send')}>Send</button>
        <button className={`btn btn-sm ${tab === 'log' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTab('log')}>Log</button>
      </div>
      {tab === 'send' ? <SendTab eventId={activeId} event={activeEvent} /> : <LogTab eventId={activeId} />}
    </div>
  );
}

function SendTab({ eventId, event }) {
  const [template, setTemplate] = useState('reminder');
  const [recipients, setRecipients] = useState('non_responders');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Resolve recipient count for the confirmation dialog (approximation via comms send dry isn't available;
  // we fetch applications/invitations counts instead).
  useEffect(() => {
    setCount(null);
    api.get(`/admin/events/${eventId}/invitations`).then((res) => {
      const invs = res.data;
      let n = 0;
      if (recipients === 'all') n = invs.length;
      else if (recipients === 'non_responders') n = invs.filter((i) => ['sent', 'opened'].includes(i.status)).length;
      else if (recipients === 'confirmed') n = invs.filter((i) => i.status === 'accepted').length;
      else n = invs.filter((i) => i.status === 'accepted').length;
      setCount(n);
    }).catch(() => {});
  }, [recipients, eventId]);

  async function send() {
    if (!window.confirm(`Send "${template}" email to the "${recipients}" group?`)) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      const res = await api.post(`/admin/events/${eventId}/comms/send`, { template, recipients, subject, body });
      setMsg(`Sent ${res.data.sent} of ${res.data.total}.${res.data.errors && res.data.errors.length ? ` ${res.data.errors.length} failed.` : ''}`);
    } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); }
  }

  const isCustom = template === 'custom';
  const previewSubject = isCustom ? subject : `[${TEMPLATES.find((t) => t.v === template).l}] — generated from template`;

  return (
    <div className="row row-wrap">
      <div className="card" style={{ flex: '1 1 320px' }}>
        {msg && <Alert kind="success">{msg}</Alert>}
        {err && <Alert kind="error">{err}</Alert>}
        <div className="field">
          <label className="field-label">Template</label>
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>{TEMPLATES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
        </div>
        <div className="field">
          <label className="field-label">Recipients</label>
          <select value={recipients} onChange={(e) => setRecipients(e.target.value)}>{RECIPIENTS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
          <div className="field-hint">{count != null ? `≈ ${count} recipient(s)` : 'Counting…'}</div>
        </div>
        {isCustom && (
          <>
            <div className="field"><label className="field-label">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            <div className="field"><label className="field-label">Body</label><textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /><div className="field-hint">Merge: {'{{marshal_name}} {{event_name}} {{apply_url}} {{status_url}}'}</div></div>
          </>
        )}
        {template === 'payment_request' && event && !event.shirts_ordered && <Alert kind="warn">Payment requests are blocked until shirts are ordered (set on the event).</Alert>}
        <button className="btn btn-primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>

      <div className="card" style={{ flex: '1 1 320px' }}>
        <div className="eyebrow mb">Preview</div>
        <div className="metadata" style={{ marginBottom: 8 }}><strong>Subject:</strong> {previewSubject}</div>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-slate)', margin: 0 }}>
          {isCustom ? (body || 'Type a message to preview…')
            : 'This template is rendered per recipient on the server with their own merge fields (name, dates, personal links).'}
        </pre>
      </div>
    </div>
  );
}

function LogTab({ eventId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  useEffect(() => {
    setLoading(true);
    api.get(`/admin/events/${eventId}/comms`, { params: type ? { type } : {} })
      .then((res) => setRows(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, [eventId, type]);

  return (
    <div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label className="field-label">Filter by type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All</option>
          {['invitation', 'reminder', 'confirmation', 'schedule_update', 'payment_request', 'licence_nudge', 'general'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data">
            <thead><tr><th>Date/time</th><th>Type</th><th>To</th><th>Subject</th><th>Sent by</th><th>Status</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="center muted" style={{ padding: 24 }}>No emails logged yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="metadata nowrap">{new Date(r.sent_at).toLocaleString('en-GB')}</td>
                  <td>{r.type}</td>
                  <td className="metadata">{r.sent_to}</td>
                  <td>{r.subject}</td>
                  <td className="metadata">{r.sent_by_name || 'System'}</td>
                  <td>{r.error ? <span className="badge badge-cancelled" title={r.error}>Failed</span> : <span className="badge badge-confirmed">Sent</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
