import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import Icon, { type IconName } from './Icon';
import { colors, radius, shadow, space, type } from './theme';

// Shared controls for the Chat, Updates and Settings screens.

export function Button({ label, onPress, kind = 'primary', icon, disabled, busy, grow }: {
  label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: IconName; disabled?: boolean; busy?: boolean; grow?: boolean;
}) {
  const color = kind === 'primary' ? '#ffffff' : kind === 'danger' ? colors.danger : colors.brand;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [styles.button, styles[kind], grow && styles.grow, (disabled || busy) && styles.disabled,
        pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={color} /> : icon && <Icon name={icon} color={color} size={18} strokeWidth={2.2} />}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** Two or three mutually exclusive options, full width. */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={o.label}
            onPress={() => onChange(o.id)} style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.textFaint} accessibilityLabel={label}
        {...input} style={[styles.input, input.multiline && styles.inputMultiline, input.style]} />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatusPill({ label, tone, style }: {
  label: string; tone: 'pending' | 'active' | 'closed' | 'draft' | 'sample'; style?: object;
}) {
  return (
    <View style={[styles.pill, styles[`pill_${tone}`], style]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'error' }) {
  return (
    <View style={[styles.notice, styles[`notice_${tone}`]]} accessibilityLiveRegion="polite">
      <Icon name="info" color={tone === 'error' ? colors.danger : tone === 'warn' ? colors.previewText : colors.textMuted} size={16} />
      <Text style={[styles.noticeText, tone === 'error' && { color: colors.danger }, tone === 'warn' && { color: colors.previewText }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 46,
    paddingHorizontal: space.lg, borderRadius: radius.sm,
  },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: colors.surfaceMuted },
  quiet: { backgroundColor: 'transparent', paddingHorizontal: space.sm },
  danger: { backgroundColor: colors.dangerSoft },
  grow: { flexGrow: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: {
    minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 15, fontWeight: '500', color: colors.text },
  chipTextSelected: { color: '#ffffff', fontWeight: '600' },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: 3 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.sm - 3, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.surface, ...shadow, shadowOpacity: 0.08, elevation: 1 },
  segmentText: { fontSize: 14.5, fontWeight: '500', color: colors.textMuted, textAlign: 'center', paddingHorizontal: 4 },
  segmentTextSelected: { color: colors.text, fontWeight: '700' },
  field: { gap: 6 },
  fieldLabel: { ...type.label },
  input: {
    minHeight: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: space.md, fontSize: 16, color: colors.text,
  },
  inputMultiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  hint: { ...type.caption },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  pill_pending: { backgroundColor: colors.previewBg },
  pill_active: { backgroundColor: '#e3f6e8' },
  pill_closed: { backgroundColor: colors.surfaceMuted },
  pill_draft: { backgroundColor: colors.surfaceMuted },
  pill_sample: { backgroundColor: colors.brandSoft },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillText_pending: { color: colors.previewText },
  pillText_active: { color: '#17803d' },
  pillText_closed: { color: colors.textMuted },
  pillText_draft: { color: colors.textMuted },
  pillText_sample: { color: colors.brand },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: radius.sm, padding: space.md },
  notice_info: { backgroundColor: colors.surfaceMuted },
  notice_warn: { backgroundColor: colors.previewBg },
  notice_error: { backgroundColor: colors.dangerSoft },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.textMuted },
});
