import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAuth } from '../backend/auth';
import { ROLE_LABEL } from '../backend/chatLogic';
import { BACKEND } from '../backend/mode';
import { roleLabel, useServerAuth } from '../backend/server/auth';
import { LANGS, useI18n } from '../i18n';
import type { LiveStatus } from '../positioning/useLiveTracking';
import Icon from '../ui/Icon';
import { colors, radius, space, type } from '../ui/theme';
import { SignIn } from './ChatScreen';
import { ServerSignIn } from './SupportChatScreen';

function Row({ label, value, last, onPress }: { label: string; value: string; last?: boolean; onPress?: () => void }) {
  const row = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="text">{row}</Pressable> : row;
}

function SwitchRow({ label, hint, value, onChange, last }: {
  label: string; hint: string; value: boolean; onChange: (on: boolean) => void; last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.switchText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function ActionRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.row, styles.rowLast, pressed && styles.pressed]}>
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
}

/** The four app languages, each written in its own language. Saved on this phone. */
function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')}>
      {LANGS.map((l, i) => {
        const selected = l.id === lang;
        return (
          <Pressable key={l.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={l.name}
            onPress={() => setLang(l.id)}
            style={({ pressed }) => [styles.row, i === LANGS.length - 1 && styles.rowLast, pressed && styles.pressed]}>
            <View style={styles.switchText}>
              <Text style={[styles.rowLabel, selected && styles.selectedLabel]}>{l.name}</Text>
              {l.name !== l.english && <Text style={styles.rowHint}>{l.english}</Text>}
            </View>
            {selected && <Icon name="check" color={colors.brand} size={20} strokeWidth={2.4} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const LIVE_STATUS: Record<LiveStatus, string> = {
  off: 'Off', starting: 'Starting…', on: 'On while the app is open', denied: 'Permission off', error: 'Unavailable',
};
// Tapping Version this many times opens the developer tools (map and
// positioning tests). They are not part of the student settings.
const DEV_TAPS = 5;

export type DevTools = {
  unlocked: boolean; setUnlocked: (on: boolean) => void;
  liveOn: boolean; onLiveChange: (on: boolean) => void;
  liveTest: boolean; onLiveTestChange: (on: boolean) => void; liveStatus: LiveStatus;
  review: boolean; onReviewChange: (on: boolean) => void;
};

/** Sign-in status on the Bell Space server. */
function ServerAccount() {
  const { configured, me, signOut } = useServerAuth();
  const { t } = useI18n();
  if (!configured) {
    return (
      <View style={styles.group}>
        <Row label={t('settings.chat')} value={t('settings.notConnected')} last />
        <Text style={styles.groupNote}>{t('settings.notConnectedNote')}</Text>
      </View>
    );
  }
  if (!me) {
    return <View style={styles.signIn}><ServerSignIn intro={t('settings.signInIntro')} /></View>;
  }
  return (
    <View style={styles.group}>
      <Row label={t('settings.signedInAs')} value={me.display_name} />
      <Row label={t('settings.role')} value={roleLabel(me, t)} />
      <ActionRow label={t('common.signOut')} onPress={signOut} />
    </View>
  );
}

/** Sign-in status for Chat and posting updates on the Supabase pilot (fallback backend). */
function SupabaseAccount() {
  const { configured, session, profile, signOut } = useAuth();
  const { t } = useI18n();
  if (!configured) {
    return (
      <View style={styles.group}>
        <Row label={t('settings.chat')} value={t('settings.notConnected')} last />
        <Text style={styles.groupNote}>{t('settings.notConnectedNote')}</Text>
      </View>
    );
  }
  if (!session) {
    return <View style={styles.signIn}><SignIn intro={t('settings.signInIntro')} /></View>;
  }
  return (
    <View style={styles.group}>
      <Row label={t('settings.signedInAs')} value={profile ? profile.first_name || 'No name' : '…'} />
      <Row label={t('settings.role')} value={profile ? ROLE_LABEL[profile.role] : '…'} />
      <ActionRow label={t('common.signOut')} onPress={signOut} />
    </View>
  );
}

export default function SettingsScreen({ dev }: { dev: DevTools }) {
  const { t } = useI18n();
  const [taps, setTaps] = useState(0);
  const tapVersion = () => {
    const next = taps + 1;
    setTaps(next);
    if (next >= DEV_TAPS) { dev.setUnlocked(true); setTaps(0); }
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">{t('settings.title')}</Text>
      <Text style={styles.section}>{t('settings.account')}</Text>
      {BACKEND === 'server' ? <ServerAccount /> : <SupabaseAccount />}
      <Text style={styles.section}>{t('settings.language')}</Text>
      <LanguagePicker />
      <Text style={styles.note}>{t('settings.languageNote')}</Text>
      <Text style={styles.section}>{t('settings.about')}</Text>
      <View style={styles.group}>
        <Text style={styles.about}>{t('settings.aboutText')}</Text>
        <Row label={t('settings.version')} value="1.0.0" onPress={tapVersion} />
        <Row label={t('settings.school')} value="Burbank High School" last />
      </View>
      {dev.unlocked && (
        <>
          <Text style={styles.section}>Developer tools</Text>
          <View style={styles.group}>
            <SwitchRow label="Live location (experimental)" value={dev.liveOn} onChange={dev.onLiveChange}
              hint={`Floor 1 only. Asks for location and motion access when turned on. ${LIVE_STATUS[dev.liveStatus]}.`} />
            <SwitchRow label="Show positioning readings" value={dev.liveTest} onChange={dev.onLiveTestChange}
              hint="GPS accuracy, compass, steps and the map estimate, for walk tests." />
            <SwitchRow label="Show proposed routes" value={dev.review} onChange={dev.onReviewChange}
              hint="Unconfirmed walkways and doors, for the school walk-through." />
            <ActionRow label="Hide developer tools" onPress={() => dev.setUnlocked(false)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.xl, paddingBottom: 40 },
  title: { ...type.screenTitle, marginBottom: space.md },
  section: { ...type.overline, marginBottom: space.sm, marginTop: space.md, marginLeft: space.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', paddingVertical: space.xs },
  groupNote: { ...type.caption, paddingHorizontal: space.lg, paddingBottom: space.md },
  about: { ...type.body, paddingHorizontal: space.lg, paddingVertical: space.md, color: colors.text },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.lg, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  switchText: { flex: 1, paddingVertical: space.md, gap: 3 },
  rowHint: { ...type.caption },
  rowLabel: { ...type.body },
  selectedLabel: { fontWeight: '600', color: colors.brand },
  note: { ...type.caption, marginTop: space.sm, marginHorizontal: space.xs },
  rowValue: { fontSize: 15, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
  action: { fontSize: 16, fontWeight: '600', color: colors.brand },
  signIn: { marginBottom: space.xs },
  pressed: { opacity: 0.6 },
});
