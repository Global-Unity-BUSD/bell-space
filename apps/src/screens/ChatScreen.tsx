import { createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { acceptConversation, askGuide, endConversation, guidesAvailable, loadAccountName, loadChat, loadGuideSettings, loadMessages,
  reportConversation, resolveReport, sendMessage, setAvailable, watchConversations, watchMessages } from '../backend/api';
import { useAuth, type GuideSettings, type Profile } from '../backend/auth';
import { availabilityText, classify, LANGUAGES, languageLabel, MAX_TEXT, mergeMessages, partyNames, STATUS_LABEL,
  threadState, TOPICS, topicLabel, validateText, type Conversation, type Message, type Topic } from '../backend/chatLogic';
import { errorText } from '../backend/client';
import { Button, Card, Chip, Field, Notice, Segmented, StatusPill } from '../ui/controls';
import Icon from '../ui/Icon';
import { SkeletonCards } from '../ui/Placeholder';
import { colors, radius, space, type } from '../ui/theme';
import { useKeyboardInset } from '../ui/useKeyboardInset';

type ChatData = Awaited<ReturnType<typeof loadChat>>;
type Viewer = 'student' | 'guide' | 'reviewer';
// The queue also refreshes on a timer: a question another guide accepts stops
// being visible to you, so no realtime event reaches you for it.
const QUEUE_REFRESH_MS = 10_000;
// False while another tab is shown: Chat stops listening and polling, and
// reloads when it is opened again.
const ChatActive = createContext(true);

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function SignIn({ intro }: { intro: string }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    const e = await signIn(email, password);
    setBusy(false);
    if (e) setError(e);
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>Sign in</Text>
      <Text style={styles.muted}>{intro}</Text>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" textContentType="username" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password"
        autoComplete="password" onSubmitEditing={submit} />
      {error && <Notice text={error} tone="error" />}
      <Button label="Sign in" onPress={submit} busy={busy} disabled={!email.trim() || !password} />
    </Card>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
    </View>
  );
}

function ConversationRow({ c, viewer, onPress, action }: {
  c: Conversation; viewer: Viewer; onPress: () => void; action?: React.ReactNode;
}) {
  const names = partyNames(c, viewer);
  const other = viewer === 'student' ? (c.guide_id ? names.guide : 'Waiting for a guide') : names.student;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${topicLabel(c.topic)}, ${STATUS_LABEL[c.status]}, ${other}`}
      onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <StatusPill label={STATUS_LABEL[c.status]} tone={c.status} />
          <Text style={styles.rowMeta}>{topicLabel(c.topic)}{c.language ? ` · ${languageLabel(c.language)}` : ''} · {day(c.created_at)}</Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>{c.question}</Text>
        <Text style={styles.rowMeta}>{other}</Text>
      </View>
      {action}
    </Pressable>
  );
}

function AskForm({ profile, onAsked }: { profile: Profile; onAsked: (c: Conversation) => void }) {
  const [mode, setMode] = useState<'anonymous' | 'named'>('anonymous');
  const [topic, setTopic] = useState<Topic>('navigation');
  const [language, setLanguage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [available, setAvailableCount] = useState<{ key: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${topic}:${language}`;

  const active = useContext(ChatActive);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const check = () => guidesAvailable(topic, language)
      .then((count) => { if (live) setAvailableCount({ key: `${topic}:${language}`, count }); })
      .catch(() => {});
    check();
    const id = setInterval(check, 15_000);
    return () => { live = false; clearInterval(id); };
  }, [topic, language, active]);

  const status = availabilityText(available?.key === key ? available.count : null, topic, language);
  const send = async () => {
    const problem = validateText(question);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const c = await askGuide(topic, language, mode === 'anonymous', question);
      setQuestion('');
      onAsked(c);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>Ask a student guide</Text>
      <View style={styles.group}>
        <Text style={styles.label}>Ask as</Text>
        <Segmented label="Ask as" value={mode} onChange={setMode}
          options={[{ id: 'anonymous', label: 'Anonymous to guide' }, { id: 'named', label: 'Show my name' }]} />
        <Text style={styles.caption}>
          {mode === 'anonymous'
            ? 'The guide won’t see your name. The question is still linked to your account in case it is reported.'
            : `The guide sees your first name: ${profile.first_name || 'not set'}.`}
        </Text>
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Topic</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Topic">
          {TOPICS.map((t) => <Chip key={t.id} label={t.label} selected={topic === t.id} onPress={() => setTopic(t.id)} />)}
        </View>
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>Language (optional)</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Language">
          {LANGUAGES.map((l) => <Chip key={l.label} label={l.label} selected={language === l.id} onPress={() => setLanguage(l.id)} />)}
        </View>
      </View>
      <Field label="Your question" value={question} onChangeText={setQuestion} multiline maxLength={MAX_TEXT}
        placeholder="For example: how do I get to the Career Center?" />
      <Notice text={status.text} tone={status.none ? 'warn' : 'info'} />
      {error && <Notice text={error} tone="error" />}
      <Button label="Send question" icon="send" onPress={send} busy={busy} disabled={!question.trim()} />
    </Card>
  );
}

