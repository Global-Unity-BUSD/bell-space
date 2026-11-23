import type { RealtimeChannel } from '@supabase/supabase-js';

import { backend } from './client';
import type { GuideSettings } from './auth';
import { ownedBy, type Conversation, type Message, type Topic } from './chatLogic';
import type { Update } from './updatesLogic';

// Thin wrappers over the database. Every call runs as the signed-in account;
// the database decides what it may see or do.

function db() {
  if (!backend) throw new Error('Not connected');
  return backend;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data as T;
}

// ---- chat

type Owner = { conversation_id: string; student_id: string };

export async function loadChat(me: string) {
  const [conversations, owners, reports] = await Promise.all([
    db().from('conversations').select('*').order('created_at', { ascending: false }).limit(100),
    db().from('conversation_owners').select('conversation_id, student_id'),
    db().from('reports').select('id, conversation_id, reason, created_at, resolved_at').is('resolved_at', null),
  ]);
  if (conversations.error) throw conversations.error;
  return {
    conversations: (conversations.data ?? []) as Conversation[],
    owned: ownedBy((owners.data ?? []) as Owner[], me),
    owners: (owners.data ?? []) as Owner[],
    reports: (reports.data ?? []) as { id: string; conversation_id: string; reason: string; created_at: string }[],
  };
}

export const guidesAvailable = (topic: Topic, language: string | null) =>
  rpc<number>('guides_available', { p_topic: topic, p_language: language });
export const askGuide = (topic: Topic, language: string | null, anonymous: boolean, question: string) =>
  rpc<Conversation>('ask_guide', { p_topic: topic, p_language: language, p_anonymous: anonymous, p_question: question });
export const acceptConversation = (id: string) => rpc<Conversation>('accept_conversation', { p_id: id });
export const sendMessage = (id: string, body: string) => rpc<Message>('send_message', { p_id: id, p_body: body });
export const endConversation = (id: string) => rpc<Conversation>('end_conversation', { p_id: id });
export const reportConversation = (id: string, reason: string) => rpc<string>('report_conversation', { p_id: id, p_reason: reason });
export const resolveReport = (id: string) => rpc<null>('resolve_report', { p_id: id });
export const setAvailable = (available: boolean) => rpc<GuideSettings>('set_available', { p_available: available });

export async function loadGuideSettings(id: string) {
  const { data } = await db().from('guide_settings').select('*').eq('guide_id', id).maybeSingle();
  return (data as GuideSettings | null) ?? null;
}

/** First name of an account (admins only, for reported conversations). */
export async function loadAccountName(id: string) {
  const { data } = await db().from('profiles').select('first_name').eq('id', id).maybeSingle();
  return (data as { first_name: string } | null)?.first_name ?? null;
}

export async function loadMessages(conversationId: string) {
  const { data, error } = await db().from('messages').select('*').eq('conversation_id', conversationId).order('id');
  if (error) throw error;
  return (data ?? []) as Message[];
}

/** Calls back on any visible change to conversations (new questions, accepts, endings). */
export function watchConversations(onChange: () => void): () => void {
  const channel: RealtimeChannel = db().channel(`conversations-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, onChange)
    .subscribe();
  return () => { db().removeChannel(channel); };
}

/** New messages in one conversation, as they arrive. */
export function watchMessages(conversationId: string, onMessage: (m: Message) => void): () => void {
  const channel = db().channel(`messages-${conversationId}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new as Message))
    .subscribe();
  return () => { db().removeChannel(channel); };
}

// ---- updates

export async function loadUpdates() {
  const { data, error } = await db().from('updates').select('*').order('published_at', { ascending: false, nullsFirst: true }).limit(50);
  if (error) throw error;
  const list = (data ?? []) as Update[];
  const paths = list.map((u) => u.photo_path).filter((p): p is string => Boolean(p));
  const photos: Record<string, string> = {};
  if (paths.length) {
    const signed = await db().storage.from('update-photos').createSignedUrls(paths, 3600);
    for (const s of signed.data ?? []) if (s.path && s.signedUrl) photos[s.path] = s.signedUrl;
  }
  return { list, photos };
}

export function watchUpdates(onChange: () => void): () => void {
  const channel = db().channel(`updates-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, onChange)
    .subscribe();
  return () => { db().removeChannel(channel); };
}

export type UpdateFields = Pick<Update, 'title' | 'starts_at' | 'location' | 'body' | 'photo_path' | 'status'>;

export async function saveUpdate(id: string | null, fields: UpdateFields) {
  const query = id ? db().from('updates').update(fields).eq('id', id) : db().from('updates').insert(fields);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Update;
}

/** Upload a picked photo; returns its path in the bucket. */
export async function uploadPhoto(uri: string, mimeType: string | undefined) {
  const type = mimeType ?? 'image/jpeg';
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const bytes = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await db().storage.from('update-photos').upload(path, bytes, { contentType: type });
  if (error) throw error;
  return path;
}

export async function removePhoto(path: string) {
  await db().storage.from('update-photos').remove([path]);
}
