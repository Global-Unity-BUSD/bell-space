import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import {
  checkText, languageLabel, LIMITS, STATUS_LABEL, topicLabel,
  type Guide, type Me, type Report, type RequestEvent, type RequestMessage, type RequestStatus, type SupportRequest,
} from '../../shared/api.ts';
import { api, errorText, formatDateTime, timeAgo, useLive } from './api.ts';

type Overview = { requests: SupportRequest[]; reports: Report[]; guides: Guide[]; supervision_mode: string };
type Detail = {
  request: SupportRequest; messages: RequestMessage[]; thread_hidden: boolean;
  events: RequestEvent[]; reports: Report[];
};

const FILTERS: { id: string; label: string; match: (r: SupportRequest, reported: Set<string>) => boolean }[] = [
  { id: 'review', label: 'To review', match: (r) => r.status === 'submitted' },
  { id: 'guides', label: 'With guides', match: (r) => r.status === 'with_guide' },
  { id: 'follow_up', label: 'Follow-up', match: (r) => r.status === 'follow_up' },
  { id: 'staff', label: 'With staff', match: (r) => r.status === 'with_staff' },
  { id: 'reported', label: 'Reported', match: (r, reported) => reported.has(r.id) },
  { id: 'resolved', label: 'Resolved', match: (r) => r.status === 'resolved' },
];

const STATUS_TAG: Record<RequestStatus, string> = {
  submitted: 'warn', with_guide: 'ok', follow_up: 'info', with_staff: 'info', resolved: '',
};

const EVENT_LABEL: Record<string, string> = {
  submitted: 'Submitted', declined: 'Declined', guide_done: 'Marked done', kept_by_staff: 'Kept with staff',
  taken_by_staff: 'Taken by staff (messaged during review)',
  resolved: 'Resolved', withdrawn: 'Withdrawn', reported: 'Reported', report_resolved: 'Report handled', viewed: 'Viewed',
};

/** "Assigned to Gina by Sofia", "Declined by Gina: Busy with class", "Viewed by Sofia". */
function eventText(e: RequestEvent) {
  const by = e.actor_name ? ` by ${e.actor_name}` : '';
  if (e.kind === 'assigned') return `Assigned to ${e.detail ?? 'a guide'}${by}`;
  return `${EVENT_LABEL[e.kind] ?? e.kind}${by}${e.detail ? `: ${e.detail}` : ''}`;
}

