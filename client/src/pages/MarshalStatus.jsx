import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api, { errMessage } from '../api';
import PublicLayout from '../components/PublicLayout';
import { Alert, Money, Spinner, StatusBadge } from '../components/ui';

const STATUS_EXPLAIN = {
  applied: "We've got your application. Jon will review it soon.",
  licence_pending: "We're still waiting for your MSUK licence before we can confirm your place.",
  confirmed: "You're confirmed as part of the team. See you there!",
  cancelled: 'This application has been cancelled.',
  no_show: 'Marked as a no-show for this event.',
};

const DEPARTURE_LABELS = {
  sunday_before_prizes: 'Sunday before prizes',
  sunday_after_prizes: 'Sunday after prizes',
  sunday_after_barbie: 'Sunday after barbie',
  monday_morning: 'Monday morning',
};
const ROLE_LABELS = { ora: 'ORA', stage: 'Rally Stage', flexible: 'Flexible' };
const ASSIGN_LABELS = { ora: 'ORA (all day)', stage_am: 'Stage AM', stage_pm: 'Stage PM', stage_full: 'Stage (full day)', rest: 'Rest day' };

export default function MarshalStatus() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef(null);

  function load() {
    return api.get(`/status/${token}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(errMessage(err, 'This link is not valid.')))
      .finally(() => setLoading(false));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [token]);

  async function uploadLicence(file) {
    if (!file) return;
    setUploading(true); setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('licence', file);
      await api.post(`/apply/${token}/licence`, fd);
      setUploadMsg('Licence uploaded — thanks!');
      await load();
    } catch (err) {
      setUploadMsg(errMessage(err, 'Upload failed. Try a photo (JPG/PNG) under 10MB.'));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <PublicLayout><Spinner /></PublicLayout>;
  if (error) return <PublicLayout><div className="card"><Alert kind="error">{error}</Alert></div></PublicLayout>;

  if (!data.has_application) {
    return (
      <PublicLayout>
        <div className="card">
          <h2>{data.event.name}</h2>
          <p>We don't have an application from you yet.</p>
          <a className="btn btn-primary" href={`/apply/${token}`}>Complete your application</a>
        </div>
      </PublicLayout>
    );
  }

  const { application: a, marshal, event, shirts, schedule } = data;
  const licenceOutstanding = !marshal.licence_uploaded || !marshal.licence_verified;
  const paymentDue = a.status === 'confirmed' && !a.payment_received && a.total_due > 0;

  return (
    <PublicLayout>
      <div className="mb">
        <h1 style={{ marginBottom: 2 }}>{event.name}</h1>
        <div className="metadata">{event.dates}</div>
      </div>

      <div className="card mb">
        <div className="spread">
          <div>
            <div className="eyebrow">Hi {marshal.name}, your status is</div>
            <div style={{ marginTop: 6 }}><StatusBadge status={a.status} /></div>
          </div>
          {a.ora_team && <div className="center"><div className="eyebrow">ORA Team</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-navy)' }}>{a.ora_team}</div></div>}
        </div>
        <p className="mt" style={{ marginBottom: 0 }}>{STATUS_EXPLAIN[a.status]}</p>
      </div>

      {/* Outstanding actions */}
      {licenceOutstanding && (
        <div className="card card-accent mb">
          <h3>Upload your licence</h3>
          <p style={{ marginTop: 0 }}>{marshal.licence_uploaded
            ? "We've got your licence and Jon will verify it shortly."
            : 'We still need your MSUK licence before we can confirm your place. No licence = no GFoS.'}</p>
          {!marshal.licence_uploaded && (
            <>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => uploadLicence(e.target.files[0])} />
              <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>
                {uploading ? 'Uploading…' : 'Upload licence'}
              </button>
            </>
          )}
          {uploadMsg && <div className="mt"><Alert kind={uploadMsg.includes('thanks') ? 'success' : 'error'}>{uploadMsg}</Alert></div>}
        </div>
      )}

      {paymentDue && (
        <div className="card card-accent mb">
          <h3>Payment of <Money value={a.total_due} /> is due</h3>
          <p style={{ marginTop: 0 }}>Please pay by BACS:</p>
          <div className="metadata">
            Account name: {event.bacs_account_name || '—'}<br />
            Sort code: {event.bacs_sort_code || '—'}<br />
            Account number: {event.bacs_account_number || '—'}<br />
            Reference: GFoS/{marshal.full_name.split(' ').slice(-1)[0]}
          </div>
        </div>
      )}

      {/* Schedule */}
      {schedule && schedule.length > 0 && (
        <div className="card mb">
          <h3>Your schedule</h3>
          <table className="data">
            <thead><tr><th>Day</th><th>Role</th><th>Post</th><th /></tr></thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={i}>
                  <td>{s.day_name}</td>
                  <td>{ASSIGN_LABELS[s.role] || s.role}</td>
                  <td>{s.post || '—'}</td>
                  <td>{s.provisional && <span className="badge badge-provisional">Provisional</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="metadata mt">Your schedule may change — you'll be notified by email if it does.</div>
        </div>
      )}

      {/* Submitted details summary */}
      <div className="card">
        <h3>What you submitted</h3>
        <table className="data">
          <tbody>
            <tr><td className="muted">Role preference</td><td>{ROLE_LABELS[a.role_preference] || '—'}</td></tr>
            <tr><td className="muted">Marshalling days</td><td>{(a.marshalling_days || []).join(', ') || '—'}</td></tr>
            <tr><td className="muted">Arrival</td><td>{a.arrival_day || '—'}</td></tr>
            <tr><td className="muted">Departure</td><td>{DEPARTURE_LABELS[a.departure_option] || '—'}</td></tr>
            <tr><td className="muted">Accommodation</td><td style={{ textTransform: 'capitalize' }}>{a.accommodation_type || '—'}</td></tr>
            <tr><td className="muted">Sunday barbie</td><td>{a.barbie_attending ? 'Yes' : 'No'}</td></tr>
            <tr><td className="muted">Shirts</td><td>{shirts.length ? shirts.map((s) => `${s.quantity}× ${s.size}`).join(', ') : '—'}</td></tr>
            <tr><td className="muted">Total due</td><td><Money value={a.total_due} /> {a.payment_received ? <span className="badge badge-paid">Paid</span> : null}</td></tr>
          </tbody>
        </table>
      </div>
    </PublicLayout>
  );
}
