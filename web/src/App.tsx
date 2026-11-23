import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { staffTypeLabel, type Me, type StaffPermission, type SupportRequest } from '../../shared/api.ts';
import { AccountsPage } from './AccountsPage.tsx';
import { api, errorText, SIGNED_OUT, useLive } from './api.ts';
import { SupportPage } from './SupportPage.tsx';
import { UpdatesPage } from './UpdatesPage.tsx';

const PAGES: { id: string; label: string; permission: StaffPermission }[] = [
  { id: 'chats', label: 'Chats', permission: 'support' },
  { id: 'updates', label: 'Updates', permission: 'updates' },
  { id: 'accounts', label: 'Accounts', permission: 'manage_accounts' },
];

// ---------------------------------------------------------------- theme (per browser)

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'bell.theme';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch { return 'system'; }
}

function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* private window */ }
}

function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <label className="theme-select">
      <span>Theme</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

// ---------------------------------------------------------------- sign-in

function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { me } = await api<{ me: Me }>('POST', '/v1/auth/sign-in', { email, password, client: 'web' });
      onSignedIn(me);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="signin">
      <form className="signin-box" onSubmit={submit}>
        <div className="signin-head">
          <div className="brand-name">Bell Space</div>
          <div className="brand-sub">Staff portal · Burbank High School</div>
        </div>
        <label className="field">Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="alert error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

// ---------------------------------------------------------------- shell

/** Requests waiting for review, for the count beside "Chats". */
function useReviewCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    api<{ requests: SupportRequest[] }>('GET', '/v1/support')
      .then((r) => setCount(r.requests.filter((x) => x.status === 'submitted').length), () => {});
  }, [enabled]);
  useEffect(load, [load]);
  useLive((h) => { if (h.t === 'request' || h.t === 'resync') load(); });
  return count;
}

function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [page, setPage] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const hash = () => setPage(location.hash.slice(1));
    window.addEventListener('hashchange', hash);
    return () => window.removeEventListener('hashchange', hash);
  }, []);
  const allowed = PAGES.filter((p) => me.permissions.includes(p.permission));
  const current = allowed.find((p) => p.id === page) ?? allowed[0];
  const reviewCount = useReviewCount(me.permissions.includes('support'));

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Bell Space</div>
          <div className="brand-sub">Staff portal</div>
        </div>
        <nav aria-label="Main">
          {allowed.map((p) => (
            <a key={p.id} href={`#${p.id}`} className={p === current ? 'active' : ''} aria-current={p === current ? 'page' : undefined}>
              <span>{p.label}</span>
              {p.id === 'chats' && reviewCount > 0 && <span className="nav-count" aria-label={`${reviewCount} to review`}>{reviewCount}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <div className="who-name">{me.display_name}</div>
            <div className="who-role">{me.kind === 'staff' ? staffTypeLabel(me.permissions) : 'Student account'}</div>
          </div>
          <ThemeSelect />
          <button className="btn block" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {me.kind !== 'staff' || !current ? (
          <section className="panel empty-state">
            <h1>No staff access</h1>
            <p className="muted">This portal is for Bell Space staff. Ask the staff member who manages accounts to give your account access.</p>
          </section>
        ) : current.id === 'updates' ? <UpdatesPage />
          : current.id === 'chats' ? <SupportPage me={me} />
            : <AccountsPage me={me} />}
      </main>
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    applyTheme(readTheme());
    api<{ me: Me }>('GET', '/v1/me').then((r) => setMe(r.me), () => setMe(null));
    const out = () => setMe(null);
    window.addEventListener(SIGNED_OUT, out);
    return () => window.removeEventListener(SIGNED_OUT, out);
  }, []);

  if (me === undefined) return <main className="signin"><p className="muted">Loading…</p></main>;
  if (!me) return <SignIn onSignedIn={setMe} />;
  const signOut = async () => {
    await api('POST', '/v1/auth/sign-out').catch(() => {});
    setMe(null);
  };
  return <Shell me={me} onSignOut={signOut} />;
}
