import { useCallback, useEffect, useState, type ChangeEvent } from 'react';

import { LIMITS, type Update } from '../../shared/api.ts';
import { api, errorText, formatDateTime, joinDateTime, splitDateTime, timeAgo, useLive } from './api.ts';

type Draft = { title: string; date: string; time: string; location: string; body: string; photo_path: string | null; photo_url: string | null };

const blank: Draft = { title: '', date: '', time: '', location: '', body: '', photo_path: null, photo_url: null };
const toDraft = (u: Update): Draft => ({
  title: u.title, ...splitDateTime(u.starts_at), location: u.location ?? '', body: u.body,
  photo_path: u.photo_path, photo_url: u.photo_url,
});

function Editor({ update, onDone }: { update: Update | null; onDone: () => void }) {
  const [d, setD] = useState<Draft>(update ? toDraft(update) : blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const published = update?.status === 'published';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('That photo is larger than 5 MB.'); return; }
    run(async () => {
      const form = new FormData();
      form.append('photo', file);
      const r = await api<{ photo_path: string; photo_url: string }>('POST', '/v1/updates/photos', form);
      setD((prev) => ({ ...prev, photo_path: r.photo_path, photo_url: r.photo_url }));
    });
  };

  const save = (status: 'draft' | 'published') => run(async () => {
    if (!d.title.trim()) throw new Error('Add a title.');
    if (d.time && !d.date) throw new Error('Add a date for the time.');
    const fields = {
      title: d.title.trim(), starts_at: joinDateTime(d.date, d.time), location: d.location.trim() || null,
      body: d.body.trim(), photo_path: d.photo_path, status,
    };
    if (update) await api('PATCH', `/v1/updates/${update.id}`, fields);
    else await api('POST', '/v1/updates', fields);
    onDone();
  });

  const remove = () => {
    if (!update || !confirm(`Delete "${update.title}"? This cannot be undone.`)) return;
    run(async () => { await api('DELETE', `/v1/updates/${update.id}`); onDone(); });
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{update ? 'Edit update' : 'New update'}</h2>
        {update && <span className={`tag ${published ? 'ok' : 'warn'}`}>{published ? 'Published' : 'Draft'}</span>}
      </div>
      <div className="panel-body">
        <label className="field">Title<input value={d.title} maxLength={LIMITS.title} onChange={set('title')} placeholder="Home football game" /></label>
        <div className="fields-2">
          <label className="field">Date <span className="hint">Optional</span><input type="date" value={d.date} onChange={set('date')} /></label>
          <label className="field">Time <span className="hint">Optional</span><input type="time" value={d.time} onChange={set('time')} /></label>
        </div>
        <label className="field">Location <span className="hint">Optional</span>
          <input value={d.location} maxLength={LIMITS.location} onChange={set('location')} placeholder="Memorial Field" />
        </label>
        <label className="field">Text <span className="hint">{d.body.length}/{LIMITS.body}</span>
          <textarea rows={5} value={d.body} maxLength={LIMITS.body} onChange={set('body')} />
        </label>
        <div className="field">Photo <span className="hint">JPEG, PNG, WebP or HEIC, up to 5 MB. Only photos the school may publish.</span>
          <div className="photo">
            {d.photo_url ? <img src={d.photo_url} alt="" /> : <div className="photo-empty">No photo</div>}
            <div className="actions">
              <label className="btn">{d.photo_url ? 'Replace photo' : 'Add photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={upload} hidden />
              </label>
              {d.photo_url && <button className="btn" onClick={() => setD({ ...d, photo_path: null, photo_url: null })}>Remove photo</button>}
            </div>
          </div>
        </div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={() => save('published')}>{published ? 'Save changes' : 'Publish'}</button>
          <button className="btn" disabled={busy} onClick={() => save('draft')}>{published ? 'Unpublish' : 'Save as draft'}</button>
          <button className="btn link" disabled={busy} onClick={onDone}>Cancel</button>
          <span className="spacer" />
          {update && <button className="btn danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </div>
    </section>
  );
}

export function UpdatesPage() {
  const [list, setList] = useState<Update[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Update | 'new' | null>(null);

  const load = useCallback(() => {
    api<{ updates: Update[] }>('GET', '/v1/updates').then((r) => { setList(r.updates); setError(null); }, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  useLive((h) => { if (h.t === 'updates' || h.t === 'resync') load(); });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Updates</h1>
          <p>Published updates appear in the Updates tab of the app right away. Drafts are visible only here.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>New update</button>
      </div>
      {error && <p className="alert error">{error}</p>}
      <div className="columns">
        <section className="panel">
          {!list ? <p className="muted" style={{ padding: 14 }}>Loading…</p> : !list.length ? <p className="muted" style={{ padding: 14 }}>No updates yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Title</th><th>Event date</th><th>Status</th><th>Changed</th></tr></thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id} className={`clickable ${editing !== 'new' && editing?.id === u.id ? 'selected' : ''}`}
                      onClick={() => setEditing(u)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(u); }}>
                      <td><strong>{u.title}</strong>{u.location && <div className="small muted">{u.location}</div>}</td>
                      <td className="small">{u.starts_at ? formatDateTime(u.starts_at) : <span className="muted">None</span>}</td>
                      <td><span className={`tag ${u.status === 'published' ? 'ok' : 'warn'}`}>{u.status === 'published' ? 'Published' : 'Draft'}</span></td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(u.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {editing
          ? <Editor key={editing === 'new' ? 'new' : `${editing.id}-${editing.updated_at}`} update={editing === 'new' ? null : editing}
            onDone={() => { setEditing(null); load(); }} />
          : <section className="panel empty-state"><p className="muted">Select an update to edit it, or create a new one.</p></section>}
      </div>
    </>
  );
}
