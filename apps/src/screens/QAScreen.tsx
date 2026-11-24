import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { QA_CATEGORIES, QA_ENTRIES, searchQa, type QaCategory, type QaEntry, type QaLink } from '../content/qa';
import { useI18n } from '../i18n';
import { Button, Chip } from '../ui/controls';
import Icon from '../ui/Icon';
import { colors, radius, space, type } from '../ui/theme';

function Entry({ entry, open, onToggle, onLink }: {
  entry: QaEntry; open: boolean; onToggle: () => void; onLink: (tab: QaLink) => void;
}) {
  const { t, qa } = useI18n();
  const question = qa(entry.id)?.q ?? entry.question;
  const answer = qa(entry.id)?.a ?? entry.answer;
  return (
    <View style={styles.entry}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={question}
        onPress={onToggle} style={({ pressed }) => [styles.question, pressed && styles.pressed]}>
        <Text style={styles.questionText}>{question}</Text>
        <View style={[styles.chevron, open && styles.chevronOpen]}><Icon name="back" color={colors.textMuted} size={18} /></View>
      </Pressable>
      {open && (
        <View style={styles.answer}>
          <Text style={styles.answerText}>{answer}</Text>
          {entry.link && (
            <View style={styles.linkRow}>
              <Button label={t(`qa.open.${entry.link}`)} kind="secondary" onPress={() => onLink(entry.link as QaLink)} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function QAScreen({ onOpenTab }: { onOpenTab: (tab: QaLink) => void }) {
  const { t, qa, qaCategory } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<QaCategory | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The translation is searched too, so either language finds an answer.
  const results = useMemo(() => searchQa(QA_ENTRIES, query, category, (e) => {
    const tr = qa(e.id);
    return tr ? `${tr.q} ${tr.a} ${qaCategory(e.category) ?? ''}` : '';
  }), [query, category, qa, qaCategory]);
  const label = (c: { id: QaCategory; label: string }) => qaCategory(c.id) ?? c.label;
  // Open search results automatically only when there are a few.
  const autoOpen = Boolean(query.trim()) && results.length <= 3;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">{t('qa.title')}</Text>
        <Text style={styles.muted}>{t('qa.subtitle')}</Text>
      </View>
      <View style={styles.search}>
        <Icon name="search" color={colors.textMuted} size={20} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('qa.search')} placeholderTextColor={colors.textFaint}
          style={styles.searchInput} accessibilityLabel={t('qa.search')} autoCorrect={false} clearButtonMode="while-editing"
          returnKeyType="search" />
      </View>
      {/* One scrolling row of section filters, edge to edge. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}
        contentContainerStyle={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('qa.section')}>
        <Chip label={t('qa.all')} selected={category === null} onPress={() => setCategory(null)} />
        {QA_CATEGORIES.map((c) => <Chip key={c.id} label={label(c)} selected={category === c.id} onPress={() => setCategory(c.id)} />)}
      </ScrollView>
      {QA_CATEGORIES.filter((c) => !category || c.id === category).map((c) => {
        const inCategory = results.filter((e) => e.category === c.id);
        if (!inCategory.length) return null;
        return (
          <View key={c.id} style={styles.group}>
            <Text style={styles.section}>{label(c)}</Text>
            <View style={styles.list}>
              {inCategory.map((e) => (
                <Entry key={e.id} entry={e} open={autoOpen || openId === e.id} onLink={onOpenTab}
                  onToggle={() => setOpenId(openId === e.id ? null : e.id)} />
              ))}
            </View>
          </View>
        );
      })}
      {results.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('qa.noMatch')}</Text>
          <Text style={styles.muted}>{t('qa.noMatchHint')}</Text>
        </View>
      )}
      <View style={styles.askCard}>
        <Text style={styles.askTitle}>{t('qa.askTitle')}</Text>
        <Text style={styles.askText}>{t('qa.askText')}</Text>
        <Button label={t('qa.askButton')} icon="chat" onPress={() => onOpenTab('chat')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.xl, paddingBottom: 48, gap: space.md },
  header: { gap: 4, marginBottom: space.xs },
  title: { ...type.screenTitle },
  muted: { ...type.bodyMuted },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: radius.pill, paddingHorizontal: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 17, color: colors.text, height: '100%' },
  chipScroll: { marginHorizontal: -space.xl, flexGrow: 0 },
  chips: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl },
  group: { gap: space.sm },
  section: { ...type.overline, marginTop: space.sm, marginLeft: space.xs },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  entry: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  question: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 54 },
  questionText: { ...type.body, fontWeight: '600', flex: 1 },
  chevron: { transform: [{ rotate: '180deg' }] },
  chevronOpen: { transform: [{ rotate: '270deg' }] },
  answer: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  answerText: { ...type.body, color: colors.text, lineHeight: 23 },
  linkRow: { flexDirection: 'row' },
  empty: { gap: space.sm, alignItems: 'flex-start', paddingVertical: space.md },
  emptyTitle: { ...type.label },
  askCard: { backgroundColor: colors.brandSoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm, marginTop: space.sm },
  askTitle: { ...type.title, fontSize: 18 },
  askText: { ...type.body, color: colors.text },
  pressed: { opacity: 0.6 },
});

export default memo(QAScreen);
