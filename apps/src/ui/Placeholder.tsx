import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { colors, radius, space, type } from './theme';

// Grey blocks in the shape of cards, shown while a screen's content loads.
// Static on purpose: an animated shimmer costs frames on budget phones.
export function SkeletonCards({ count = 3 }: { count?: number }) {
  const { t } = useI18n();
  return (
    <View style={styles.cards} accessible accessibilityLabel={t('common.loading')} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={[styles.line, styles.lineWide]} />
          <View style={styles.line} />
          <View style={[styles.line, styles.lineShort]} />
        </View>
      ))}
    </View>
  );
}

// A whole screen's first frame: its real title, then placeholder cards. Shown
// the moment a tab opens for the first time, while the screen itself mounts.
export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} scrollEnabled={false}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <View style={[styles.line, styles.subtitle]} />
      <SkeletonCards />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.xl, gap: space.md },
  title: { ...type.screenTitle },
  subtitle: { width: '70%', marginBottom: space.xs },
  cards: { gap: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { height: 14, borderRadius: 7, backgroundColor: colors.surfaceMuted, width: '85%' },
  lineWide: { height: 18, width: '60%' },
  lineShort: { width: '40%' },
});
