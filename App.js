import { StatusBar } from 'expo-status-bar';
import { startTransition, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider } from './src/backend/auth';
import { useLiveTracking } from './src/positioning/useLiveTracking';
import ChatScreen from './src/screens/ChatScreen';
import NavigationScreen from './src/screens/NavigationScreen';
import QAScreen from './src/screens/QAScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import UpdatesScreen from './src/screens/UpdatesScreen';
import ErrorBoundary from './src/ui/ErrorBoundary';
import TabBar from './src/ui/TabBar';
import { colors, space, type } from './src/ui/theme';

export default function App() {
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
      <AuthProvider>
        <SafeAreaProvider>
          <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
              <Text style={styles.brand} accessibilityRole="header">Bell Space</Text>
              <Text style={styles.school}>Burbank High School</Text>
            </View>
            <View style={styles.body}>
              {/* Navigation stays mounted so the map keeps its position between tabs. */}
              <View style={[styles.body, tab !== 'navigation' && styles.hidden]}>
                <NavigationScreen review={review} live={liveOn ? live : null} liveTest={liveTest} />
              </View>
              {/* Chat and Updates also stay mounted; they pause while hidden and refresh when shown again. */}
              <View style={[styles.body, tab !== 'chat' && styles.hidden]}><ErrorBoundary name="Chat"><ChatScreen active={tab === 'chat'} /></ErrorBoundary></View>
              <View style={[styles.body, tab !== 'updates' && styles.hidden]}><ErrorBoundary name="Updates"><UpdatesScreen active={tab === 'updates'} /></ErrorBoundary></View>
              {tab === 'settings' && (
                <SettingsScreen dev={{
                  unlocked: devUnlocked, setUnlocked: setDev,
                  liveOn, onLiveChange: setLiveOn, liveTest, onLiveTestChange: setLiveTest,
                  liveStatus: liveOn ? live.status : 'off', review, onReviewChange: setReview,
                }} />
              )}
              {tab === 'qa' && <QAScreen onOpenTab={openTab} />}
            </View>
            <TabBar active={highlight} onChange={openTab} />
            <StatusBar style="dark" />
          </SafeAreaView>
        </SafeAreaProvider>
      </AuthProvider>
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
