import { useEffect, useState } from 'react';
import { api, COMPANY_LABEL, ROLE_LABEL } from '../api';
import type { Company, Role, UserRow } from '../api';
import { Modal } from '../components/Docs';
import { useWms } from '../wms';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, every warehouse, manages users',
  MANAGER: 'Stock movement and warehouse setup — assigned warehouses',
  STORE_KEEPER: 'Receive, put-away, move, dispatch — assigned warehouses',
  MANAGEMENT: 'Views dashboards and reports of every warehouse (read-only)',
};
const needsWarehouses = (r: Role) => r === 'MANAGER' || r === 'STORE_KEEPER';

/** User accounts — Admin only. */
export function UsersPage() {
  const { warehouses, version, run } = useWms();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [shown, setShown] = useState<{ username: string; password: string } | null>(null);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const blank = { username: '', fullName: '', role: 'STORE_KEEPER' as Role, company: 'AZNEO' as Company, warehouses: [] as string[] };
  const [f, setF] = useState(blank);
  useEffect(() => { api.users().then(setUsers).catch(() => setUsers([])); }, [version]);

  const create = async () => {
    const r = await run(() => api.createUser(f), `Account ${f.username} created.`);
    if (r?.password) setShown({ username: r.username, password: r.password });
    if (r) setF(blank);
  };

  return (
    <div className="stack">
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Company</th><th>Warehouses</th><th>Last login</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                <td><b>{u.fullName}</b></td><td className="mono">{u.username}</td><td>{ROLE_LABEL[u.role]}</td><td>{COMPANY_LABEL[u.company]}</td>
                <td>{needsWarehouses(u.role) ? u.warehouses.map((w) => w.name).join(', ') : <span className="note">all</span>}</td>
                <td className="note">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-GB') : 'never'}</td>
                <td><span className={`pill ${u.active ? 'good' : 'neutral'}`}>{u.active ? 'Active' : 'Deactivated'}</span></td>
                <td><button className="btn btn-xs" onClick={() => setEdit(u)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card pad" style={{ maxWidth: 900 }}>
        <div className="section-title">Create an account</div>
        <UserFields value={f} onChange={setF} warehouses={warehouses} isNew />
        <div className="form-actions">
          <button className="btn btn-primary" disabled={!f.username || !f.fullName || (needsWarehouses(f.role) && !f.warehouses.length)} onClick={create}>Create account</button>
          <span className="note">A password is generated and shown once — give it to the person; they can change it after logging in.</span>
        </div>
      </div>

      {shown && (
        <Modal title="Account password" onClose={() => setShown(null)}>
          <div className="card pad">
            <p>Give this to <b>{shown.username}</b>. It is shown only now.</p>
            <p className="mono" style={{ fontSize: 22, fontWeight: 700, margin: '14px 0', userSelect: 'all' }}>{shown.password}</p>
            <p className="note">They can change it under their name → Change password.</p>
          </div>
        </Modal>
      )}
      {edit && <EditUser user={edit} onClose={() => setEdit(null)} onPassword={(p) => setShown({ username: edit.username, password: p })} />}
    </div>
  );
}

type Fields = { username: string; fullName: string; role: Role; company: Company; warehouses: string[] };
function UserFields({ value: f, onChange, warehouses, isNew }: { value: Fields; onChange: (f: Fields) => void; warehouses: Array<{ code: string; name: string }>; isNew?: boolean }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="form-grid" style={{ ['--cols' as string]: 4 }}>
        <label className="field">Full name <input value={f.fullName} onChange={(e) => onChange({ ...f, fullName: e.target.value })} /></label>
        <label className="field">Username <span className="hint">lowercase, used to log in</span>
          <input value={f.username} disabled={!isNew} onChange={(e) => onChange({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} />
        </label>
        <label className="field">Role
          <select value={f.role} onChange={(e) => onChange({ ...f, role: e.target.value as Role })}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="field">Company
          <select value={f.company} onChange={(e) => onChange({ ...f, company: e.target.value as Company })}>
            {(Object.keys(COMPANY_LABEL) as Company[]).map((c) => <option key={c} value={c}>{COMPANY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>
      <p className="note">{ROLE_HELP[f.role]}.</p>
      {needsWarehouses(f.role) && (
        <div className="row">
          <b style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>Works in:</b>
          {warehouses.map((w) => (
            <label key={w.code} className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={f.warehouses.includes(w.code)}
                onChange={(e) => onChange({ ...f, warehouses: e.target.checked ? [...f.warehouses, w.code] : f.warehouses.filter((c) => c !== w.code) })} />
              {w.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function EditUser({ user, onClose, onPassword }: { user: UserRow; onClose: () => void; onPassword: (p: string) => void }) {
  const { warehouses, run } = useWms();
  const [f, setF] = useState<Fields>({ username: user.username, fullName: user.fullName, role: user.role, company: user.company, warehouses: user.warehouses.map((w) => w.code) });
  const save = async () => { if (await run(() => api.updateUser(user.id, { fullName: f.fullName, role: f.role, company: f.company, warehouses: f.warehouses }), 'Account saved.')) onClose(); };
  const reset = async () => { const r = await run(() => api.updateUser(user.id, { resetPassword: true }), 'New password set.'); if (r?.password) { onClose(); onPassword(r.password); } };
  const toggle = async () => { if (await run(() => api.updateUser(user.id, { active: !user.active }), user.active ? 'Account deactivated — logged out at once.' : 'Account reactivated.')) onClose(); };
  return (
    <Modal title={`Edit ${user.fullName}`} onClose={onClose} actions={<>
      <button className="btn btn-danger" onClick={toggle}>{user.active ? 'Deactivate' : 'Reactivate'}</button>
      <button className="btn" onClick={reset}>Reset password</button>
      <button className="btn btn-primary" disabled={!f.fullName || (needsWarehouses(f.role) && !f.warehouses.length)} onClick={save}>Save</button>
    </>}>
      <div className="card pad"><UserFields value={f} onChange={setF} warehouses={warehouses} /></div>
    </Modal>
  );
}

/** Any user: change their own password. */
export function ChangePassword({ onClose }: { onClose: () => void }) {
  const { run } = useWms();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const ok = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next) && next === again;
  return (
    <Modal title="Change password" onClose={onClose} actions={
      <button className="btn btn-primary" disabled={!cur || !ok} onClick={async () => { if (await run(() => api.changePassword(cur, next), 'Password changed.')) onClose(); }}>Change password</button>
    }>
      <div className="card pad stack" style={{ gap: 12 }}>
        <label className="field">Current password <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="field">New password <span className="hint">at least 8 characters, letters and numbers</span><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field">New password again <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        {again && next !== again && <div className="msg err">The two new passwords don't match.</div>}
      </div>
    </Modal>
  );
}
