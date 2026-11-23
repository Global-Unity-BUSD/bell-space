// Student/guide Chat rules for the Bell Space server (CLEAR 2.0 flow) that
// don't need the network (tested in tests/support-app.test.cjs). Access
// control itself is in the server's database (server/migrations).
import type { RequestMessage, RequestStatus, SupportRequest } from '../../../shared/api';

export type Viewer = 'student' | 'guide';
export type Tone = 'pending' | 'active' | 'closed';

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  submitted: 'pending', with_guide: 'active', follow_up: 'active', with_staff: 'active', resolved: 'closed',
};

/** What the student sees as the status (shorter than the staff labels). */
export const STUDENT_STATUS: Record<RequestStatus, string> = {
  submitted: 'Staff review', with_guide: 'With a guide', follow_up: 'Staff follow-up', with_staff: 'With staff', resolved: 'Resolved',
};

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
export function otherParty(r: SupportRequest, viewer: Viewer) {
  if (viewer === 'guide') return r.student_name;
  if (r.status === 'with_staff' || (r.status === 'follow_up' && r.staff_name)) return r.staff_name ?? 'School staff';
  if (r.guide_name) return `${r.guide_name} (student guide)`;
  return r.status === 'resolved' ? 'Resolved' : 'Waiting for staff review';
}

/** The card at the top of a thread: what is happening and what comes next. */
export function stateCard(r: SupportRequest, viewer: Viewer, staffReadsAll: boolean) {
  const watch = staffReadsAll ? 'School support staff can read this conversation.' : 'School staff can read it if it is reported.';
  if (viewer === 'guide') {
    if (r.status === 'with_guide') {
      return { tone: 'active' as const, title: 'Assigned to you by staff',
        text: `Help ${r.student_name} with this question. Mark it done when they have what they need, or decline it so staff can choose someone else. ${watch}` };
    }
    if (r.status === 'follow_up') {
      return { tone: 'active' as const, title: 'Marked done', text: `Staff will follow up with ${r.student_name}. You can still reply here.` };
    }
    return { tone: 'closed' as const, title: 'Resolved', text: 'This request is closed. No more messages can be sent.' };
  }
  switch (r.status) {
    case 'submitted':
      return { tone: 'pending' as const, title: 'Waiting for staff review',
        text: 'School staff read each request and choose a trained student guide, or help you themselves. You can message here once someone is assigned.' };
    case 'with_guide':
      return { tone: 'active' as const, title: `Connected with ${r.guide_name ?? 'a student guide'}`,
        text: `Staff chose ${r.guide_name ?? 'a trained student guide'} to help you. They see your name. ${watch}` };
    case 'follow_up':
      return { tone: 'active' as const, title: 'Staff follow-up',
        text: 'Your guide has finished. A staff member will check in with you here to make sure you have what you need.' };
    case 'with_staff':
      return { tone: 'active' as const, title: `With ${r.staff_name ?? 'school staff'}`,
        text: 'A staff member is handling this request. No student guide sees it.' };
    default:
      return { tone: 'closed' as const, title: 'Resolved',
        text: `${r.resolution_note ? `${r.resolution_note} ` : ''}No more messages can be sent. You can ask a new question any time.` };
  }
}

/** Merge fetched messages into a thread, once each, in order. */
export function mergeMessages(thread: RequestMessage[], incoming: RequestMessage[]) {
  const byId = new Map(thread.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Label above someone else's message: "Gina · Student guide", "Sofia · Staff". */
export function senderLabel(m: RequestMessage) {
  return `${m.sender_name} · ${m.sender_role === 'staff' ? 'Staff' : m.sender_role === 'guide' ? 'Student guide' : 'Student'}`;
}
