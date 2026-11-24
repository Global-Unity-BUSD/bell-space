import { useCallback, useEffect, useState, type ChangeEvent } from 'react';

import { cleanTranslations, LIMITS, UPDATE_LANGUAGES, type Update, type UpdateLang } from '../../shared/api.ts';
import { api, errorText, formatDateTime, joinDateTime, splitDateTime, timeAgo, useLive } from './api.ts';

type Text = { title: string; location: string; body: string };
type Draft = Text & { date: string; time: string; photo_path: string | null; photo_url: string | null; tr: Record<UpdateLang, Text> };
// The English tab, or one of the languages staff can also write the update in.
type Tab = 'en' | UpdateLang;

const blankText: Text = { title: '', location: '', body: '' };
const blankTr = (): Record<UpdateLang, Text> => ({ es: { ...blankText }, hy: { ...blankText }, ru: { ...blankText } });
const blank: Draft = { ...blankText, date: '', time: '', photo_path: null, photo_url: null, tr: blankTr() };
const toDraft = (u: Update): Draft => {
  const tr = blankTr();
  for (const { id } of UPDATE_LANGUAGES) tr[id] = { ...blankText, ...u.translations?.[id] };
  return {
    title: u.title, ...splitDateTime(u.starts_at), location: u.location ?? '', body: u.body,
    photo_path: u.photo_path, photo_url: u.photo_url, tr,
  };
};
const hasText = (t: Text) => Boolean(t.title.trim() || t.location.trim() || t.body.trim());
/** "Español, Русский": the languages an update is also written in. */
const alsoIn = (u: Update) => UPDATE_LANGUAGES.filter((l) => u.translations?.[l.id]).map((l) => l.name).join(', ');

function Editor({ update, onDone }: { update: Update | null; onDone: () => void }) {
  const [d, setD] = useState<Draft>(update ? toDraft(update) : blank);
  const [tab, setTab] = useState<Tab>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  // Title, location and text of the open tab: the English fields, or that language's version.
  const text: Text = tab === 'en' ? d : d.tr[tab];
  const setText = (k: keyof Text) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD(tab === 'en'
    ? { ...d, [k]: e.target.value }
    : { ...d, tr: { ...d.tr, [tab]: { ...d.tr[tab], [k]: e.target.value } } });
  const lang = UPDATE_LANGUAGES.find((l) => l.id === tab);
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
      body: d.body.trim(), photo_path: d.photo_path, status, translations: cleanTranslations(d.tr),
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
      <div className="filters" role="tablist" aria-label="Language">
        <button role="tab" aria-selected={tab === 'en'} className={tab === 'en' ? 'active' : ''} onClick={() => setTab('en')}>English</button>
        {UPDATE_LANGUAGES.map((l) => (
          <button key={l.id} role="tab" aria-selected={tab === l.id} className={tab === l.id ? 'active' : ''} onClick={() => setTab(l.id)}
            title={l.english}>
            {l.name}{hasText(d.tr[l.id]) && <span className="n" aria-label="written">✓</span>}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {lang && (
          <p className="alert info">
            Students who chose {lang.name} ({lang.english}) in the app see this version. Leave a box blank to show the English.
            Keep names such as rooms, places and people in English.
          </p>
        )}
        <label className="field">Title{lang && <span className="hint">Optional</span>}
          <input value={text.title} maxLength={LIMITS.title} onChange={setText('title')} lang={tab}
            placeholder={lang ? d.title || 'English title' : 'Home football game'} />
        </label>
        <div className="fields-2">
          <label className="field">Date <span className="hint">Optional</span><input type="date" value={d.date} onChange={set('date')} /></label>
          <label className="field">Time <span className="hint">Optional</span><input type="time" value={d.time} onChange={set('time')} /></label>
        </div>
        <label className="field">Location <span className="hint">Optional</span>
          <input value={text.location} maxLength={LIMITS.location} onChange={setText('location')} lang={tab}
            placeholder={lang ? d.location || 'English location' : 'Memorial Field'} />
        </label>
        <label className="field">Text <span className="hint">{text.body.length}/{LIMITS.body}</span>
          <textarea rows={5} value={text.body} maxLength={LIMITS.body} onChange={setText('body')} lang={tab}
            placeholder={lang ? d.body : undefined} />
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
          <p>Published updates appear in the Updates tab of the app right away. Drafts are visible only here.
            You can also write each update in Español, Հայերեն and Русский for students who use the app in those languages.</p>
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
                      <td><strong>{u.title}</strong>{u.location && <div className="small muted">{u.location}</div>}
                        {alsoIn(u) && <div className="small muted">Also in {alsoIn(u)}</div>}</td>
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
