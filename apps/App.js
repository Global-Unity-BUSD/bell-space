import { StatusBar } from 'expo-status-bar';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from './src/backend/auth';
import { BACKEND } from './src/backend/mode';
import { ServerAuthProvider } from './src/backend/server/auth';
import { LanguageProvider, useI18n } from './src/i18n';
import { useLiveTracking } from './src/positioning/useLiveTracking';
import ChatScreen from './src/screens/ChatScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import QAScreen from './src/screens/QAScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SupportChatScreen from './src/screens/SupportChatScreen';
import UpdatesScreen from './src/screens/UpdatesScreen';
import ErrorBoundary from './src/ui/ErrorBoundary';
import { ScreenPlaceholder } from './src/ui/Placeholder';
import TabBar from './src/ui/TabBar';
import { colors, space, type } from './src/ui/theme';

// One tab's screen. It mounts the first time the tab opens, showing a
// placeholder for that first frame, and then stays mounted (hidden) so going
// back is instant and keeps its state.
/** @param {{ shown: boolean, title: string, children: import('react').ReactNode }} props */
function TabPanel({ shown, title, children }) {
  const [ready, setReady] = useState(shown);
  useEffect(() => {
    if (!shown || ready) return;
    const id = requestAnimationFrame(() => startTransition(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, [shown, ready]);
  return (
    <View style={[styles.body, !shown && styles.hidden]}>
      {ready ? children : shown ? <ScreenPlaceholder title={title} /> : null}
    </View>
  );
}

// Chat, Updates and sign-in use the Bell Space server, or the Supabase pilot
// as a fallback (EXPO_PUBLIC_BACKEND, see src/backend/mode.ts).
const Accounts = BACKEND === 'server' ? ServerAuthProvider : AuthProvider;
const Chat = BACKEND === 'server' ? SupportChatScreen : ChatScreen;

export default function App() {
  return <LanguageProvider><Main /></LanguageProvider>;
}

function Main() {
  const { t } = useI18n();
  // No welcome or sign-in screen: the app opens on Navigation.
  // The tab bar's highlight moves at once; the screen switch follows as
  // low-priority work, so the tap gets visible feedback in the next frame.
  const [highlight, setHighlight] = useState(/** @type {import('./src/ui/TabBar').TabId} */ ('navigation'));
  const [tab, setTab] = useState(/** @type {import('./src/ui/TabBar').TabId} */ ('navigation'));
  const highlightRef = useRef(highlight);
  // Developer tools (hidden in Settings): map review shows proposed
  // (unchecked) routes; live location is off until switched on there, which
  // is also when location and motion permission are first requested.
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [review, setReview] = useState(false);
  const [liveOn, setLiveOn] = useState(false);
  const [liveTest, setLiveTest] = useState(false);
  const live = useLiveTracking(liveOn);
  const openTab = useCallback((/** @type {import('./src/ui/TabBar').TabId} */ next) => {
    if (next === highlightRef.current) return;
    highlightRef.current = next;
    setHighlight(next);
    startTransition(() => setTab(next));
  }, []);
  // Hiding the developer tools also switches them off.
  const setDev = (/** @type {boolean} */ on) => {
    setDevUnlocked(on);
    if (!on) { setLiveOn(false); setLiveTest(false); setReview(false); }
  };
  return (
    <GestureHandlerRootView style={styles.root}>
      <Accounts>
        <SafeAreaProvider>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
              <Text style={styles.brand} accessibilityRole="header">Bell Space</Text>
              <Text style={styles.school}>Burbank High School</Text>
            </View>
            <View style={styles.body}>
              {/* Navigation is mounted from the start so the map is ready; it keeps its position between tabs. */}
              <TabPanel shown={tab === 'navigation'} title={t('tabs.navigation')}>
                <NavigationScreen review={review} live={liveOn ? live : null} liveTest={liveTest} />
              </TabPanel>
              {/* Chat and Updates pause while hidden and refresh when shown again. */}
              <TabPanel shown={tab === 'chat'} title={t('tabs.chat')}>
                <ErrorBoundary name={t('tabs.chat')}><Chat active={tab === 'chat'} /></ErrorBoundary>
              </TabPanel>
              <TabPanel shown={tab === 'updates'} title={t('tabs.updates')}>
                <ErrorBoundary name={t('tabs.updates')}><UpdatesScreen active={tab === 'updates'} /></ErrorBoundary>
              </TabPanel>
              <TabPanel shown={tab === 'qa'} title={t('tabs.qa')}><QAScreen onOpenTab={openTab} /></TabPanel>
              {tab === 'settings' && (
                <SettingsScreen dev={{
                  unlocked: devUnlocked, setUnlocked: setDev,
                  liveOn, onLiveChange: setLiveOn, liveTest, onLiveTestChange: setLiveTest,
                  liveStatus: liveOn ? live.status : 'off', review, onReviewChange: setReview,
                }} />
              )}
            </View>
            <TabBar active={highlight} onChange={openTab} />
            <StatusBar style="dark" />
          </SafeAreaView>
        </SafeAreaProvider>
      </Accounts>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  brand: { ...type.brand },
  school: { fontSize: 16, fontWeight: '500', color: colors.text, marginTop: 1 },
  body: { flex: 1 },
  hidden: { display: 'none' },
});
