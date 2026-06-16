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
        <button className={`btn btn-sm ${tab === 'templates' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTab('templates')}>Templates</button>
        <button className={`btn btn-sm ${tab === 'log' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setTab('log')}>Log</button>
      </div>
      {tab === 'send' && <SendTab eventId={activeId} event={activeEvent} />}
      {tab === 'templates' && <TemplatesTab eventId={activeId} event={activeEvent} />}
      {tab === 'log' && <LogTab eventId={activeId} />}
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
            : 'This template is rendered per recipient with their own merge fields. Edit its wording in the Templates tab.'}
        </pre>
      </div>
    </div>
  );
}

const MERGE_FIELDS = ['marshal_name', 'marshal_full_name', 'marshal_surname', 'event_name', 'event_dates', 'event_year', 'organisation_name', 'coordinator_name', 'signoff', 'apply_url', 'status_url'];
const PAYMENT_FIELDS = ['total_due', 'shirt_total', 'addon_line', 'payment_ref', 'bacs_account_name', 'bacs_sort_code', 'bacs_account_number'];

function renderPreview(str, sample) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (sample[k] != null ? sample[k] : ''));
}

function TemplatesTab({ eventId, event }) {
  const [scope, setScope] = useState('global'); // 'global' | 'event'
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState(null); // selected type
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const eventScopeId = scope === 'event' ? eventId : null;

  function load() {
    setLoading(true);
    api.get('/admin/email-templates', { params: eventScopeId ? { event_id: eventScopeId } : {} })
      .then((res) => {
        setItems(res.data);
        const current = res.data.find((t) => t.type === sel) || res.data[0];
        if (current) { setSel(current.type); setSubject(current.subject); setBody(current.body); }
      })
      .catch((err) => setMsg(errMessage(err)))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [scope, eventId]);

  function pick(t) {
    setSel(t.type); setSubject(t.subject); setBody(t.body); setMsg('');
  }

  async function save() {
    setMsg('');
    try {
      await api.put('/admin/email-templates', { type: sel, event_id: eventScopeId, subject, body });
      setMsg('Saved.'); load();
    } catch (err) { setMsg(errMessage(err)); }
  }
  async function reset() {
    if (!window.confirm('Reset this template to the inherited/default text?')) return;
    setMsg('');
    try {
      await api.delete(`/admin/email-templates/${sel}`, { params: eventScopeId ? { event_id: eventScopeId } : {} });
      setMsg('Reset.'); load();
    } catch (err) { setMsg(errMessage(err)); }
  }

  const selItem = items.find((t) => t.type === sel);
  const sample = {
    marshal_name: 'Sam', marshal_full_name: 'Sam Marshal', marshal_surname: 'Marshal',
    event_name: event ? event.name : 'Your Event', event_dates: 'Thursday 9th to Sunday 12th July 2026',
    event_year: event ? event.year : 2026,
    organisation_name: (event && event.organisation_name) || '',
    coordinator_name: 'Jon',
    signoff: event && event.organisation_name ? `Jon\n${event.organisation_name}` : 'Jon',
    licence_year: event && event.year ? `${event.year} ` : '',
    apply_url: 'https://marshpoint.co.uk/apply/EXAMPLE', status_url: 'https://marshpoint.co.uk/status/EXAMPLE',
    total_due: '45.00', shirt_total: '30.00',
    addon_line: event && event.addon_enabled ? `\n  - ${event.addon_label || 'Add-on'}: £15.00` : '',
    payment_ref: `${(event && event.name ? event.name : 'EVENT').replace(/[^A-Za-z0-9]/g, '')}/Marshal`,
    bacs_account_name: (event && event.bacs_account_name) || '[ACCOUNT NAME]',
    bacs_sort_code: (event && event.bacs_sort_code) || '[SORT CODE]',
    bacs_account_number: (event && event.bacs_account_number) || '[ACCOUNT NUMBER]',
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="card mb">
        <div className="spread">
          <div className="row gap-sm">
            <button className={`btn btn-sm ${scope === 'global' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setScope('global')}>Global</button>
            <button className={`btn btn-sm ${scope === 'event' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setScope('event')}>This event only</button>
          </div>
          <span className="metadata">{scope === 'global' ? 'Defaults used by every event' : `Overrides for ${event ? event.name : 'this event'} (falls back to global)`}</span>
        </div>
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}

      <div className="row row-wrap">
        <div className="card" style={{ flex: '0 0 200px' }}>
          {items.map((t) => (
            <button key={t.type} className="mp-navlink" onClick={() => pick(t)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: sel === t.type ? 'var(--color-border-light)' : 'transparent', color: 'var(--color-navy)', border: 'none', borderLeft: sel === t.type ? '3px solid var(--color-orange)' : '3px solid transparent', cursor: 'pointer', padding: '8px 12px' }}>
              {t.label}{t.has_override ? ' ●' : ''}
            </button>
          ))}
          <div className="field-hint" style={{ padding: '8px 12px' }}>● = customised at this scope</div>
        </div>

        <div className="card" style={{ flex: '1 1 280px' }}>
          {selItem && (
            <>
              <div className="spread mb">
                <strong>{selItem.label}</strong>
                {selItem.has_override
                  ? <span className="badge badge-pending">Customised</span>
                  : <span className="metadata">Inherits {selItem.inherits}</span>}
              </div>
              <div className="field"><label className="field-label">Subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
              <div className="field"><label className="field-label">Body</label><textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} /></div>
              <div className="row gap-sm">
                <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
                {selItem.has_override && <button className="btn btn-ghost btn-sm" onClick={reset}>Reset to {selItem.inherits}</button>}
              </div>
              <div className="field-hint mt">
                Merge fields: {MERGE_FIELDS.map((f) => `{{${f}}}`).join(' ')}
                {sel === 'payment_request' && <> · payment: {PAYMENT_FIELDS.map((f) => `{{${f}}}`).join(' ')}</>}
                {sel === 'licence_nudge' && <> · {'{{licence_year}}'}</>}
              </div>
            </>
          )}
        </div>

        <div className="card" style={{ flex: '1 1 280px' }}>
          <div className="eyebrow mb">Preview (sample data)</div>
          <div className="metadata" style={{ marginBottom: 8 }}><strong>Subject:</strong> {renderPreview(subject, sample)}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--color-slate)', margin: 0 }}>{renderPreview(body, sample)}</pre>
        </div>
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
