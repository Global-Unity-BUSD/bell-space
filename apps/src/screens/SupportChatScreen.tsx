import { createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { LANGUAGES, languageLabel, LIMITS, TOPICS, type Me, type RequestMessage, type SupportRequest, type Topic } from '../../../shared/api';
import {
  declineRequest, loadRequest, loadSupport, markDone, reportRequest, sendMessage, submitRequest, withdrawRequest, type SupportOverview,
} from '../backend/server/api';
import { useServerAuth } from '../backend/server/auth';
import { useLive } from '../backend/server/live';
import {
  canSend, checkInput, mergeMessages, otherParty, senderLabel, splitLists, stateCard, STATUS_TONE, studentStatus, viewerOf, type Viewer,
} from '../backend/supportLogic';
import { useI18n, type Key, type Translator } from '../i18n';
import { Button, Card, Chip, Field, Notice, StatusPill } from '../ui/controls';
import Icon from '../ui/Icon';
import { SkeletonCards } from '../ui/Placeholder';
import { colors, radius, space, type } from '../ui/theme';
import { useKeyboardInset } from '../ui/useKeyboardInset';

// Chat on the Bell Space server: the staff-supervised support flow (CLEAR 2.0).
// Students ask; staff choose a trained student guide or keep it; the guide
// helps; staff follow up in the same thread. Staff work on the website.

// False while another tab is shown: Chat stops listening and reloads when opened again.
const ChatActive = createContext(true);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const time = (iso: string, locale: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
const day = (iso: string, locale: string) => new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
// Topic and request-language names in the app's language.
const topicName = (t: Translator['t'], topic: Topic) => t(`topic.${topic}`);
const KNOWN_LANGUAGES = ['en', 'es', 'hy', 'ru'];
const languageName = (t: Translator['t'], l: string) => (KNOWN_LANGUAGES.includes(l) ? t(`language.${l}` as Key) : languageLabel(l));
const meta = (t: Translator['t'], r: SupportRequest) => `${topicName(t, r.topic)}${r.language ? ` · ${languageName(t, r.language)}` : ''}`;

export function ServerSignIn({ intro }: { intro: string }) {
  const { signIn } = useServerAuth();
  const { t, phrase } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    const e = await signIn(email, password);
    setBusy(false);
    if (e) setError(phrase(e));
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>{t('common.signIn')}</Text>
      <Text style={styles.muted}>{intro}</Text>
      <Field label={t('common.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
        keyboardType="email-address" textContentType="username" autoComplete="email" />
      <Field label={t('common.password')} value={password} onChangeText={setPassword} secureTextEntry textContentType="password"
        autoComplete="password" onSubmitEditing={submit} />
      {error && <Notice text={error} tone="error" />}
      <Button label={t('common.signIn')} onPress={submit} busy={busy} disabled={!email.trim() || !password} />
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

const HOW_IT_WORKS: Key[] = ['chat.how1', 'chat.how2', 'chat.how3'];

function HowItWorks() {
  const { t } = useI18n();
  return (
    <Card>
      <Text style={styles.cardTitle}>{t('chat.howTitle')}</Text>
      <View style={styles.steps}>
        {HOW_IT_WORKS.map((key, i) => (
          <View key={key} style={styles.stepRow}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{t(key)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.caption}>{t('chat.howNote')}</Text>
    </Card>
  );
}

function RequestRow({ r, viewer, onPress }: { r: SupportRequest; viewer: Viewer; onPress: () => void }) {
  const { t, locale } = useI18n();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${topicName(t, r.topic)}, ${studentStatus(r.status, t)}, ${otherParty(r, viewer, t)}`}
      onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <StatusPill label={studentStatus(r.status, t)} tone={STATUS_TONE[r.status]} />
          <Text style={styles.rowMeta}>{meta(t, r)} · {day(r.created_at, locale)}</Text>
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>{r.question}</Text>
        <Text style={styles.rowMeta}>{otherParty(r, viewer, t)}</Text>
      </View>
    </Pressable>
  );
}

function AskForm({ staffReadsAll, onAsked }: { staffReadsAll: boolean; onAsked: (r: SupportRequest) => void }) {
  const { t, phrase } = useI18n();
  const [topic, setTopic] = useState<Topic>('navigation');
  const [language, setLanguage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    const problem = checkInput(question, LIMITS.question, 'check.question', t);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const r = await submitRequest(topic, language, question.trim());
      setQuestion('');
      onAsked(r);
    } catch (e) { setError(phrase(errorText(e))); } finally { setBusy(false); }
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>{t('chat.askTitle')}</Text>
      <View style={styles.group}>
        <Text style={styles.label}>{t('chat.topic')}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('chat.topic')}>
          {TOPICS.map((x) => <Chip key={x.id} label={topicName(t, x.id)} selected={topic === x.id} onPress={() => setTopic(x.id)} />)}
        </View>
      </View>
      <View style={styles.group}>
        <Text style={styles.label}>{t('chat.languageOptional')}</Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('chat.language')}>
          <Chip label={t('chat.anyLanguage')} selected={language === null} onPress={() => setLanguage(null)} />
          {LANGUAGES.map((l) => <Chip key={l.id} label={languageName(t, l.id)} selected={language === l.id} onPress={() => setLanguage(l.id)} />)}
        </View>
      </View>
      <Field label={t('chat.question')} value={question} onChangeText={setQuestion} multiline maxLength={LIMITS.question}
        placeholder={t('chat.questionPlaceholder')} />
      <Text style={styles.caption}>
        {t('chat.privacy')} {t(staffReadsAll ? 'chat.staffReadsAll' : 'chat.staffReadsReported')}
      </Text>
      {error && <Notice text={error} tone="error" />}
      <Button label={t('chat.sendQuestion')} icon="send" onPress={send} busy={busy} disabled={!question.trim()} />
    </Card>
  );
}

function Thread({ request, me, staffReadsAll, hint, onBack, onChanged }: {
  request: SupportRequest; me: Me; staffReadsAll: boolean; hint: number; onBack: () => void; onChanged: () => void;
}) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const inset = useKeyboardInset(container);
  const [messages, setMessages] = useState<RequestMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'report' | 'decline' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState(false);
  const active = useContext(ChatActive);
  const { t, phrase, locale } = useI18n();
  const id = request.id;
  const viewer = viewerOf(request, me.id);
  const lastId = messages.at(-1)?.id ?? 0;
  const lastRef = useRef(lastId);
  useEffect(() => { lastRef.current = lastId; });

  // Initial load, then only newer messages whenever a hint for this request arrives.
  useEffect(() => {
    if (!active) return;
    let live = true;
    loadRequest(id, lastRef.current).then((d) => { if (live) setMessages((t) => mergeMessages(t, d.messages)); })
      .catch((e) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [id, active, hint]);

  const send = async () => {
    const problem = checkInput(draft, LIMITS.message, 'check.message', t);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(null);
    try {
      const m = await sendMessage(id, draft.trim());
      setDraft('');
      setMessages((list) => mergeMessages(list, [m]));
    } catch (e) { setError(phrase(errorText(e))); }
    setBusy(false);
  };
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try { await fn(); setPanel(null); setReason(''); after?.(); onChanged(); } catch (e) { setError(phrase(errorText(e))); }
  };
  const writable = canSend(request, viewer);
  const open = request.status !== 'resolved';

  return (
    <View style={styles.thread} ref={container}>
      <View style={styles.threadHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('chat.backToChats')} onPress={onBack} hitSlop={10} style={styles.back}>
          <Icon name="back" color={colors.brand} size={24} />
        </Pressable>
        <View style={styles.rowText}>
          <Text style={styles.threadTitle}>{otherParty(request, viewer, t)}</Text>
          <Text style={styles.rowMeta}>{meta(t, request)}</Text>
        </View>
        <StatusPill label={studentStatus(request.status, t)} tone={STATUS_TONE[request.status]} />
      </View>
      <ScrollView ref={scroller} style={styles.messages} contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} keyboardDismissMode="interactive">
        {(() => {
          const s = stateCard(request, viewer, staffReadsAll, t);
          return (
            <View style={[styles.state, styles[`state_${s.tone}`]]} accessibilityLiveRegion="polite">
              <Text style={styles.stateTitle}>{s.title}</Text>
              <Text style={styles.stateText}>{s.text}</Text>
            </View>
          );
        })()}
        <View style={[styles.bubble, viewer === 'student' ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleLabel, viewer === 'student' && styles.bubbleLabelMine]}>
            {viewer === 'student' ? t('chat.youAsked') : t('chat.theyAsked', { name: request.student_name })}
          </Text>
          <Text style={[styles.bubbleText, viewer === 'student' && styles.bubbleTextMine]}>{request.question}</Text>
        </View>
        {messages.map((m) => {
          const mine = m.sender_id === me.id;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : m.sender_role === 'staff' ? styles.bubbleStaff : styles.bubbleTheirs]}>
              {!mine && <Text style={styles.bubbleLabel}>{senderLabel(m, t)}</Text>}
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{m.body}</Text>
              <Text style={[styles.bubbleTime, mine && styles.bubbleTextMine]}>{time(m.created_at, locale)}</Text>
            </View>
          );
        })}
        {reported && <Notice text={t('chat.reportThanks')} />}
      </ScrollView>
      <View style={[styles.composer, { paddingBottom: space.sm + inset }]}>
        {error && <Notice text={phrase(error)} tone="error" />}
        {panel === 'report' && (
          <View style={styles.group}>
            <Field label={t('chat.reportWhat')} value={reason} onChangeText={setReason} multiline maxLength={LIMITS.reason} />
            <View style={styles.actions}>
              <Button label={t('chat.sendReport')} kind="danger" grow onPress={() => {
                const problem = checkInput(reason, LIMITS.reason, 'check.reason', t);
                if (problem) { setError(problem); return; }
                act(() => reportRequest(id, reason.trim()), () => setReported(true));
              }} />
              <Button label={t('common.cancel')} kind="secondary" onPress={() => setPanel(null)} />
            </View>
          </View>
        )}
        {panel === 'decline' && (
          <View style={styles.group}>
            <Field label={t('chat.declineReason')} value={reason} onChangeText={setReason} maxLength={LIMITS.reason} />
            <View style={styles.actions}>
              <Button label={t('chat.declineRequest')} kind="danger" grow onPress={() => act(() => declineRequest(id, reason.trim() || null), onBack)} />
              <Button label={t('common.cancel')} kind="secondary" onPress={() => setPanel(null)} />
            </View>
          </View>
        )}
        {panel === 'withdraw' && (
          <View style={styles.actions}>
            <Button label={t('chat.withdrawQuestion')} kind="danger" grow onPress={() => act(() => withdrawRequest(id))} />
            <Button label={t('chat.keep')} kind="secondary" onPress={() => setPanel(null)} />
          </View>
        )}
        {writable && !panel && (
          <View style={styles.inputRow}>
            <TextInput value={draft} onChangeText={setDraft} placeholder={t('chat.message')} placeholderTextColor={colors.textFaint}
              style={styles.messageInput} multiline maxLength={LIMITS.message} accessibilityLabel={t('chat.message')} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('chat.sendMessage')} onPress={send} disabled={busy || !draft.trim()}
              style={({ pressed }) => [styles.sendButton, (busy || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Icon name="send" color="#ffffff" size={20} />}
            </Pressable>
          </View>
        )}
        {!panel && open && (
          <View style={styles.actions}>
            {viewer === 'guide' && request.status === 'with_guide' && (
              <>
                <Button label={t('chat.markDone')} kind="secondary" onPress={() => act(() => markDone(id, null))} />
                <Button label={t('chat.decline')} kind="quiet" onPress={() => setPanel('decline')} />
              </>
            )}
            {viewer === 'student' && request.status === 'submitted' && (
              <Button label={t('chat.withdraw')} kind="secondary" onPress={() => setPanel('withdraw')} />
            )}
            {!reported && request.status !== 'submitted' && <Button label={t('chat.report')} kind="quiet" icon="flag" onPress={() => setPanel('report')} />}
          </View>
        )}
      </View>
    </View>
  );
}

function ChatHome({ me }: { me: Me }) {
  const [data, setData] = useState<SupportOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  const active = useContext(ChatActive);
  const { t, phrase } = useI18n();
  const refresh = useCallback(() => {
    loadSupport().then((d) => {
      setData(d);
      setError(null);
      // A guide who declined no longer sees the request: back to the list.
      setOpenId((id) => (id && d.requests.some((r) => r.id === id) ? id : null));
    }).catch((e) => setError(phrase(errorText(e))));
  }, [phrase]);
  useEffect(() => { if (active) refresh(); }, [active, refresh]);
  useLive(active, (h) => {
    if (h.t === 'request' || h.t === 'resync') refresh();
    if (h.t === 'resync' || (h.t === 'message' && h.request === openId) || (h.t === 'request' && h.id === openId)) setHint((n) => n + 1);
  });

  if (!data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title={t('chat.title')} />
        {error ? <Notice text={error} tone="error" /> : <SkeletonCards count={2} />}
      </ScrollView>
    );
  }
  const staffReadsAll = data.supervision_mode === 'all_requests';
  const open = openId ? data.requests.find((r) => r.id === openId) : null;
  if (open) {
    return <Thread request={open} me={me} staffReadsAll={staffReadsAll} hint={hint} onBack={() => setOpenId(null)} onChanged={refresh} />;
  }
  const { asked, assigned } = splitLists(data.requests, me.id);
  const guide = Boolean(me.guide?.active) || assigned.length > 0;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header title={t('chat.title')} subtitle={t(guide ? 'chat.subtitleGuide' : 'chat.subtitleStudent')} />
      {error && <Notice text={error} tone="error" />}
      {guide && (
        <>
          <Text style={styles.section}>{t('chat.assigned')}</Text>
          <Card style={styles.listCard}>
            {assigned.length === 0 && <Text style={styles.empty}>{t('chat.assignedEmpty')}</Text>}
            {assigned.map((r) => <RequestRow key={r.id} r={r} viewer="guide" onPress={() => setOpenId(r.id)} />)}
          </Card>
        </>
      )}
      <AskForm staffReadsAll={staffReadsAll} onAsked={(r) => { refresh(); setOpenId(r.id); }} />
      {asked.length > 0 && (
        <>
          <Text style={styles.section}>{t('chat.yourQuestions')}</Text>
          <Card style={styles.listCard}>
            {asked.map((r) => <RequestRow key={r.id} r={r} viewer="student" onPress={() => setOpenId(r.id)} />)}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function ChatContent() {
  const { configured, loading, me, signOut } = useServerAuth();
  const { t } = useI18n();
  if (!configured) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title={t('chat.title')} subtitle={t('chat.subtitleGuest')} />
        <HowItWorks />
        <Notice text={t('chat.notConnected')} tone="warn" />
      </ScrollView>
    );
  }
  if (loading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title={t('chat.title')} />
        <SkeletonCards count={2} />
      </ScrollView>
    );
  }
  if (!me) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Header title={t('chat.title')} subtitle={t('chat.subtitleGuest')} />
        <HowItWorks />
        <ServerSignIn intro={t('chat.signInIntro')} />
      </ScrollView>
    );
  }
  if (me.kind === 'staff') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header title={t('chat.title')} />
        <Notice text={t('chat.staffNote')} />
        <Button label={t('common.signOut')} kind="secondary" onPress={signOut} />
      </ScrollView>
    );
  }
  return <ChatHome me={me} />;
}

function SupportChatScreen({ active }: { active: boolean }) {
  return <ChatActive.Provider value={active}><ChatContent /></ChatActive.Provider>;
}

export default memo(SupportChatScreen);

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
  bubbleStaff: { alignSelf: 'flex-start', backgroundColor: colors.brandSoft },
  bubbleLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
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