function Thread({ detail, me, onSent }: { detail: Detail; me: Me; onSent: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const { request: r, messages } = detail;
  // Staff can also write while a request waits for review: sending takes it (With staff).
  const reviewing = r.status === 'submitted';
  const open = reviewing || ['with_guide', 'follow_up', 'with_staff'].includes(r.status);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  if (detail.thread_hidden && !reviewing) {
    return (
      <p className="alert warn">
        Messages are hidden because supervision is set to reported requests only. They become visible if the
        student or guide reports this request, or when it reaches staff follow-up.
      </p>
    );
  }
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checkText(text, LIMITS.message);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await api('POST', `/v1/support/requests/${r.id}/messages`, { body: text.trim() });
      setText('');
      setError(null);
      onSent();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <div className="thread">
      {!messages.length && <p className="muted">No messages yet.</p>}
      {reviewing && (
        <p className="alert info">
          You can message the student before choosing a guide. Sending moves this request to With staff, handled by
          you (not marked sensitive). You can still assign a guide afterwards; the guide then sees the whole conversation.
        </p>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.sender_role}`}>
          <div className="msg-meta">
            <strong>{m.sender_id === me.id ? 'You' : m.sender_name}</strong>
            {' · '}{m.sender_role === 'staff' ? 'Staff' : m.sender_role === 'guide' ? 'Student guide' : 'Student'}
            {' · '}{formatDateTime(m.created_at)}
          </div>
          <div className="msg-body">{m.body}</div>
        </div>
      ))}
      <div ref={end} />
      {open && (
        <form className="composer" onSubmit={send}>
          <textarea rows={3} value={text} maxLength={LIMITS.message} onChange={(e) => setText(e.target.value)}
            aria-label="Message"
            placeholder={r.status === 'with_guide' ? 'Message as staff (the student and the guide see it)'
              : reviewing ? 'Message the student (moves this request to With staff)' : 'Message the student'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(e); }} />
          <div className="actions">
            <button className="btn primary" disabled={busy}>Send message</button>
            <span className="hint">Ctrl+Enter to send</span>
          </div>
          {error && <p className="alert error">{error}</p>}
        </form>
      )}
    </div>
  );
}

function Actions({ detail, guides, onChanged }: { detail: Detail; guides: Guide[]; onChanged: () => void }) {
  const r = detail.request;
  const [guide, setGuide] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (path: string, body: object = {}) => {
    setBusy(true);
    setError(null);
    try { await api('POST', `/v1/support/requests/${r.id}/${path}`, body); setNote(''); onChanged(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  // Guides who cover the topic first, then the least busy; never the student themself.
  const choices = guides.filter((g) => g.id !== r.student_id)
    .sort((a, b) => Number(b.topics.includes(r.topic)) - Number(a.topics.includes(r.topic)) || a.open_requests - b.open_requests);

  if (r.status === 'resolved') {
    return r.resolution_note ? <p><span className="muted">Resolution note:</span> {r.resolution_note}</p> : null;
  }
  const canAssign = r.status === 'submitted' || (r.status === 'with_staff' && !r.sensitive);
  return (
    <div className="fields">
      {canAssign && (
        <>
          <label className="field">Assign a trained student guide
            <select value={guide} onChange={(e) => setGuide(e.target.value)}>
              <option value="">Choose a guide…</option>
              {choices.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.display_name}{g.topics.includes(r.topic) ? ' (covers this topic)' : ''} — {g.topics.map(topicLabel).join(', ') || 'no topics'};
                  {' '}{g.languages.map(languageLabel).join(', ')}; {g.open_requests} open
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button className="btn primary" disabled={busy || !guide} onClick={() => run('assign', { guide_id: guide })}>Assign guide</button>
            {r.status === 'submitted' && (
              <button className="btn" disabled={busy} onClick={() => {
                if (confirm('Keep this request with staff? No guide will see it. Use this for counseling, safety and private matters.')) run('keep');
              }}>Keep with staff (sensitive)</button>
            )}
          </div>
        </>
      )}
      <label className="field">Resolution note <span className="hint">Optional. Shown to the student.</span>
        <input value={note} maxLength={LIMITS.note} onChange={(e) => setNote(e.target.value)}
          placeholder={r.status === 'follow_up' ? 'Confirmed with the student' : 'Why it is resolved'} />
      </label>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={() => run('resolve', { note: note.trim() || null })}>Mark resolved</button>
      </div>
      {error && <p className="alert error" role="alert">{error}</p>}
    </div>
  );
}

function RequestDetail({ id, me, overview, hint, onChanged }: {
  id: string; me: Me; overview: Overview; hint: number; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<Detail>('GET', `/v1/support/requests/${id}`).then((d) => { setDetail(d); setError(null); }, (e) => setError(errorText(e)));
  }, [id]);
  useEffect(load, [load, hint]);

  if (error) return <section className="panel panel-body"><p className="alert error">{error}</p></section>;
  if (!detail || detail.request.id !== id) return <section className="panel panel-body"><p className="muted">Loading…</p></section>;
  const r = detail.request;
  const openReports = detail.reports.filter((x) => !x.resolved_at);
  const resolveReport = async (reportId: string) => {
    try { await api('POST', `/v1/support/reports/${reportId}/resolve`); load(); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Request from {r.student_name}</h2>
        <div className="actions">
          {r.sensitive && <span className="tag violet">Sensitive</span>}
          {openReports.length > 0 && <span className="tag danger">Reported</span>}
          <span className={`tag ${STATUS_TAG[r.status]}`}>{STATUS_LABEL[r.status]}</span>
        </div>
      </div>
      <div className="panel-body">
        <dl className="details">
          <dt>Student</dt><dd>{r.student_name}</dd>
          <dt>Topic</dt><dd>{topicLabel(r.topic)}</dd>
          <dt>Language</dt><dd>{languageLabel(r.language)}</dd>
          <dt>Submitted</dt><dd>{formatDateTime(r.created_at)}</dd>
          {r.guide_name && <><dt>Student guide</dt><dd>{r.guide_name}{r.assigned_at ? `, since ${formatDateTime(r.assigned_at)}` : ''}</dd></>}
          {r.staff_name && <><dt>Staff</dt><dd>{r.staff_name}</dd></>}
        </dl>
        <div className="quote">{r.question}</div>

        {openReports.map((x) => (
          <div key={x.id} className="report-box">
            <div><strong>Report from {x.reporter_name}</strong> <span className="muted">· {formatDateTime(x.created_at)}</span></div>
            <p>{x.reason}</p>
            <button className="btn" onClick={() => resolveReport(x.id)}>Mark report handled</button>
          </div>
        ))}

        <h3>Actions</h3>
        <Actions detail={detail} guides={overview.guides} onChanged={() => { load(); onChanged(); }} />
        <h3>Conversation</h3>
        <Thread detail={detail} me={me} onSent={load} />
        <details>
          <summary className="muted">History ({detail.events.length})</summary>
          <table className="table history">
            <tbody>
              {detail.events.map((e) => (
                <tr key={e.id}><td className="muted" style={{ width: 170 }}>{formatDateTime(e.created_at)}</td><td>{eventText(e)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </section>
  );
}

export function SupportPage({ me }: { me: Me }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('review');
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped when a live hint concerns the open request, so its detail reloads.
  const [hint, setHint] = useState(0);

  const load = useCallback(() => {
    api<Overview>('GET', '/v1/support').then((o) => { setOverview(o); setError(null); }, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);
  useLive((h) => {
    if (h.t === 'request' || h.t === 'resync') load();
    if ((h.t === 'request' && h.id === selected) || (h.t === 'message' && h.request === selected) || h.t === 'resync') setHint((n) => n + 1);
  });

  const head = (
    <div className="page-head">
      <div>
        <h1>Chats</h1>
        <p>
          {overview?.supervision_mode === 'reported_only'
            ? 'Supervision: messages are visible only for reported requests and staff follow-up. Every view is recorded.'
            : 'Supervision: support staff can read every conversation. Every view is recorded.'}
        </p>
      </div>
    </div>
  );
  if (error && !overview) return <>{head}<p className="alert error">{error}</p></>;
  if (!overview) return <>{head}<p className="muted">Loading…</p></>;
  const reported = new Set(overview.reports.filter((x) => !x.resolved_at).map((x) => x.request_id));
  const current = FILTERS.find((f) => f.id === filter)!;
  const shown = overview.requests.filter((r) => current.match(r, reported));
  if (current.id === 'review') shown.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      {head}
      <div className="columns">
        <section className="panel">
          <div className="filters" role="tablist">
            {FILTERS.map((f) => {
              const n = overview.requests.filter((r) => f.match(r, reported)).length;
              return (
                <button key={f.id} role="tab" aria-selected={f.id === filter} className={f.id === filter ? 'active' : ''} onClick={() => setFilter(f.id)}>
                  {f.label}{f.id !== 'resolved' && <span className="n">{n}</span>}
                </button>
              );
            })}
          </div>
          {!shown.length ? <p className="muted" style={{ padding: 14 }}>No requests here.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Question</th><th>{current.id === 'review' ? 'Waiting' : 'Updated'}</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={`clickable ${r.id === selected ? 'selected' : ''}`} onClick={() => setSelected(r.id)}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(r.id); }}>
                      <td>
                        <strong>{r.student_name}</strong>
                        <div className="small muted">{topicLabel(r.topic)}{r.guide_name ? ` · ${r.guide_name}` : ''}</div>
                        {(r.sensitive || reported.has(r.id)) && (
                          <div className="actions" style={{ marginTop: 4 }}>
                            {r.sensitive && <span className="tag violet">Sensitive</span>}
                            {reported.has(r.id) && <span className="tag danger">Reported</span>}
                          </div>
                        )}
                      </td>
                      <td><span className="clamp">{r.question}</span></td>
                      <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{timeAgo(current.id === 'review' ? r.created_at : r.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selected
          ? <RequestDetail id={selected} me={me} overview={overview} hint={hint} onChanged={load} />
          : <section className="panel empty-state"><p className="muted">Select a request to see its details.</p></section>}
      </div>
    </>
  );
}
