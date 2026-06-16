import React, { useEffect, useState, useCallback } from 'react';
import api, { errMessage, downloadFile } from '../api';
import { useAuth } from '../auth';
import { useEvents } from '../components/EventContext';
import { Alert, Money, Spinner } from '../components/ui';

export default function AdminPayments() {
  const { activeId, activeEvent } = useEvents();
  const { isCoordinator } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    if (!activeId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/admin/events/${activeId}/payments`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMessage(err)))
      .finally(() => setLoading(false));
  }, [activeId]);
  useEffect(() => { load(); }, [load]);

  async function togglePaid(row, received) {
    try {
      await api.put(`/admin/payments/${row.id}`, { payment_received: received, payment_received_date: received ? new Date().toISOString().slice(0, 10) : null, payment_method: received ? (row.payment_method || 'BACS') : null });
      load();
    } catch (err) { setMsg(errMessage(err)); }
  }
  async function setMethod(row, method) {
    try { await api.put(`/admin/payments/${row.id}`, { payment_received: true, payment_received_date: row.payment_received_date || new Date().toISOString().slice(0, 10), payment_method: method }); load(); }
    catch (err) { setMsg(errMessage(err)); }
  }
  async function requestAll() {
    setMsg('');
    try {
      const res = await api.post(`/admin/events/${activeId}/comms/payment-request`, { recipients: 'unpaid' });
      setMsg(`Payment requests sent to ${res.data.sent}.`);
    } catch (err) { setMsg(errMessage(err)); }
  }

  if (!activeId) return <div className="card"><h2>No event selected</h2></div>;
  if (loading) return <Spinner />;
  if (error) return <Alert kind="error">{error}</Alert>;

  const { rows, totals } = data;
  return (
    <div>
      <div className="spread mb">
        <h2 style={{ margin: 0 }}>Payments</h2>
        <div className="row gap-sm">
          {isCoordinator && <button className="btn btn-secondary btn-sm" disabled={!activeEvent || !activeEvent.shirts_ordered} title={activeEvent && !activeEvent.shirts_ordered ? 'Blocked until shirts ordered' : ''} onClick={requestAll}>Request payment (unpaid)</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => downloadFile(`/admin/events/${activeId}/payments/export`, 'payments.csv')}>Export CSV</button>
        </div>
      </div>

      {msg && <Alert kind="info">{msg}</Alert>}
      {activeEvent && !activeEvent.shirts_ordered && <Alert kind="warn">Shirts not marked as ordered yet — payment request emails are blocked.</Alert>}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data">
          <thead><tr><th>Name</th><th>Total due</th><th>Shirts</th><th>Add-on</th><th>Paid?</th><th>Date</th><th>Method</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="center muted" style={{ padding: 24 }}>No confirmed marshals yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.surname}</strong>, {r.forenames}</td>
                <td><Money value={r.total_due} /></td>
                <td><Money value={r.shirt_total} /></td>
                <td><Money value={r.barbie_total} /></td>
                <td>{isCoordinator ? <input type="checkbox" checked={r.payment_received} onChange={(e) => togglePaid(r, e.target.checked)} /> : (r.payment_received ? '✓' : '—')}</td>
                <td className="metadata">{r.payment_received_date ? new Date(r.payment_received_date).toLocaleDateString('en-GB') : '—'}</td>
                <td>
                  {r.payment_received && isCoordinator ? (
                    <select value={r.payment_method || 'BACS'} onChange={(e) => setMethod(r, e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}><option>BACS</option><option>cash</option><option>other</option></select>
                  ) : (r.payment_method || '—')}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Totals</td><td><Money value={totals.due} /></td><td><Money value={totals.shirts} /></td><td><Money value={totals.barbie} /></td>
                <td colSpan={3} className="metadata">Received: <Money value={totals.received} /> · Outstanding: <Money value={totals.due - totals.received} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
