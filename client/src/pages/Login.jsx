import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../components/Logo';
import { Alert } from '../components/ui';
import { errMessage } from '../api';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) { navigate('/admin', { replace: true }); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(errMessage(err, 'Login failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 'min(380px, 100%)' }}>
        <div className="center mb"><Logo subline logoSize={40} wordSize={28} /></div>
        <form className="card" onSubmit={submit}>
          <h2 style={{ marginBottom: 4 }}>Sign in</h2>
          <p className="metadata mb">Coordinator &amp; committee access</p>
          <Alert kind="error">{error}</Alert>
          <div className="field">
            <label className="field-label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
