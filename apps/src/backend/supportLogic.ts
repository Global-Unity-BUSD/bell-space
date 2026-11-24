// Student/guide Chat rules for the Bell Space server (CLEAR 2.0 flow) that
// don't need the network (tested in tests/support-app.test.cjs). Access
// control itself is in the server's database (server/migrations).
import type { RequestMessage, RequestStatus, SupportRequest } from '../../../shared/api';

import { EN, type Translator } from '../i18n/core.ts';

// Each text helper takes the current language's `t` (English by default).
type T = Translator['t'];

export type Viewer = 'student' | 'guide';
export type Tone = 'pending' | 'active' | 'closed';

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  submitted: 'pending', with_guide: 'active', follow_up: 'active', with_staff: 'active', resolved: 'closed',
};

/** What the student sees as the status (shorter than the staff labels). */
export const studentStatus = (status: RequestStatus, t: T = EN.t) => t(`status.${status}`);

/** Requests I asked, and (guides) requests staff assigned to me. Newest activity first; resolved last. */
export function splitLists(requests: SupportRequest[], me: string) {
  const order = (a: SupportRequest, b: SupportRequest) =>
    Number(a.status === 'resolved') - Number(b.status === 'resolved') || b.updated_at.localeCompare(a.updated_at);
  return {
    asked: requests.filter((r) => r.student_id === me).sort(order),
    assigned: requests.filter((r) => r.guide_id === me).sort(order),
  };
}

export const viewerOf = (r: SupportRequest, me: string): Viewer => (r.student_id === me ? 'student' : 'guide');

/** Whether this person can write in the thread now (the server checks too). */
export function canSend(r: SupportRequest, viewer: Viewer) {
  if (viewer === 'student') return r.status === 'with_guide' || r.status === 'follow_up' || r.status === 'with_staff';
  return r.status === 'with_guide' || r.status === 'follow_up';
}

/** Who the conversation is with, for the list and the thread header. */
export function otherParty(r: SupportRequest, viewer: Viewer, t: T = EN.t) {
  if (viewer === 'guide') return r.student_name;
  if (r.status === 'with_staff' || (r.status === 'follow_up' && r.staff_name)) return r.staff_name ?? t('party.schoolStaff');
  if (r.guide_name) return t('party.guide', { name: r.guide_name });
  return t(r.status === 'resolved' ? 'party.resolved' : 'party.waiting');
}

/** The card at the top of a thread: what is happening and what comes next. */
export function stateCard(r: SupportRequest, viewer: Viewer, staffReadsAll: boolean, t: T = EN.t) {
  const watch = t(staffReadsAll ? 'state.watchAll' : 'state.watchReported');
  if (viewer === 'guide') {
    if (r.status === 'with_guide') {
      return { tone: 'active' as const, title: t('state.guideAssignedTitle'),
        text: t('state.guideAssignedText', { student: r.student_name, watch }) };
    }
    if (r.status === 'follow_up') {
      return { tone: 'active' as const, title: t('state.guideDoneTitle'), text: t('state.guideDoneText', { student: r.student_name }) };
    }
    return { tone: 'closed' as const, title: t('state.resolvedTitle'), text: t('state.guideResolvedText') };
  }
  switch (r.status) {
    case 'submitted':
      return { tone: 'pending' as const, title: t('state.submittedTitle'), text: t('state.submittedText') };
    case 'with_guide':
      return { tone: 'active' as const, title: t('state.withGuideTitle', { guide: r.guide_name ?? t('state.aGuide') }),
        text: t('state.withGuideText', { guide: r.guide_name ?? t('state.aTrainedGuide'), watch }) };
    case 'follow_up':
      return { tone: 'active' as const, title: t('state.followUpTitle'), text: t('state.followUpText') };
    case 'with_staff':
      return { tone: 'active' as const, title: t('state.withStaffTitle', { staff: r.staff_name ?? t('state.schoolStaff') }),
        text: t('state.withStaffText') };
    default:
      // The resolution note is staff's own words: it stays as written.
      return { tone: 'closed' as const, title: t('state.resolvedTitle'),
        text: `${r.resolution_note ? `${r.resolution_note} ` : ''}${t('state.resolvedText')}` };
  }
}

/** Merge fetched messages into a thread, once each, in order. */
export function mergeMessages(thread: RequestMessage[], incoming: RequestMessage[]) {
  const byId = new Map(thread.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Label above someone else's message: "Gina · Student guide", "Sofia · Staff". */
export function senderLabel(m: RequestMessage, t: T = EN.t) {
  return `${m.sender_name} · ${t(m.sender_role === 'staff' ? 'sender.staff' : m.sender_role === 'guide' ? 'sender.guide' : 'sender.student')}`;
}

/** null when fine, otherwise a short message for the person typing. */
export function checkInput(text: string, max: number, empty: 'check.message' | 'check.question' | 'check.reason', t: T = EN.t) {
  const trimmed = text.trim();
  if (!trimmed) return t(empty);
  if (trimmed.length > max) return t('check.tooLong', { max });
  return null;
}
