import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { errMessage } from '../api';
import PublicLayout from '../components/PublicLayout';
import { Alert, Money, Spinner } from '../components/ui';

const INTERESTS = ['Race', 'Rally', 'Autotest/Autosolo', 'Marshalling', 'Karting', 'Socials', 'Other'];
const SHIRT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const ARRIVAL_DAYS = ['Wednesday', 'Thursday', 'Friday'];
const MARSHAL_DAYS = ['Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEPARTURE = [
  { v: 'sunday_before_prizes', l: 'Sunday before prizes (before 6pm)' },
  { v: 'sunday_after_prizes', l: 'Sunday after prizes' },
  { v: 'sunday_after_barbie', l: 'Sunday after barbie' },
  { v: 'monday_morning', l: 'Monday morning' },
];

const EMPTY = {
  surname: '', forenames: '', preferred_name: '',
  address_line1: '', address_line2: '', address_town: '', address_postcode: '',
  phone_mobile: '', phone_home: '', phone_work: '',
  motorsport_interests: [],
  msuk_licence_number: '', msuk_licence_grades: '', wdmc_member_number: '',
  gfos_years_attended: 0, ora_experienced: false,
  arrival_day: '', arrival_time_approx: '',
  marshalling_days: [], role_preference: '', stage_shift_preference: '',
  unavailable_notes: '',
  departure_option: '', barbie_attending: null,
  accommodation_type: '', accommodation_size_l: '', accommodation_size_w: '',
  sharing_with_names: '', travelling_with_names: '',
  shirts: [{ size: 'M', quantity: 1 }],
  agree_constitution: false, agree_contact: false, signature_name: '',
};