function GuidePanel({ profile, data, onOpen, onChanged }: {
  profile: Profile; data: ChatData; onOpen: (id: string) => void; onChanged: () => void;
}) {
  const [settings, setSettings] = useState<GuideSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadGuideSettings(profile.id).then((s) => { if (live) setSettings(s); }).catch(() => {});
    return () => { live = false; };
  }, [profile.id]);
  const { queue } = classify(data.conversations, data.owned, profile.id, 'guide', new Set());
  const toggle = async (on: boolean) => {
    setError(null);
    try { setSettings(await setAvailable(on)); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  const accept = async (id: string) => {
    setAccepting(id); setError(null);
    try { await acceptConversation(id); onChanged(); onOpen(id); } catch (e) { setError(errorText(e)); onChanged(); }
    setAccepting(null);
  };
  return (
    <>
      <Card>
        <View style={styles.switchRow}>
          <View style={styles.rowText}>
            <Text style={styles.cardTitle}>Available for questions</Text>
            <Text style={styles.caption}>
              {settings ? `${settings.topics.map((t) => topicLabel(t)).join(', ') || 'No topics'} · ${settings.languages.map(languageLabel).join(', ')}`
                : 'Your guide topics are set by the school.'}
            </Text>
          </View>
          <Switch value={settings?.available ?? false} onValueChange={toggle} disabled={!settings}
            accessibilityLabel="Available for questions" />
        </View>
        {!settings && <Notice text="Your guide settings haven’t been set up yet. Ask the pilot admin." tone="warn" />}
      </Card>
      <Text style={styles.section}>Waiting for a guide</Text>
      <Card style={styles.listCard}>
        {!settings?.available && <Text style={styles.empty}>Turn on availability to see questions for your topics.</Text>}
        {settings?.available && queue.length === 0 && <Text style={styles.empty}>No questions are waiting.</Text>}
        {settings?.available && queue.map((c) => (
          <ConversationRow key={c.id} c={c} viewer="guide" onPress={() => accept(c.id)}
            action={<Button label="Accept" onPress={() => accept(c.id)} busy={accepting === c.id} />} />
        ))}
        {error && <Notice text={error} tone="error" />}
      </Card>
    </>
  );
}

function StateCard({ state }: { state: ReturnType<typeof threadState> }) {
  return (
    <View style={[styles.state, styles[`state_${state.tone}`]]} accessibilityLiveRegion="polite">
      <Text style={styles.stateTitle}>{state.title}</Text>
      <Text style={styles.stateText}>{state.text}</Text>
    </View>
  );
}

function Thread({ conversation, viewer, reportIds, askedBy, onBack, onChanged }: {
  conversation: Conversation; viewer: Viewer; reportIds: string[]; askedBy?: string; onBack: () => void; onChanged: () => void;
}) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const inset = useKeyboardInset(container);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const [waiting, setWaiting] = useState<number | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const id = conversation.id;
  const names = partyNames(conversation, viewer);
  const active = useContext(ChatActive);

  useEffect(() => {
    if (!active) return;
    let live = true;
    loadMessages(id).then((m) => { if (live) setMessages((t) => mergeMessages(t, m)); }).catch((e) => setError(errorText(e)));
    const stop = watchMessages(id, (m) => setMessages((t) => mergeMessages(t, [m])));
    return () => { live = false; stop(); };
  }, [id, active]);
  // Reviewers see which account asked, even when it was anonymous to the guide.
  useEffect(() => {
    if (!askedBy) return;
    let live = true;
    loadAccountName(askedBy).then((n) => { if (live) setAccount(n); }).catch(() => {});
    return () => { live = false; };
  }, [askedBy]);
  const pending = conversation.status === 'pending';
  useEffect(() => {
    if (!pending || viewer !== 'student' || !active) return;
    let live = true;
    const check = () => guidesAvailable(conversation.topic, conversation.language)
      .then((n) => { if (live) setWaiting(n); }).catch(() => {});
    check();
    const id = setInterval(check, 15_000);
    return () => { live = false; clearInterval(id); };
  }, [pending, viewer, conversation.topic, conversation.language, active]);

  const send = async () => {
    const problem = validateText(draft);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const m = await sendMessage(id, draft);
      setDraft('');
      setMessages((t) => mergeMessages(t, [m]));
    } catch (e) { setError(errorText(e)); }
    setBusy(false);
  };
  const end = async () => {
    try { await endConversation(id); setConfirmEnd(false); onChanged(); } catch (e) { setError(errorText(e)); }
  };
  const report = async () => {
    const problem = validateText(reason);
    if (problem) { setError('Say briefly what went wrong.'); return; }
    try { await reportConversation(id, reason); setReported(true); setReporting(false); setReason(''); } catch (e) { setError(errorText(e)); }
  };
  const resolve = async () => {
    try { await Promise.all(reportIds.map(resolveReport)); onChanged(); onBack(); } catch (e) { setError(errorText(e)); }
  };
  const mine = (m: Message) => (viewer === 'student' ? m.from_student : viewer === 'guide' ? !m.from_student : false);
  const canWrite = conversation.status === 'active' && viewer !== 'reviewer';

  return (
    <View style={styles.thread} ref={container}>
      <View style={styles.threadHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={onBack} hitSlop={10} style={styles.back}>
          <Icon name="back" color={colors.brand} size={24} />
        </Pressable>
        <View style={styles.rowText}>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {viewer === 'reviewer' ? `${names.student} and ${names.guide}` : viewer === 'student' ? (conversation.guide_id ? names.guide : 'Waiting for a guide') : names.student}
          </Text>
          <Text style={styles.rowMeta}>{topicLabel(conversation.topic)}{conversation.language ? ` · ${languageLabel(conversation.language)}` : ''}</Text>
        </View>
        <StatusPill label={STATUS_LABEL[conversation.status]} tone={conversation.status} />
      </View>
      <ScrollView ref={scroller} style={styles.messages} contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} keyboardDismissMode="interactive">
        <StateCard state={threadState(conversation, viewer, waiting)} />
        {viewer === 'reviewer' && (
          <Notice tone="warn" text={`Review access: this conversation was reported. Asked by account: ${account ?? '…'}${conversation.anonymous ? ' (anonymous to the guide)' : ''}.`} />
        )}
        <View style={[styles.bubble, viewer === 'student' ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleLabel, viewer === 'student' && styles.bubbleLabelMine]}>{names.student} asked</Text>
          <Text style={[styles.bubbleText, viewer === 'student' && styles.bubbleTextMine]}>{conversation.question}</Text>
        </View>
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, mine(m) ? styles.bubbleMine : styles.bubbleTheirs]}>
            {viewer === 'reviewer' && <Text style={styles.bubbleLabel}>{m.from_student ? names.student : names.guide}</Text>}
            <Text style={[styles.bubbleText, mine(m) && styles.bubbleTextMine]}>{m.body}</Text>
            <Text style={[styles.bubbleTime, mine(m) && styles.bubbleTextMine]}>{time(m.created_at)}</Text>
          </View>
        ))}
        {reported && <Notice text="Thanks. A school reviewer will look at this conversation." />}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: space.sm + inset }]}>
        {error && <Notice text={error} tone="error" />}
        {reporting && (
          <View style={styles.group}>
            <Field label="What went wrong?" value={reason} onChangeText={setReason} multiline maxLength={500} />
            <View style={styles.actions}>
              <Button label="Send report" kind="danger" onPress={report} grow />
              <Button label="Cancel" kind="secondary" onPress={() => setReporting(false)} />
            </View>
          </View>
        )}
        {confirmEnd && (
          <View style={styles.actions}>
            <Button label="End conversation" kind="danger" onPress={end} grow />
            <Button label="Keep" kind="secondary" onPress={() => setConfirmEnd(false)} />
          </View>
        )}
        {canWrite && !reporting && !confirmEnd && (
          <View style={styles.inputRow}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Message" placeholderTextColor={colors.textFaint}
              style={styles.messageInput} multiline maxLength={MAX_TEXT} accessibilityLabel="Message" />
            <Pressable accessibilityRole="button" accessibilityLabel="Send message" onPress={send} disabled={busy || !draft.trim()}
              style={({ pressed }) => [styles.sendButton, (busy || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Icon name="send" color="#ffffff" size={20} />}
            </Pressable>
          </View>
        )}
        {!reporting && !confirmEnd && (
          <View style={styles.actions}>
            {conversation.status !== 'closed' && <Button label="End conversation" kind="secondary" onPress={() => setConfirmEnd(true)} />}
            {viewer !== 'reviewer' && !reported && <Button label="Report" kind="quiet" icon="flag" onPress={() => setReporting(true)} />}
            {viewer === 'reviewer' && reportIds.length > 0 && <Button label="Mark report resolved" kind="secondary" onPress={resolve} />}
          </View>
        )}
      </View>
    </View>
  );
}

