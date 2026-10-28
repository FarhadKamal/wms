import { useState } from 'react';
import { api, ApiError, session } from '../api';
import type { Me } from '../api';

export function LoginPage({ notice, onLoggedIn }: { notice?: string; onLoggedIn: (u: Me) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.login(username, password);
      session.set(r.token);
      onLoggedIn(r.user);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Can't reach the WMS server");
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ borderBottom: 'none', padding: 0, marginBottom: 18 }}>
          <div className="brand-mark">AZ</div>
          <div><div className="name" style={{ color: 'var(--ink)' }}>Azneo Limited</div><div className="note">Warehouse System</div></div>
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 14 }}>Log in</h1>
        {notice && <div className="banner" style={{ marginBottom: 14 }}>{notice}</div>}
        <div className="stack" style={{ gap: 12 }}>
          <label className="field">Username <input value={username} autoComplete="username" autoFocus onChange={(e) => setUsername(e.target.value)} /></label>
          <label className="field">Password <input type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></label>
        </div>
        {err && <div className="msg err" role="alert">{err}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={busy || !username || !password}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="note" style={{ marginTop: 14 }}>Accounts are created by the Admin. Forgot your password? Ask the Admin to reset it.</p>
      </form>
    </div>
  );
}
