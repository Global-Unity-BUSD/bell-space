// Types and rules shared by the Bell Space server, staff website and app.
// Plain TypeScript with no imports, so every package can use it by relative path.
// The server's /v1/ API returns these shapes; fields are only ever added.

export type AccountKind = 'student' | 'staff';
export type StaffPermission = 'updates' | 'support' | 'manage_accounts';
export type Topic = 'navigation' | 'new_student' | 'clubs' | 'other';
export type RequestStatus = 'submitted' | 'with_guide' | 'follow_up' | 'with_staff' | 'resolved';
export type SupervisionMode = 'all_requests' | 'reported_only';

export type GuideProfile = { topics: Topic[]; languages: string[]; active: boolean };

export type Me = {
  id: string;
  email: string;
  display_name: string;
  kind: AccountKind;
  permissions: StaffPermission[];
  guide: GuideProfile | null;
};

export type SupportRequest = {
  id: string;
  student_id: string;
  student_name: string;
  topic: Topic;
  language: string | null;
  question: string;
  status: RequestStatus;
  guide_id: string | null;
  guide_name: string | null;
  assigned_at: string | null;
  staff_id: string | null;
  staff_name: string | null;
  sensitive: boolean;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type RequestMessage = {
  id: number;
  request_id: string;
  sender_id: string;
  sender_role: 'student' | 'guide' | 'staff';
  sender_name: string;
  body: string;
  created_at: string;
};

export type RequestEvent = {
  id: number;
  kind: string;
  actor_name: string | null;
  detail: string | null;
  created_at: string;
};

export type Report = {
  id: string;
  request_id: string;
  reporter_name: string;
  reason: string;
  created_at: string;
  resolved_at: string | null;
};

export type Guide = { id: string; display_name: string; topics: Topic[]; languages: string[]; open_requests: number };

export type Update = {
  id: string;
  title: string;
  starts_at: string | null;
  location: string | null;
  body: string;
  photo_path: string | null;
  /** Relative to the server, e.g. /v1/updates/photos/<file>. */
  photo_url: string | null;
  sample: boolean;
  status: 'draft' | 'published';
  published_at: string | null;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  kind: AccountKind;
  disabled: boolean;
  test_account: boolean;
  created_at: string;
  permissions: StaffPermission[];
  guide: GuideProfile | null;
};

export type AuditEntry = { id: number; actor_name: string | null; action: string; target_name: string | null; detail: Record<string, unknown>; created_at: string };

/** Hints sent over /v1/live. Clients fetch the content through the API. */
export type LiveHint =
  | { t: 'ready'; signed_in: boolean }
  | { t: 'updates' }
  | { t: 'request'; id: string }
  | { t: 'message'; request: string; id: number }
  | { t: 'resync' };

// ---------------------------------------------------------------- labels and limits

export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'new_student', label: 'New student help' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'other', label: 'Other' },
];
export const LANGUAGES: { id: string; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'hy', label: 'Armenian' },
];
export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: 'Waiting for staff review',
  with_guide: 'With a student guide',
  follow_up: 'Staff follow-up',
  with_staff: 'With staff',
  resolved: 'Resolved',
};
export const PERMISSION_LABEL: Record<StaffPermission, string> = {
  updates: 'Updates',
  support: 'Chats',
  manage_accounts: 'Accounts',
};
/**
 * The two kinds of website staff. The server keeps three permissions; the
 * website offers only these combinations. "Chats + Updates" also manages
 * accounts and the supervision setting.
 */
export const STAFF_TYPES: { id: 'chats' | 'chats_updates'; label: string; permissions: StaffPermission[]; description: string }[] = [
  { id: 'chats', label: 'Chats', permissions: ['support'],
    description: 'Reviews student requests, assigns guides, follows up and handles reports.' },
  { id: 'chats_updates', label: 'Chats + Updates', permissions: ['support', 'updates', 'manage_accounts'],
    description: 'Everything in Chats, plus posting Updates, staff accounts and the supervision setting.' },
];

/** "Chats", "Chats + Updates", or the raw list for any other combination. */
export function staffTypeLabel(permissions: StaffPermission[]) {
  const set = [...permissions].sort().join(',');
  const match = STAFF_TYPES.find((t) => [...t.permissions].sort().join(',') === set);
  if (match) return match.label;
  return permissions.length ? permissions.map((p) => PERMISSION_LABEL[p]).join(', ') : 'No access';
}

export const LIMITS = { message: 1000, question: 1000, reason: 500, note: 1000, title: 120, location: 120, body: 600, name: 60 };

export const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)?.label ?? 'Other';
export const languageLabel = (l: string | null) => (l ? LANGUAGES.find((x) => x.id === l)?.label ?? l : 'Any language');

/** null when fine, otherwise a short message for the person typing. */
export function checkText(text: string, max: number, what = 'a message'): string | null {
  const t = text.trim();
  if (!t) return `Write ${what} first.`;
  if (t.length > max) return `Keep it under ${max} characters.`;
  return null;
}
