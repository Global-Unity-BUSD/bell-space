import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  languageLabel, LIMITS, STAFF_TYPES, staffTypeLabel, topicLabel,
  type AccountRow, type AuditEntry, type Me, type SupervisionMode,
} from '../../shared/api.ts';
import { api, errorText, formatDateTime } from './api.ts';

// Staff accounts are one of two types: Chats, or Chats + Updates (which also
// manages accounts). Student and guide accounts are test accounts for now
// (server: npm run seed:test), so they are listed here but not edited.

type StaffTypeId = (typeof STAFF_TYPES)[number]['id'];
const typeOf = (a: AccountRow): StaffTypeId | null =>
  STAFF_TYPES.find((t) => staffTypeLabel(a.permissions) === t.label)?.id ?? null;

function TypeChoice({ value, onChange, disabled }: { value: StaffTypeId | null; onChange: (t: StaffTypeId) => void; disabled?: boolean }) {
  return (
    <fieldset className="fields" style={{ border: 0, padding: 0, margin: 0 }} disabled={disabled}>
      <legend className="field" style={{ marginBottom: 6 }}>Access</legend>
      {STAFF_TYPES.map((t) => (
        <label key={t.id} className="check">
          <input type="radio" name="staff-type" checked={value === t.id} onChange={() => onChange(t.id)} />
          <span><strong>{t.label}</strong><br /><span className="muted small">{t.description}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

function NewStaff({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ display_name: '', email: '', password: '' });
  const [type, setType] = useState<StaffTypeId>('chats');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/v1/admin/accounts', {
        display_name: f.display_name.trim(), email: f.email.trim(), password: f.password, kind: 'staff',
        permissions: STAFF_TYPES.find((t) => t.id === type)!.permissions,
      });
      onDone();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head"><h2>Add staff account</h2></div>
      <div className="panel-body">
        <label className="field">Name <span className="hint">Shown to students in chats</span>
          <input value={f.display_name} maxLength={LIMITS.name} required onChange={(e) => setF({ ...f, display_name: e.target.value })} />
        </label>
        <label className="field">School email<input type="email" value={f.email} required onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <TypeChoice value={type} onChange={setType} />
        <label className="field">First password <span className="hint">At least 8 characters. Give it to the person privately.</span>
          <input type="password" autoComplete="new-password" minLength={8} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>Create account</button>
          <button type="button" className="btn link" onClick={onDone}>Cancel</button>
        </div>
      </div>
    </form>
  );
}

function EditStaff({ account, me, onDone }: { account: AccountRow; me: Me; onDone: () => void }) {
  const [type, setType] = useState<StaffTypeId | null>(typeOf(account));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const self = account.id === me.id;
  const patch = async (body: object) => {
    setBusy(true);
    setError(null);
    try { await api('PATCH', `/v1/admin/accounts/${account.id}`, body); onDone(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const changed = type !== typeOf(account) || password;
  const save = () => patch({
    ...(type && type !== typeOf(account) ? { permissions: STAFF_TYPES.find((t) => t.id === type)!.permissions } : {}),
    ...(password ? { password } : {}),
  });
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{account.display_name}</h2>
        {account.disabled ? <span className="tag danger">Disabled</span> : <span className="tag">{staffTypeLabel(account.permissions)}</span>}
      </div>
      <div className="panel-body">
        <dl className="details">
          <dt>Email</dt><dd>{account.email}</dd>
          <dt>Created</dt><dd>{formatDateTime(account.created_at)}{account.test_account ? ' (test account)' : ''}</dd>
        </dl>
        <TypeChoice value={type} onChange={setType} disabled={self} />
        {self && <p className="hint">You cannot change your own access. Another Chats + Updates staff member can.</p>}
        {!typeOf(account) && <p className="alert warn">This account has a custom set of permissions ({staffTypeLabel(account.permissions)}). Choose a type to replace it.</p>}
        <label className="field">New password <span className="hint">Optional. Signs the account out everywhere.</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || !changed} onClick={save}>Save</button>
          <button className="btn link" disabled={busy} onClick={onDone}>Close</button>
          <span className="spacer" />
          {!self && (
            <button className={`btn ${account.disabled ? '' : 'danger'}`} disabled={busy} onClick={() => {
              if (account.disabled || confirm(`Disable ${account.display_name}? They are signed out and cannot sign in until the account is enabled again.`)) {
                patch({ disabled: !account.disabled });
              }
            }}>{account.disabled ? 'Enable account' : 'Disable account'}</button>
          )}
        </div>
      </div>
    </section>
  );
}

function Supervision({ mode, onChanged }: { mode: SupervisionMode; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const set = async (next: SupervisionMode) => {
    if (next === mode) return;
    if (!confirm('Change who can read student chats? The change is recorded.')) return;
    try { await api('PUT', '/v1/admin/settings/supervision', { mode: next }); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>Chat supervision</h2></div>
      <div className="panel-body">
        <label className="check"><input type="radio" name="supervision" checked={mode === 'all_requests'} onChange={() => set('all_requests')} />
          <span><strong>All conversations</strong><br /><span className="muted small">Chats staff can read every conversation.</span></span></label>
        <label className="check"><input type="radio" name="supervision" checked={mode === 'reported_only'} onChange={() => set('reported_only')} />
          <span><strong>Reported only</strong><br /><span className="muted small">Chats staff see every question (to assign it), but the messages only once reported, kept with staff, or at follow-up.</span></span></label>
        <p className="hint">Every staff view of a conversation is recorded in its history either way.</p>
        {error && <p className="alert error">{error}</p>}
      </div>
    </section>
  );
}

export function AccountsPage({ me }: { me: Me }) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [mode, setMode] = useState<SupervisionMode>('all_requests');
  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<{ accounts: AccountRow[] }>('GET', '/v1/admin/accounts'),
      api<{ audit: AuditEntry[] }>('GET', '/v1/admin/audit'),
      api<{ supervision_mode: SupervisionMode }>('GET', '/v1/admin/settings'),
    ]).then(([a, l, s]) => { setAccounts(a.accounts); setAudit(l.audit); setMode(s.supervision_mode); setError(null); }, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  const staff = (accounts ?? []).filter((a) => a.kind === 'staff');
  const students = (accounts ?? []).filter((a) => a.kind === 'student');
  const done = () => { setEditing(null); load(); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>Staff accounts for this portal, and the student test accounts used in the app.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>Add staff account</button>
      </div>
      {error && <p className="alert error">{error}</p>}
      <div className="columns">
        <div className="stack">
          <section className="panel">
            <div className="panel-head"><h2>Staff</h2><span className="muted small">{staff.length}</span></div>
            {!accounts ? <p className="muted" style={{ padding: 14 }}>Loading…</p> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Name</th><th>Access</th><th>Status</th></tr></thead>
                  <tbody>
                    {staff.map((a) => (
                      <tr key={a.id} className={`clickable ${editing !== 'new' && editing?.id === a.id ? 'selected' : ''} ${a.disabled ? 'dim' : ''}`}
                        onClick={() => setEditing(a)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(a); }}>
                        <td><strong>{a.display_name}</strong>{a.id === me.id && <span className="muted"> (you)</span>}<div className="small muted">{a.email}</div></td>
                        <td>{staffTypeLabel(a.permissions)}</td>
                        <td>{a.disabled ? <span className="tag danger">Disabled</span> : <span className="tag ok">Active</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><h2>Students and guides</h2><span className="muted small">Test accounts</span></div>
            <p className="hint" style={{ padding: '10px 14px 0' }}>
              Student sign-in will come from the district. Until then these test accounts are set up on the server (npm run seed:test).
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Role</th><th>Guide topics</th></tr></thead>
                <tbody>
                  {students.map((a) => (
                    <tr key={a.id} className={a.disabled ? 'dim' : ''}>
                      <td>{a.display_name}<div className="small muted">{a.email}</div></td>
                      <td>{a.disabled ? 'Disabled' : a.guide?.active ? 'Student guide' : 'Student'}</td>
                      <td className="small">
                        {a.guide?.active ? `${a.guide.topics.map(topicLabel).join(', ')}; ${a.guide.languages.map(languageLabel).join(', ')}` : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="stack">
          {editing === 'new' && <NewStaff onDone={done} />}
          {editing && editing !== 'new' && <EditStaff key={editing.id} account={editing} me={me} onDone={done} />}
          <Supervision mode={mode} onChanged={load} />
          <section className="panel">
            <div className="panel-head"><h2>Recent changes</h2></div>
            {!audit.length ? <p className="muted" style={{ padding: 14 }}>No changes yet.</p> : (
              <table className="table">
                <tbody>
                  {audit.slice(0, 20).map((e) => (
                    <tr key={e.id}>
                      <td className="small muted" style={{ width: 150 }}>{formatDateTime(e.created_at)}</td>
                      <td className="small">{e.actor_name ?? 'Setup script'}: {e.action.replace(/_/g, ' ')}{e.target_name ? ` (${e.target_name})` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