function Section({ n, title, children }) {
  return (
    <div className="card mb">
      <div className="eyebrow" style={{ marginBottom: 4 }}>Section {n}</div>
      <h3 style={{ marginBottom: 14 }}>{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, required, hint, error, children }) {
  return (
    <div className="field">
      <label className="field-label">{label}{required && <span className="req">*</span>}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export default function MarshalForm() {
  const { token } = useParams();
  const draftKey = `mp_draft_${token}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [event, setEvent] = useState(null);
  const [prefillEmail, setPrefillEmail] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [licenceFile, setLicenceFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const [declined, setDeclined] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Load invitation + restore any saved draft.
  useEffect(() => {
    api.get(`/apply/${token}`)
      .then((res) => {
        setEvent(res.data.event);
        setPrefillEmail(res.data.prefill.email);
        const draft = localStorage.getItem(draftKey);
        if (draft) {
          try { setForm({ ...EMPTY, ...JSON.parse(draft) }); } catch { /* ignore */ }
        } else {
          const p = res.data.prefill;
          setForm((f) => ({
            ...f,
            surname: p.surname || '', forenames: p.forenames || '', preferred_name: p.preferred_name || '',
            phone_mobile: p.phone_mobile || '', msuk_licence_number: p.msuk_licence_number || '',
            msuk_licence_grades: p.msuk_licence_grades || '', wdmc_member_number: p.wdmc_member_number || '',
            motorsport_interests: p.motorsport_interests || [], gfos_years_attended: p.gfos_years_attended || 0,
          }));
        }
      })
      .catch((err) => setLoadError(errMessage(err, 'This invitation link is not valid.')))
      .finally(() => setLoading(false));
  }, [token, draftKey]);

  // Autosave draft every 30s.
  useEffect(() => {
    if (loading || result) return undefined;
    const id = setInterval(() => {
      localStorage.setItem(draftKey, JSON.stringify(form));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }, 30000);
    return () => clearInterval(id);
  }, [form, loading, result, draftKey]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function toggleArray(field, value) {
    setForm((f) => {
      const arr = f[field] || [];
      return { ...f, [field]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value] };
    });
  }

  const showStageShift = form.role_preference === 'stage' || form.role_preference === 'flexible';
  const showOraExp = form.role_preference === 'stage' || form.role_preference === 'flexible';
  const showAccomSize = form.accommodation_type === 'caravan' || form.accommodation_type === 'campervan';

  const shirtPrice = event ? event.shirt_price : 15;
  const barbiePrice = event ? event.barbie_price : 15;
  const shirtQty = form.shirts.reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0);
  const shirtTotal = shirtQty * shirtPrice;
  const barbieTotal = form.barbie_attending ? barbiePrice : 0;
  const total = shirtTotal + barbieTotal;

  function updateShirt(i, key, value) {
    setForm((f) => {
      const shirts = f.shirts.map((s, idx) => (idx === i ? { ...s, [key]: value } : s));
      return { ...f, shirts };
    });
  }
  function addShirt() { setForm((f) => ({ ...f, shirts: [...f.shirts, { size: 'M', quantity: 1 }] })); }
  function removeShirt(i) { setForm((f) => ({ ...f, shirts: f.shirts.filter((_, idx) => idx !== i) })); }

  function validate() {
    const e = {};
    const req = ['surname', 'forenames', 'address_line1', 'address_town', 'address_postcode',
      'phone_mobile', 'msuk_licence_number', 'msuk_licence_grades', 'wdmc_member_number',
      'arrival_day', 'role_preference', 'departure_option', 'accommodation_type', 'signature_name'];
    req.forEach((f) => { if (!form[f] && form[f] !== 0) e[f] = 'Required'; });
    if (!form.marshalling_days.length) e.marshalling_days = 'Pick at least one day';
    if (showStageShift && !form.stage_shift_preference) e.stage_shift_preference = 'Required';
    if (form.barbie_attending === null) e.barbie_attending = 'Required';
    if (showAccomSize) {
      if (!form.accommodation_size_l) e.accommodation_size_l = 'Required';
      if (!form.accommodation_size_w) e.accommodation_size_w = 'Required';
    }
    if (!form.shirts.length || shirtQty < 1) e.shirts = 'At least one shirt is required';
    if (!form.agree_constitution) e.agree_constitution = 'Please tick to continue';
    if (!form.agree_contact) e.agree_contact = 'Please tick to continue';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) {
      setSubmitError('Please fix the highlighted fields and try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        gfos_years_attended: parseInt(form.gfos_years_attended, 10) || 0,
        accommodation_size_l: form.accommodation_size_l || null,
        accommodation_size_w: form.accommodation_size_w || null,
        shirts: form.shirts.filter((s) => s.size && s.quantity),
      };
      const res = await api.post(`/apply/${token}`, payload);
      // Upload licence if one was attached.
      if (licenceFile) {
        const fd = new FormData();
        fd.append('licence', licenceFile);
        try { await api.post(`/apply/${token}/licence`, fd); res.data.licence_outstanding = false; } catch { /* surfaced on status page */ }
      }
      localStorage.removeItem(draftKey);
      setResult(res.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(errMessage(err, 'Submission failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function decline() {
    if (!window.confirm("Let Jon know you can't make it this year?")) return;
    try {
      await api.post(`/apply/${token}/decline`);
      localStorage.removeItem(draftKey);
      setDeclined(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(errMessage(err, 'Could not record your response.'));
    }
  }

  if (loading) return <PublicLayout><Spinner /></PublicLayout>;
  if (loadError) return <PublicLayout><div className="card"><Alert kind="error">{loadError}</Alert></div></PublicLayout>;

  if (declined) {
    return (
      <PublicLayout>
        <div className="card">
          <h2>Thanks for letting us know</h2>
          <p>No problem at all — we've told Jon you can't make {event.name} this year. Hope to see you next time!</p>
        </div>
      </PublicLayout>
    );
  }

  if (result) {
    return (
      <PublicLayout>
        <div className="card">
          <h2>You're in 🎉</h2>
          <p>Thanks for applying to marshal at <strong>{event.name}</strong>. Jon will be in touch once the schedule is sorted.</p>
          <div className="card card-accent mt mb">
            <div className="eyebrow">What you'll owe (later)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-navy)' }}><Money value={result.total_due} /></div>
            <div className="metadata">You won't be asked to pay yet — Jon will contact you when shirts are ordered.</div>
          </div>
          {result.licence_outstanding && (
            <Alert kind="warn">We still need your MSUK licence before we can confirm your place. No licence = no GFoS. Upload it from your status page.</Alert>
          )}
          <Link className="btn btn-primary" to={`/status/${token}`}>View my status</Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="spread mb">
        <div>
          <h1 style={{ marginBottom: 2 }}>{event.name}</h1>
          <div className="metadata">{event.dates}{event.location ? ` · ${event.location}` : ''}</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={decline}>Can't make it?</button>
      </div>

      <Alert kind="error">{submitError}</Alert>

      <form onSubmit={submit}>
        <Section n={1} title="Personal details">
          <div className="row row-wrap">
            <div className="col" style={{ minWidth: 140 }}><Field label="Surname" required error={errors.surname}><input value={form.surname} onChange={(e) => set('surname', e.target.value)} /></Field></div>
            <div className="col" style={{ minWidth: 140 }}><Field label="Forename(s)" required error={errors.forenames}><input value={form.forenames} onChange={(e) => set('forenames', e.target.value)} /></Field></div>
          </div>
          <Field label="Preferred name" hint="What should we call you?"><input value={form.preferred_name} onChange={(e) => set('preferred_name', e.target.value)} /></Field>
          <Field label="Address line 1" required error={errors.address_line1}><input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} /></Field>
          <Field label="Address line 2"><input value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} /></Field>
          <div className="row row-wrap">
            <div className="col" style={{ minWidth: 140 }}><Field label="Town/City" required error={errors.address_town}><input value={form.address_town} onChange={(e) => set('address_town', e.target.value)} /></Field></div>
            <div className="col" style={{ minWidth: 120 }}><Field label="Postcode" required error={errors.address_postcode}><input value={form.address_postcode} onChange={(e) => set('address_postcode', e.target.value)} /></Field></div>
          </div>
          <Field label="Mobile phone" required error={errors.phone_mobile}><input type="tel" value={form.phone_mobile} onChange={(e) => set('phone_mobile', e.target.value)} /></Field>
          <div className="row row-wrap">
            <div className="col" style={{ minWidth: 140 }}><Field label="Home phone"><input type="tel" value={form.phone_home} onChange={(e) => set('phone_home', e.target.value)} /></Field></div>
            <div className="col" style={{ minWidth: 140 }}><Field label="Work phone"><input type="tel" value={form.phone_work} onChange={(e) => set('phone_work', e.target.value)} /></Field></div>
          </div>
          <Field label="Email address" hint="Pre-filled from your invitation"><input type="email" value={prefillEmail} readOnly style={{ background: 'var(--color-border-light)' }} /></Field>
          <Field label="Motorsport interests">
            {INTERESTS.map((i) => (
              <label key={i} className="check-row"><input type="checkbox" checked={form.motorsport_interests.includes(i)} onChange={() => toggleArray('motorsport_interests', i)} /> {i}</label>
            ))}
          </Field>
          <div className="row row-wrap">
            <div className="col" style={{ minWidth: 160 }}><Field label="MSUK licence number" required hint="As printed on your licence" error={errors.msuk_licence_number}><input value={form.msuk_licence_number} onChange={(e) => set('msuk_licence_number', e.target.value)} /></Field></div>
            <div className="col" style={{ minWidth: 160 }}><Field label="MSUK licence grade(s)" required hint='e.g. "Senior Marshal"' error={errors.msuk_licence_grades}><input value={form.msuk_licence_grades} onChange={(e) => set('msuk_licence_grades', e.target.value)} /></Field></div>
          </div>
          <Field label="Licence upload" hint="PDF, JPG or PNG, max 10MB. You can also add this later, but we can't confirm your place without it.">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setLicenceFile(e.target.files[0] || null)} />
          </Field>
          <Field label="WDMC membership number" required hint='Enter your number, or "TBC" if joining, or "N/A" for Comp Safari' error={errors.wdmc_member_number}><input value={form.wdmc_member_number} onChange={(e) => set('wdmc_member_number', e.target.value)} /></Field>
          <Field label="Years attended GFoS" hint="0 if this is your first time"><input type="number" min="0" value={form.gfos_years_attended} onChange={(e) => set('gfos_years_attended', e.target.value)} /></Field>
          {showOraExp && (
            <label className="check-row"><input type="checkbox" checked={form.ora_experienced} onChange={(e) => set('ora_experienced', e.target.checked)} /> I have marshalled the ORA before and can cover it if needed</label>
          )}
        </Section>

        <Section n={2} title="Attendance">
          <Field label="Arrival day" required error={errors.arrival_day}>
            {ARRIVAL_DAYS.map((d) => (
              <label key={d} className="radio-row"><input type="radio" name="arrival_day" checked={form.arrival_day === d} onChange={() => set('arrival_day', d)} /> {d}</label>
            ))}
          </Field>
          <Field label="Approximate arrival time"><input type="time" value={form.arrival_time_approx} onChange={(e) => set('arrival_time_approx', e.target.value)} style={{ maxWidth: 160 }} /></Field>
          <Field label="Marshalling days" required hint="Pick at least one" error={errors.marshalling_days}>
            {MARSHAL_DAYS.map((d) => (
              <label key={d} className="check-row"><input type="checkbox" checked={form.marshalling_days.includes(d)} onChange={() => toggleArray('marshalling_days', d)} /> {d}</label>
            ))}
          </Field>
          <Field label="Role preference" required error={errors.role_preference}>
            <label className="radio-row"><input type="radio" name="role" checked={form.role_preference === 'ora'} onChange={() => set('role_preference', 'ora')} /> ORA</label>
            <label className="radio-row"><input type="radio" name="role" checked={form.role_preference === 'stage'} onChange={() => set('role_preference', 'stage')} /> Rally Stage</label>
            <label className="radio-row"><input type="radio" name="role" checked={form.role_preference === 'flexible'} onChange={() => set('role_preference', 'flexible')} /> Flexible</label>
          </Field>
          {showStageShift && (
            <Field label="Stage shift preference" required error={errors.stage_shift_preference}>
              <label className="radio-row"><input type="radio" name="shift" checked={form.stage_shift_preference === 'am'} onChange={() => set('stage_shift_preference', 'am')} /> AM preferred</label>
              <label className="radio-row"><input type="radio" name="shift" checked={form.stage_shift_preference === 'pm'} onChange={() => set('stage_shift_preference', 'pm')} /> PM preferred</label>
              <label className="radio-row"><input type="radio" name="shift" checked={form.stage_shift_preference === 'no_preference'} onChange={() => set('stage_shift_preference', 'no_preference')} /> No preference</label>
              {event.stage_changeover_time && <div className="field-hint">Stage changeover is at {String(event.stage_changeover_time).slice(0, 5)}.</div>}
            </Field>
          )}
          <Field label="Unavailability notes" hint="Note any specific times you can't marshal, even within your selected days"><textarea value={form.unavailable_notes} onChange={(e) => set('unavailable_notes', e.target.value)} /></Field>
        </Section>

        <Section n={3} title="Departure & Sunday plans">
          <div className="card card-accent mb"><span className="metadata">Your departure preference helps us assign you to the right team.</span></div>
          <Field label="Departure" required error={errors.departure_option}>
            {DEPARTURE.map((d) => (
              <label key={d.v} className="radio-row"><input type="radio" name="departure" checked={form.departure_option === d.v} onChange={() => set('departure_option', d.v)} /> {d.l}</label>
            ))}
          </Field>
          <Field label="Sunday barbie" required error={errors.barbie_attending}>
            <label className="radio-row"><input type="radio" name="barbie" checked={form.barbie_attending === true} onChange={() => set('barbie_attending', true)} /> Yes please (<Money value={barbiePrice} />)</label>
            <label className="radio-row"><input type="radio" name="barbie" checked={form.barbie_attending === false} onChange={() => set('barbie_attending', false)} /> No thanks</label>
          </Field>
        </Section>

        <Section n={4} title="Accommodation & travel">
          <Field label="Accommodation type" required error={errors.accommodation_type}>
            {['tent', 'caravan', 'campervan'].map((t) => (
              <label key={t} className="radio-row" style={{ textTransform: 'capitalize' }}><input type="radio" name="accom" checked={form.accommodation_type === t} onChange={() => set('accommodation_type', t)} /> {t}</label>
            ))}
          </Field>
          {showAccomSize && (
            <div className="row row-wrap">
              <div className="col" style={{ minWidth: 120 }}><Field label="Length (m)" required error={errors.accommodation_size_l}><input type="number" step="0.1" min="0" value={form.accommodation_size_l} onChange={(e) => set('accommodation_size_l', e.target.value)} /></Field></div>
              <div className="col" style={{ minWidth: 120 }}><Field label="Width (m)" required error={errors.accommodation_size_w}><input type="number" step="0.1" min="0" value={form.accommodation_size_w} onChange={(e) => set('accommodation_size_w', e.target.value)} /></Field></div>
            </div>
          )}
          <Field label="Sharing accommodation with" hint="Names of anyone sharing your tent/caravan/campervan"><textarea value={form.sharing_with_names} onChange={(e) => set('sharing_with_names', e.target.value)} /></Field>
          <Field label="Travelling down with" hint="Names of anyone you're travelling in the same vehicle as"><textarea value={form.travelling_with_names} onChange={(e) => set('travelling_with_names', e.target.value)} /></Field>
        </Section>

        <Section n={5} title="Kit & costs">
          {errors.shirts && <div className="field-error mb">{errors.shirts}</div>}
          {form.shirts.map((s, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
              <div className="col"><Field label={i === 0 ? 'Shirt size' : ''}><select value={s.size} onChange={(e) => updateShirt(i, 'size', e.target.value)}>{SHIRT_SIZES.map((z) => <option key={z} value={z}>{z}</option>)}</select></Field></div>
              <div style={{ width: 90 }}><Field label={i === 0 ? 'Qty' : ''}><input type="number" min="1" value={s.quantity} onChange={(e) => updateShirt(i, 'quantity', e.target.value)} /></Field></div>
              {form.shirts.length > 1 && <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => removeShirt(i)}>Remove</button>}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={addShirt}>+ Add another shirt</button>
          <div className="card card-accent mt">
            <div className="spread"><span>Shirts ({shirtQty} × <Money value={shirtPrice} />)</span><strong><Money value={shirtTotal} /></strong></div>
            <div className="spread"><span>Sunday barbie</span><strong><Money value={barbieTotal} /></strong></div>
            <div className="spread" style={{ borderTop: '1px solid var(--color-border)', marginTop: 8, paddingTop: 8 }}>
              <span style={{ fontWeight: 700 }}>Total due</span><strong style={{ fontSize: 18 }}><Money value={total} /></strong>
            </div>
            <div className="metadata mt">You won't be asked to pay yet — Jon will contact you when shirts are ordered.</div>
          </div>
        </Section>

        <Section n={6} title="Declaration">
          <label className="check-row"><input type="checkbox" checked={form.agree_constitution} onChange={(e) => set('agree_constitution', e.target.checked)} /> I agree to abide by the club constitution.</label>
          {errors.agree_constitution && <div className="field-error">{errors.agree_constitution}</div>}
          <label className="check-row"><input type="checkbox" checked={form.agree_contact} onChange={(e) => set('agree_contact', e.target.checked)} /> I agree to be contacted by club officials about this event.</label>
          {errors.agree_contact && <div className="field-error">{errors.agree_contact}</div>}
          <Field label="Typed signature" required hint="Type your full name as your signature" error={errors.signature_name}><input value={form.signature_name} onChange={(e) => set('signature_name', e.target.value)} /></Field>
          <Field label="Date"><input value={new Date().toLocaleDateString('en-GB')} readOnly style={{ background: 'var(--color-border-light)', maxWidth: 160 }} /></Field>
        </Section>

        <div className="spread">
          <span className="metadata">{draftSaved ? 'Draft saved ✓' : 'Your progress is saved automatically.'}</span>
          <button className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit application'}</button>
        </div>
      </form>
    </PublicLayout>
  );
}
