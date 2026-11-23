import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { currentRadius, TRACKER } from './tracker';
import type { LiveTracking } from './useLiveTracking';
import { colors, radius, space, type } from '../ui/theme';

export type TapPurpose = 'reference' | 'checkpoint' | 'correct';

const HEADING_TEXT = ['uncalibrated (>50°)', 'low (±50°)', 'medium (±35°)', 'high (±20°)'];
const f = (v: number | null | undefined, digits = 1, unit = '') => (v === null || v === undefined || !Number.isFinite(v)
  ? '—' : `${v.toFixed(digits)}${unit}`);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/** Developer-visible readings for the walking experiment. */
export default function LiveTestPanel({ live, onTap }: { live: LiveTracking; onTap: (purpose: TapPurpose) => void }) {
  const { readings, reference, estimate, now, summary } = live;
  const [open, setOpen] = useState(true);
  const fix = readings.fix;
  const age = fix ? (now - fix.timestamp) / 1000 : null;
  const share = () => Share.share({ message: JSON.stringify({
    app: 'Bell Space live test', exportedAt: new Date().toISOString(),
    references: live.references, reference, summary: live.summary, checkpoints: live.log,
  }, null, 1) });
  return (
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide test readings' : 'Show test readings'}
        onPress={() => setOpen(!open)} hitSlop={6} style={styles.head}>
        <Text style={styles.title}>Live location test</Text>
        <Text style={styles.toggle}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      <Text style={styles.status}>{live.message ?? `Status: ${live.status}`}</Text>
      {open && (<>
        <Row label="GPS" value={fix ? `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}` : '—'} />
        <Row label="Accuracy" value={fix ? `±${f(fix.accuracy, 1, ' m')} · ${f(age, 0, ' s')} old` : '—'} />
        <Row label="Heading" value={readings.heading
          ? `${f(readings.heading.degrees, 0, '°')} · ${HEADING_TEXT[readings.heading.quality]}` : '—'} />
        <Row label="Steps" value={readings.stepsAvailable === false ? 'unavailable' : f(readings.steps, 0)} />
        <Row label="References" value={`${live.references.length} · ${reference
          ? `fit error ±${f(reference.residualMetres, 1, ' m')}` : 'need 3 to align the map'}`} />
        <Row label="Map estimate" value={estimate
          ? `${f(estimate.x, 1)}, ${f(estimate.y, 1)} · ±${f(currentRadius(estimate, now), 1, ' m')} · ${estimate.source} · ${live.quality}`
          : 'none'} />
        <Row label="Checkpoints" value={summary.checkpoints
          ? `${summary.checkpoints} · median ${f(summary.medianError, 1, ' m')} · max ${f(summary.maxError, 1, ' m')}`
          : '0'} />
        <Text style={styles.hint}>
          Precise (≤{TRACKER.preciseRadius} m) can advance steps; ≤{TRACKER.rerouteRadius} m can reroute.
        </Text>
        <View style={styles.actions}>
          <Action label={live.capturing ? 'Capturing…' : 'Add reference'} disabled={live.capturing || live.status !== 'on'}
            onPress={() => onTap('reference')} />
          <Action label="Checkpoint" onPress={() => onTap('checkpoint')} />
          <Action label="Set location" onPress={() => onTap('correct')} />
          <Action label="Share log" onPress={share} />
          <Action label="Reset" onPress={live.reset} />
        </View>
      </>)}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 3 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.overline },
  toggle: { fontSize: 13, fontWeight: '600', color: colors.brand },
  status: { ...type.caption, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  label: { fontSize: 13, color: colors.textMuted, width: 92 },
  value: { flex: 1, fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right' },
  hint: { ...type.caption, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  action: { paddingHorizontal: 10, minHeight: 36, borderRadius: radius.sm, justifyContent: 'center',
    backgroundColor: colors.surfaceMuted },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.brand },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
});
