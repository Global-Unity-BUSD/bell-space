// Chat pilot rules that don't need the network (tested in tests/pilot-app.test.cjs).
// Access control itself lives in the database (supabase/migrations).

export type Role = 'student' | 'guide' | 'admin';
export type Topic = 'navigation' | 'new_student' | 'clubs' | 'other';
export type ChatStatus = 'pending' | 'active' | 'closed';

export type Conversation = {
  id: string;
  topic: Topic;
  language: string | null;
  anonymous: boolean;
  student_name: string | null;
  question: string;
  status: ChatStatus;
  guide_id: string | null;
  guide_name: string | null;
  created_at: string;
  accepted_at: string | null;
  closed_at: string | null;
  closed_by: 'student' | 'guide' | 'reviewer' | null;
};
export type Message = { id: number; conversation_id: string; from_student: boolean; body: string; created_at: string };

export const TOPICS: { id: Topic; label: string }[] = [
  { id: 'navigation', label: 'Navigation' },
  { id: 'new_student', label: 'New student help' },
  { id: 'clubs', label: 'Clubs' },
  { id: 'other', label: 'Other' },
];
export const LANGUAGES: { id: string | null; label: string }[] = [
  { id: null, label: 'Any language' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'hy', label: 'Armenian' },
];
export const ROLE_LABEL: Record<Role, string> = { student: 'Student', guide: 'Student guide', admin: 'Editor / admin' };
export const STATUS_LABEL: Record<ChatStatus, string> = { pending: 'Pending', active: 'Active', closed: 'Closed' };
export const MAX_TEXT = 1000;

export const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)?.label ?? 'Other';
export const languageLabel = (l: string | null) => LANGUAGES.find((x) => x.id === l)?.label ?? l ?? 'Any language';

export function validateText(text: string): string | null {
  const t = text.trim();
  if (!t) return 'Write a message first.';
  if (t.length > MAX_TEXT) return `Keep it under ${MAX_TEXT} characters.`;
  return null;
}

/** What the student sees about guide availability before sending. */
export function availabilityText(count: number | null, topic: Topic, language: string | null) {
  const scope = `${topicLabel(topic)}${language ? ` in ${languageLabel(language)}` : ''}`;
  if (count === null) return { text: 'Checking for available guides…', none: false };
  if (count === 0) {
    return { text: `No guide is available for ${scope} right now. You can still send it: it stays Pending until a guide is free.`, none: true };
  }
  return { text: `${count} guide${count === 1 ? ' is' : 's are'} available for ${scope}.`, none: false };
}

/**
 * The conversations I asked. Reviewers can also read the owner rows of
 * reported conversations, so filter by account, not by visibility.
 */
export function ownedBy(owners: { conversation_id: string; student_id: string }[], me: string) {
  return new Set(owners.filter((o) => o.student_id === me).map((o) => o.conversation_id));
}

/** Sort what the signed-in user can see into their lists. */
export function classify(conversations: Conversation[], ownedIds: Set<string>, me: string, role: Role, reportedIds: Set<string>) {
  const newest = (a: Conversation, b: Conversation) => b.created_at.localeCompare(a.created_at);
  const asked = conversations.filter((c) => ownedIds.has(c.id)).sort(newest);
  const guiding = conversations.filter((c) => c.guide_id === me).sort(newest);
  const queue = role === 'guide'
    ? conversations.filter((c) => c.status === 'pending' && !c.guide_id && !ownedIds.has(c.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    : [];
  const reviewing = role === 'admin' ? conversations.filter((c) => reportedIds.has(c.id)).sort(newest) : [];
  return { asked, guiding, queue, reviewing };
}

/** How each side of a conversation is named for the viewer. */
export function partyNames(c: Conversation, viewer: 'student' | 'guide' | 'reviewer') {
  const student = c.anonymous ? 'Anonymous student' : c.student_name ?? 'Student';
  const guide = c.guide_name ? `${c.guide_name} (guide)` : 'Guide';
  return {
    student: viewer === 'student' ? 'You' : student,
    guide: viewer === 'guide' ? 'You' : guide,
  };
}

/**
 * The state card at the top of a conversation: what is happening and what
 * happens next, for the person viewing it. `available` is the number of
 * guides free for this topic (null while unknown).
 */
export function threadState(c: Conversation, viewer: 'student' | 'guide' | 'reviewer', available: number | null) {
  const scope = `${topicLabel(c.topic)}${c.language ? ` in ${languageLabel(c.language)}` : ''}`;
  const guide = c.guide_name ?? 'a student guide';
  if (c.status === 'pending') {
    if (viewer === 'student' && available === 0) {
      return { tone: 'warn' as const, title: 'No guide is available right now',
        text: `No student guide for ${scope} is available at the moment. Your question stays in the queue, and it opens here when a guide accepts. You can also end it and try again later.` };
    }
    return { tone: 'pending' as const, title: 'Waiting for a guide',
      text: viewer === 'student'
        ? `Your question is waiting for a student guide who helps with ${scope}. When one accepts, you can message them here.`
        : `This question is waiting for a guide for ${scope}.` };
  }
  if (c.status === 'active') {
    if (viewer === 'student') {
      return { tone: 'active' as const, title: `Connected with ${guide}`,
        text: `${c.guide_name ?? 'Your guide'} is an approved student guide for ${topicLabel(c.topic)}. ${c.anonymous
          ? 'Your name is hidden from them.' : 'They see your first name.'} New messages appear here.` };
    }
    if (viewer === 'guide') {
      return { tone: 'active' as const, title: `Connected with ${c.anonymous ? 'an anonymous student' : c.student_name ?? 'a student'}`,
        text: 'You accepted this question. New messages appear here. End the conversation when the student has what they need.' };
    }
    return { tone: 'active' as const, title: 'Conversation in progress', text: `Between a student and ${guide}.` };
  }
  return { tone: 'closed' as const, title: 'Conversation ended',
    text: `${c.closed_by ? `Ended by the ${c.closed_by}. ` : ''}No more messages can be sent.${viewer === 'student' ? ' You can ask a new question any time.' : ''}` };
}

/** Merge a realtime or fetched message into a thread, once, in order. */
export function mergeMessages(thread: Message[], incoming: Message[]) {
  const byId = new Map(thread.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
