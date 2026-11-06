import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from './Icon';
import { colors } from './theme';

export type TabId = 'updates' | 'navigation' | 'chat' | 'qa' | 'settings';
export const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'updates', label: 'Updates', icon: 'updates' },
  { id: 'navigation', label: 'Navigation', icon: 'navigation' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'qa', label: 'Q&A', icon: 'qa' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const color = selected ? colors.brand : colors.textMuted;
        return (
          <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected }}
            accessibilityLabel={tab.label} onPress={() => onChange(tab.id)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
            <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
              <Icon name={tab.icon} color={color} size={24} strokeWidth={selected ? 2.2 : 1.8} />
            </View>
            <Text style={[styles.label, { color }, selected && styles.selectedLabel]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: colors.surface, paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 50, gap: 2 },
  pressed: { opacity: 0.6 },
  // The selected highlight is a pill with fully round ends.
  iconWrap: { width: 56, height: 32, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iconWrapSelected: { backgroundColor: colors.brandSoft },
  label: { fontSize: 11.5, fontWeight: '500' },
  selectedLabel: { fontWeight: '700' },
});
