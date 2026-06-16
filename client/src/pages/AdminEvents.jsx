import React, { useState } from 'react';
import api, { errMessage } from '../api';
import { useAuth } from '../auth';
import { useEvents } from '../components/EventContext';
import { Alert, Modal, Spinner } from '../components/ui';

const STATUSES = ['draft', 'inviting', 'closed', 'complete'];

const BLANK = {
  name: '', year: new Date().getFullYear(), start_date: '', end_date: '',
  location: '', description: '', status: 'draft',
  ora_team_size_target: 20, stage_shift_target: 10, stage_shifts_per_day: 2, stage_changeover_time: '12:30',
  stage_direction: 'anticlockwise', shirt_price: '15.00', barbie_price: '15.00',
  shirts_ordered: false, bacs_account_name: '', bacs_sort_code: '', bacs_account_number: '',
};

function EventForm({ initial, onSave, onCancel, busy, error }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  return (
    <div>
      <Alert kind="error">{error}</Alert>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 200 }}><div className="field"><label className="field-label">Name<span className="req">*</span></label><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="GFoS 2026" /></div></div>
        <div style={{ width: 110 }}><div className="field"><label className="field-label">Year<span className="req">*</span></label><input type="number" value={f.year} onChange={(e) => set('year', e.target.value)} /></div></div>
      </div>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 150 }}><div className="field"><label className="field-label">Start date<span className="req">*</span></label><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></div></div>
        <div className="col" style={{ minWidth: 150 }}><div className="field"><label className="field-label">End date<span className="req">*</span></label><input type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></div></div>
      </div>
      <div className="field"><label className="field-label">Location</label><input value={f.location || ''} onChange={(e) => set('location', e.target.value)} /></div>
      <div className="field"><label className="field-label">Description</label><textarea value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 130 }}><div className="field"><label className="field-label">Status</label><select value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div></div>
        <div className="col" style={{ minWidth: 130 }}><div className="field"><label className="field-label">Stage target / shift</label><input type="number" value={f.stage_shift_target} onChange={(e) => set('stage_shift_target', e.target.value)} /></div></div>
        <div className="col" style={{ minWidth: 130 }}><div className="field"><label className="field-label">ORA team target</label><input type="number" value={f.ora_team_size_target} onChange={(e) => set('ora_team_size_target', e.target.value)} /></div></div>
      </div>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 120 }}><div className="field"><label className="field-label">Stage changeover</label><input type="time" value={String(f.stage_changeover_time || '').slice(0, 5)} onChange={(e) => set('stage_changeover_time', e.target.value)} /></div></div>
        <div className="col" style={{ minWidth: 140 }}><div className="field"><label className="field-label">Stage direction</label><select value={f.stage_direction} onChange={(e) => set('stage_direction', e.target.value)}><option value="anticlockwise">Anticlockwise</option><option value="clockwise">Clockwise</option></select></div></div>
      </div>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 110 }}><div className="field"><label className="field-label">Shirt price (£)</label><input type="number" step="0.01" value={f.shirt_price} onChange={(e) => set('shirt_price', e.target.value)} /></div></div>
        <div className="col" style={{ minWidth: 110 }}><div className="field"><label className="field-label">Barbie price (£)</label><input type="number" step="0.01" value={f.barbie_price} onChange={(e) => set('barbie_price', e.target.value)} /></div></div>
      </div>
      <div className="card card-accent mb">
        <label className="check-row" style={{ margin: 0 }}><input type="checkbox" checked={!!f.shirts_ordered} onChange={(e) => set('shirts_ordered', e.target.checked)} /> Shirts have been ordered (unlocks payment request emails)</label>
      </div>
      <div className="eyebrow mb">BACS payment details (shown to marshals)</div>
      <div className="field"><label className="field-label">Account name</label><input value={f.bacs_account_name || ''} onChange={(e) => set('bacs_account_name', e.target.value)} /></div>
      <div className="row row-wrap">
        <div className="col" style={{ minWidth: 120 }}><div className="field"><label className="field-label">Sort code</label><input value={f.bacs_sort_code || ''} onChange={(e) => set('bacs_sort_code', e.target.value)} /></div></div>
        <div className="col" style={{ minWidth: 140 }}><div className="field"><label className="field-label">Account number</label><input value={f.bacs_account_number || ''} onChange={(e) => set('bacs_account_number', e.target.value)} /></div></div>
      </div>
      <div className="spread mt">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !f.name || !f.year || !f.start_date || !f.end_date} onClick={() => onSave(f)}>{busy ? 'Saving…' : 'Save event'}</button>
      </div>
    </div>
  );
}

export default function AdminEvents() {
  const { events, loading, refreshEvents, selectEvent, activeId } = useEvents();
  const { isCoordinator } = useAuth();
  const [modal, setModal] = useState(null); // 'new' | event object
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(form) {
    setBusy(true); setError('');
    const payload = {
      ...form,
      year: parseInt(form.year, 10),
      ora_team_size_target: parseInt(form.ora_team_size_target, 10) || 20,
      stage_shift_target: parseInt(form.stage_shift_target, 10) || 10,
      stage_shifts_per_day: parseInt(form.stage_shifts_per_day, 10) || 2,
      shirt_price: form.shirt_price, barbie_price: form.barbie_price,
    };
    try {
      if (modal === 'new') {
        const res = await api.post('/admin/events', payload);
        await refreshEvents();
        selectEvent(res.data.id);
      } else {
        await api.put(`/admin/events/${modal.id}`, payload);
        await refreshEvents();
      }
      setModal(null);
    } catch (err) { setError(errMessage(err)); } finally { setBusy(false); }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="spread mb">
        <h2 style={{ margin: 0 }}>Events</h2>
        {isCoordinator && <button className="btn btn-primary btn-sm" onClick={() => { setError(''); setModal('new'); }}>+ New event</button>}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Name</th><th>Dates</th><th>Status</th><th>ORA target</th><th>Shirts ordered</th><th /></tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={6} className="center muted" style={{ padding: 24 }}>No events yet. Create one to get started.</td></tr>}
            {events.map((e) => (
              <tr key={e.id} className={e.id === activeId ? '' : ''}>
                <td><strong>{e.name}</strong>{e.id === activeId && <span className="badge badge-confirmed" style={{ marginLeft: 8 }}>Active</span>}</td>
                <td className="metadata nowrap">{e.start_date ? new Date(e.start_date).toLocaleDateString('en-GB') : ''} – {e.end_date ? new Date(e.end_date).toLocaleDateString('en-GB') : ''}</td>
                <td><span className="badge badge-applied">{e.status}</span></td>
                <td>{e.ora_team_size_target}</td>
                <td>{e.shirts_ordered ? '✓' : '—'}</td>
                <td className="nowrap">
                  <button className="btn btn-ghost btn-sm" onClick={() => selectEvent(e.id)}>Select</button>
                  {isCoordinator && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { setError(''); setModal(e); }}>Edit</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} title={modal === 'new' ? 'New event' : 'Edit event'} onClose={() => setModal(null)} width={560}>
        {modal && <EventForm initial={modal === 'new' ? BLANK : { ...BLANK, ...modal, start_date: (modal.start_date || '').slice(0, 10), end_date: (modal.end_date || '').slice(0, 10) }} onSave={save} onCancel={() => setModal(null)} busy={busy} error={error} />}
      </Modal>
    </div>
  );
}
