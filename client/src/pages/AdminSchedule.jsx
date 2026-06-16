import React, { useEffect, useState, useCallback } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useEvents } from '../components/EventContext';
import { Alert, Spinner, Modal } from '../components/ui';

const ROLE_OPTS = [
  { v: '', l: '—' },
  { v: 'ora', l: 'ORA' },
  { v: 'stage_am', l: 'Stage AM' },
  { v: 'stage_pm', l: 'Stage PM' },
  { v: 'stage_full', l: 'Stage full' },
  { v: 'rest', l: 'Rest' },
];

function groupOf(m) {
  if (m.ora_team === 'A') return 'ORA Team A';
  if (m.ora_team === 'B') return 'ORA Team B';
  if (m.role_preference === 'stage') return 'Stage';
  return 'Unassigned';
}
// Stage is the priority team — listed first.
const GROUP_ORDER = ['Stage', 'ORA Team A', 'ORA Team B', 'Unassigned'];

export default function AdminSchedule() {
  const { activeId } = useEvents();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rosterView, setRosterView] = useState(false);
  const [preview, setPreview] = useState(null);
  const [stagePreview, setStagePreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/events/${activeId}/schedule`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);
  useEffect(() => { load(); }, [load]);

  function cellFor(m, dayId) {
    return (m.assignments || []).find((a) => a.event_day_id === dayId);
  }

  async function setCell(m, dayId, role) {
    const existing = cellFor(m, dayId);
    try {
      if (!role) {
        if (existing) await api.delete(`/admin/schedule/${existing.id}`);
      } else {
        await api.post(`/admin/events/${activeId}/schedule`, {
          application_id: m.id, event_day_id: dayId, role,
          post: existing ? existing.post : null,
          provisional: existing ? existing.provisional : true,
        });
      }
      load();
    } catch (err) { setMsg(errMessage(err)); }
  }

  async function setPost(m, dayId, post) {
    const existing = cellFor(m, dayId);
    if (!existing) return;
    try { await api.put(`/admin/schedule/${existing.id}`, { post }); load(); }
    catch (err) { setMsg(errMessage(err)); }
  }

  async function runAutoAssign() {
    setBusy(true); setMsg('');
    try {
      const res = await api.post(`/admin/events/${activeId}/schedule/auto-assign`, { commit: false });
      setPreview(res.data);
    } catch (err) { setMsg(errMessage(err)); } finally { setBusy(false); }
  }
  async function commitAutoAssign() {
    setBusy(true);
    try {
      await api.post(`/admin/events/${activeId}/schedule/auto-assign`, { commit: true });
      setPreview(null); setMsg('ORA teams assigned (provisional).'); load();
    } catch (err) { setMsg(errMessage(err)); } finally { setBusy(false); }
  }
  async function runStageAssign() {
    setBusy(true); setMsg('');
    try {
      const res = await api.post(`/admin/events/${activeId}/schedule/auto-assign-stage`, { commit: false });
      setStagePreview(res.data);
    } catch (err) { setMsg(errMessage(err)); } finally { setBusy(false); }
  }
  async function commitStageAssign() {
    setBusy(true);
    try {
      await api.post(`/admin/events/${activeId}/schedule/auto-assign-stage`, { commit: true });
      setStagePreview(null); setMsg('Stage shifts assigned (provisional).'); load();
    } catch (err) { setMsg(errMessage(err)); } finally { setBusy(false); }
  }
  async function lockSchedule() {
    if (!window.confirm('Lock the schedule? This marks all assignments final and emails affected marshals.')) return;
    setBusy(true); setMsg('');
    try {
      const res = await api.put(`/admin/events/${activeId}/schedule/lock`, { notify: true });
      setMsg(`Schedule locked. ${res.data.notified} marshal(s) notified.`); load();
    } catch (err) { setMsg(errMessage(err)); } finally { setBusy(false); }
  }

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  const { days, marshals } = data;
  const grouped = {};
  marshals.forEach((m) => { const g = groupOf(m); (grouped[g] = grouped[g] || []).push(m); });

  return (
    <div>
      <div className="spread mb">
        <h2 style={{ margin: 0 }}>Schedule</h2>
        <div className="row gap-sm row-wrap">
          <button className="btn btn-ghost btn-sm" onClick={() => setRosterView((v) => !v)}>{rosterView ? 'Grid view' : 'Daily roster'}</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={runStageAssign}>Auto-assign stage</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={runAutoAssign}>Auto-assign ORA</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={lockSchedule}>Lock schedule</button>
          <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/schedule/export`, 'schedule.csv')}>Export CSV</button>
        </div>
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}

      {rosterView ? <RosterView eventId={activeId} days={days} />
        : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Marshal</th>{days.map((d) => <th key={d.id}>{d.day_name.slice(0, 3)}</th>)}</tr>
              </thead>
              <tbody>
                {GROUP_ORDER.filter((g) => grouped[g]).map((g) => (
                  <React.Fragment key={g}>
                    <tr><td colSpan={days.length + 1} style={{ background: 'var(--color-parchment)', fontWeight: 700 }} className="eyebrow">{g} ({grouped[g].length})</td></tr>
                    {grouped[g].map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap"><strong>{m.surname}</strong>, {m.forenames}{m.ora_experienced ? ' ⚑' : ''}</td>
                        {days.map((d) => {
                          const c = cellFor(m, d.id);
                          return (
                            <td key={d.id} style={{ border: c && c.provisional ? '1.5px dashed var(--color-orange)' : undefined, minWidth: 110 }}>
                              <select value={c ? c.role : ''} onChange={(e) => setCell(m, d.id, e.target.value)} style={{ fontSize: 11, padding: '4px 6px' }}>
                                {ROLE_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                              </select>
                              {c && <input defaultValue={c.post || ''} placeholder="post" onBlur={(e) => setPost(m, d.id, e.target.value)} style={{ fontSize: 11, padding: '3px 5px', marginTop: 3 }} />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '8px 12px' }} className="metadata">⚑ = ORA-experienced (can cover ORA). Dashed cells are provisional.</div>
          </div>
        )}

      {/* Auto-assign preview */}
      <Modal open={!!preview} title="ORA auto-assign preview" onClose={() => setPreview(null)} width={560}
        footer={<div className="spread"><button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={commitAutoAssign}>Commit (provisional)</button></div>}>
        {preview && (
          <div>
            <p>Team A: <strong>{preview.teamA}</strong> · Team B: <strong>{preview.teamB}</strong> (target {preview.target} each). {preview.changes} marshal(s) would be re-assigned.</p>
            {preview.flagged.length > 0 && (
              <div className="card card-accent mb">
                <div className="eyebrow mb">Flagged for manual review ({preview.flagged.length})</div>
                {preview.flagged.map((f) => <div key={f.id} className="metadata">{f.name}: {f.reason}</div>)}
              </div>
            )}
            {preview.diff.length > 0 && (
              <table className="data"><thead><tr><th>Marshal</th><th>From</th><th>To</th></tr></thead>
                <tbody>{preview.diff.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.from || '—'}</td><td><strong>{d.to}</strong></td></tr>)}</tbody>
              </table>
            )}
          </div>
        )}
      </Modal>

      {/* Stage auto-assign preview */}
      <Modal open={!!stagePreview} title="Stage auto-assign preview" onClose={() => setStagePreview(null)} width={520}
        footer={<div className="spread"><button className="btn btn-ghost btn-sm" onClick={() => setStagePreview(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={commitStageAssign}>Commit (provisional)</button></div>}>
        {stagePreview && (
          <div>
            <p>{stagePreview.candidates} stage marshal(s), target {stagePreview.target}/shift. {stagePreview.changes} assignment(s) would change.</p>
            <table className="data mb"><thead><tr><th>Day</th><th>AM</th><th>PM</th></tr></thead>
              <tbody>{stagePreview.perDay.map((d) => (
                <tr key={d.day_name}>
                  <td>{d.day_name}</td>
                  <td style={d.am < stagePreview.target ? { color: 'var(--color-orange)', fontWeight: 700 } : undefined}>{d.am} / {stagePreview.target}</td>
                  <td style={d.pm < stagePreview.target ? { color: 'var(--color-orange)', fontWeight: 700 } : undefined}>{d.pm} / {stagePreview.target}</td>
                </tr>
              ))}</tbody>
            </table>
            {stagePreview.flagged.length > 0 && (
              <div className="card card-accent">
                <div className="eyebrow mb">Flagged for manual review ({stagePreview.flagged.length})</div>
                {stagePreview.flagged.map((f) => <div key={f.id} className="metadata">{f.name}: {f.reason}</div>)}
              </div>
            )}
            <div className="metadata mt">Locked (finalised) cells are left untouched. All new assignments are provisional.</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function RosterView({ eventId, days }) {
  const [byDay, setByDay] = useState({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/admin/events/${eventId}/reports/daily-roster`)
      .then((res) => setByDay(res.data.byDay)).catch(() => {}).finally(() => setLoading(false));
  }, [eventId]);
  if (loading) return <Spinner />;
  const dayNames = days.map((d) => d.day_name);
  return (
    <div className="stack">
      {dayNames.map((dn) => (
        <div key={dn} className="card">
          <h3>{dn}</h3>
          {!byDay[dn] || byDay[dn].length === 0 ? <span className="muted">No assignments.</span> : (
            <table className="data">
              <thead><tr><th>Name</th><th>Team</th><th>Role</th><th>Post</th><th>Mobile</th><th>Accom.</th></tr></thead>
              <tbody>
                {byDay[dn].map((r, i) => (
                  <tr key={i}><td>{r.surname}, {r.forenames}</td><td>{r.ora_team || '—'}</td><td>{r.role}{r.provisional ? ' (prov)' : ''}</td><td>{r.post || '—'}</td><td>{r.phone_mobile}</td><td style={{ textTransform: 'capitalize' }}>{r.accommodation_type || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
