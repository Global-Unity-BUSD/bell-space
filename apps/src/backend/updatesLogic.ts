// Update (announcement) form rules that don't need the network.

export type UpdateStatus = 'draft' | 'published';
export type Update = {
  id: string;
  title: string;
  starts_at: string | null;
  location: string | null;
  body: string;
  photo_path: string | null;
  sample: boolean;
  status: UpdateStatus;
  published_at: string | null;
  updated_at: string;
};
export type UpdateDraft = { title: string; date: string; time: string; location: string; body: string };

export const LIMITS = { title: 120, location: 120, body: 600 };

// The sample football update, matching the row the migration inserts. Shown
// only when no backend is connected, so the feed is never blank; it is
// labelled as a sample and has no date, opponent or real announcement.
export const SAMPLE_UPDATE: Update = {
  id: 'sample-football', title: 'Sample event: Home football game', starts_at: null, location: null,
  body: 'This is a sample update for the Bell Space pilot. The school will post real game details, including the date and opponent.',
  photo_path: null, sample: true, status: 'published', published_at: null, updated_at: '2026-10-25T00:00:00Z',
};

/** Month and day for a card's date badge, in the phone's local time. */
export function dateBadge(iso: string | null): { month: string; day: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  return { month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), day: String(d.getDate()) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-06" + "19:30" (phone's local time) → ISO, or null when both are empty. */
export function parseWhen(date: string, time: string): { iso: string | null } | { error: string } {
  const d = date.trim(); const t = time.trim();
  if (!d && !t) return { iso: null };
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!dm) return { error: 'Date must look like 2026-11-06.' };
  const tm = t ? /^(\d{1,2}):(\d{2})$/.exec(t) : ['', '0', '00'];
  if (!tm) return { error: 'Time must look like 19:30 (24-hour).' };
  const [y, mo, da] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  const when = new Date(y, mo - 1, da, h, mi);
  if (when.getFullYear() !== y || when.getMonth() !== mo - 1 || when.getDate() !== da || h > 23 || mi > 59) {
    return { error: 'That date or time does not exist.' };
  }
  return { iso: when.toISOString() };
}

/** ISO → the form's date and time fields, in the phone's local time. */
export function splitWhen(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function formatWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function validateUpdate(draft: UpdateDraft): { error: string } | { starts_at: string | null } {
  if (!draft.title.trim()) return { error: 'Add a title.' };
  if (draft.title.trim().length > LIMITS.title) return { error: `Keep the title under ${LIMITS.title} characters.` };
  if (draft.location.trim().length > LIMITS.location) return { error: `Keep the location under ${LIMITS.location} characters.` };
  if (draft.body.trim().length > LIMITS.body) return { error: `Keep the text under ${LIMITS.body} characters.` };
  const when = parseWhen(draft.date, draft.time);
  if ('error' in when) return when;
  return { starts_at: when.iso };
}

/** Feed order: published newest first; an editor's drafts on top. */
export function feedOrder(list: Update[]) {
  const key = (u: Update) => u.published_at ?? u.updated_at;
  return [...list].sort((a, b) => (a.status === b.status ? key(b).localeCompare(key(a)) : a.status === 'draft' ? -1 : 1));
}