function ChatHome({ profile }: { profile: Profile }) {
  const [data, setData] = useState<ChatData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const refresh = useCallback(() => {
    loadChat(profile.id).then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  }, [profile.id]);
  const active = useContext(ChatActive);
  useEffect(() => {
    if (!active) return;
    refresh();
    const stop = watchConversations(refresh);
    const id = profile.role === 'guide' ? setInterval(refresh, QUEUE_REFRESH_MS) : null;
    return () => { stop(); if (id) clearInterval(id); };
  }, [refresh, profile.role, active]);

  if (!data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title="Chat" />
        {error ? <Notice text={error} tone="error" /> : <SkeletonCards count={2} />}
      </ScrollView>
    );
  }
  const reportedIds = new Set(data.reports.map((r) => r.conversation_id));
  const lists = classify(data.conversations, data.owned, profile.id, profile.role, reportedIds);
  const open = openId ? data.conversations.find((c) => c.id === openId) : null;
  if (open) {
    const viewer: Viewer = data.owned.has(open.id) ? 'student' : open.guide_id === profile.id ? 'guide' : 'reviewer';
    return (
      <Thread conversation={open} viewer={viewer} onBack={() => setOpenId(null)} onChanged={refresh}
        askedBy={viewer === 'reviewer' ? data.owners.find((o) => o.conversation_id === open.id)?.student_id : undefined}
        reportIds={data.reports.filter((r) => r.conversation_id === open.id).map((r) => r.id)} />
    );
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header title="Chat" subtitle={profile.role === 'guide' ? 'Help students who ask for a guide.'
        : profile.role === 'admin' ? 'Review reported conversations.' : 'Ask an approved student guide for help.'} />
      {error && <Notice text={error} tone="error" />}
      {profile.role === 'student' && <AskForm profile={profile} onAsked={(c) => { refresh(); setOpenId(c.id); }} />}
      {profile.role === 'guide' && <GuidePanel profile={profile} data={data} onOpen={setOpenId} onChanged={refresh} />}
      {profile.role === 'admin' && (
        <>
          <Text style={styles.section}>Reported conversations</Text>
          <Card style={styles.listCard}>
            {lists.reviewing.length === 0 && <Text style={styles.empty}>No open reports. Reviewers can read a conversation only after it is reported.</Text>}
            {lists.reviewing.map((c) => <ConversationRow key={c.id} c={c} viewer="reviewer" onPress={() => setOpenId(c.id)} />)}
          </Card>
        </>
      )}
      {lists.guiding.length > 0 && (
        <>
          <Text style={styles.section}>Your conversations</Text>
          <Card style={styles.listCard}>
            {lists.guiding.map((c) => <ConversationRow key={c.id} c={c} viewer="guide" onPress={() => setOpenId(c.id)} />)}
          </Card>
        </>
      )}
      {lists.asked.length > 0 && (
        <>
          <Text style={styles.section}>Your questions</Text>
          <Card style={styles.listCard}>
            {lists.asked.map((c) => <ConversationRow key={c.id} c={c} viewer="student" onPress={() => setOpenId(c.id)} />)}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const HOW_IT_WORKS = [
  'Choose a topic and write your question. You can stay anonymous to the guide.',
  'An approved student guide for that topic accepts it.',
  'Message each other here until you have what you need.',
];

function HowItWorks() {
  return (
    <Card>
      <Text style={styles.cardTitle}>How Chat works</Text>
      <View style={styles.steps}>
        {HOW_IT_WORKS.map((t, i) => (
          <View key={t} style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>Conversations are private to you and your guide. School staff can review one only if it is reported.</Text>
    </Card>
  );
}

function ChatScreen({ active }: { active: boolean }) {
  return <ChatActive.Provider value={active}><ChatContent /></ChatActive.Provider>;
}

export default memo(ChatScreen);

function ChatContent() {
  const { configured, loading, session, profile, signOut } = useAuth();
  if (!configured) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title="Chat" subtitle="Ask an approved student guide for help finding your way or settling in." />
        <HowItWorks />
        <Notice text="Chat isn’t connected yet. It opens once the school finishes setting it up." tone="warn" />
      </ScrollView>
    );
  }
  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title="Chat" />
        <SkeletonCards count={2} />
      </ScrollView>
    );
  }
  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Header title="Chat" subtitle="Ask an approved student guide for help finding your way or settling in." />
        <HowItWorks />
        <SignIn intro="Sign in to ask or answer a question. The map, Q&A and Updates work without signing in." />
      </ScrollView>
    );
  }
  if (!profile) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title="Chat" />
        <Notice text="This account isn’t set up for Chat yet." tone="warn" />
        <Button label="Sign out" kind="secondary" onPress={signOut} />
      </ScrollView>
    );
  }
  return <ChatHome profile={profile} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.xl, paddingBottom: 48, gap: space.md },
  header: { gap: 4, marginBottom: space.xs },
  title: { ...type.screenTitle },
  muted: { ...type.bodyMuted },
  caption: { ...type.caption },
  cardTitle: { ...type.title, fontSize: 18 },
  label: { ...type.label },
  section: { ...type.overline, marginTop: space.sm, marginLeft: space.xs },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  listCard: { paddingVertical: space.xs, paddingHorizontal: 0, gap: 0 },
  empty: { ...type.bodyMuted, paddingHorizontal: space.lg, paddingVertical: space.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowText: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowTitle: { ...type.body, fontWeight: '500' },
  rowMeta: { ...type.caption },
  thread: { flex: 1, backgroundColor: colors.canvas },
  threadHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  threadTitle: { ...type.label, fontSize: 17 },
  messages: { flex: 1 },
  messagesContent: { padding: space.lg, gap: space.sm },
  state: { borderRadius: radius.md, padding: space.md, gap: 4, marginBottom: space.xs },
  state_pending: { backgroundColor: colors.previewBg },
  state_warn: { backgroundColor: colors.previewBg },
  state_active: { backgroundColor: '#e3f6e8' },
  state_closed: { backgroundColor: colors.surfaceMuted },
  stateTitle: { ...type.label },
  stateText: { ...type.caption, fontSize: 14, lineHeight: 19, color: colors.text },
  steps: { gap: space.sm },
  stepRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  stepNumberText: { fontSize: 13, fontWeight: '800', color: colors.brand },
  stepText: { ...type.body, flex: 1, fontSize: 15, lineHeight: 21 },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleLabel: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  bubbleLabelMine: { color: 'rgba(255,255,255,0.8)' },
  bubbleText: { ...type.body },
  bubbleTextMine: { color: '#ffffff' },
  bubbleTime: { fontSize: 11, color: colors.textFaint, alignSelf: 'flex-end' },
  composer: {
    gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm, backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  messageInput: {
    flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16, color: colors.text, backgroundColor: colors.canvas,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
});
