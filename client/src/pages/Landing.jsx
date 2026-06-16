import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PublicLayout from '../components/PublicLayout';
import { Logomark } from '../components/Logo';
import { Alert } from '../components/ui';

// Pull an apply/status token out of a pasted link or bare token.
// Returns { path, token } or null.
function parseInvite(input) {
  const raw = (input || '').trim();
  if (!raw) return null;
  // Full or partial URL containing /apply/<token> or /status/<token>.
  const m = raw.match(/\/(apply|status)\/([^/?#\s]+)/i);
  if (m) return { path: m[1].toLowerCase(), token: m[2] };
  // Otherwise treat the whole thing as a token (defaults to the apply form).
  // Reject anything with spaces or slashes — that's clearly not a token.
  if (/[\s/]/.test(raw)) return null;
  return { path: 'apply', token: raw };
}

export default function Landing() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function go(e) {
    e.preventDefault();
    const parsed = parseInvite(value);
    if (!parsed) {
      setError("That doesn't look like an invite link. Paste the full link from your email.");
      return;
    }
    navigate(`/${parsed.path}/${parsed.token}`);
  }

  return (
    <PublicLayout>
      <div className="center" style={{ padding: '12px 0 4px' }}>
        <Logomark size={64} />
        <h1 style={{ marginTop: 12, marginBottom: 4 }}>
          marsh<span style={{ color: 'var(--color-orange)' }}>point</span>
        </h1>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Marshal Event Management</div>
      </div>

      <div className="card mb">
        <p style={{ marginTop: 0 }}>
          Marshpoint is how the Welbeck &amp; District Motor Club organises its
          volunteer marshalling team for events like the Goodwood Festival of Speed —
          invitations, applications, licences, schedules and kit, all in one place.
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Been invited to marshal?</strong> Use the personal link from your
          invitation email, or paste it below to pick up where you left off.
        </p>
      </div>

      <form className="card" onSubmit={go}>
        <h3 style={{ marginTop: 0 }}>Have an invite link?</h3>
        <Alert kind="error">{error}</Alert>
        <div className="field">
          <label className="field-label">Paste your invite or status link</label>
          <input
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder="https://marshpoint.co.uk/apply/…"
            autoComplete="off"
          />
          <div className="field-hint">It's the personal link we emailed you. Your details are kept private to you.</div>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }}>Continue</button>
      </form>

      <div className="center metadata" style={{ marginTop: 20 }}>
        Organising the team? <Link to="/admin/login">Organiser sign-in</Link>
      </div>
    </PublicLayout>
  );
}
