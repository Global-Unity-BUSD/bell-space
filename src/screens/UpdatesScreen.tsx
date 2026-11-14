import * as ImagePicker from 'expo-image-picker';
import { memo, useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

import { loadUpdates, removePhoto, saveUpdate, uploadPhoto, watchUpdates, type UpdateFields } from '../backend/api';
import { useAuth } from '../backend/auth';
import { errorText } from '../backend/client';
import { dateBadge, feedOrder, formatWhen, LIMITS, SAMPLE_UPDATE, splitWhen, validateUpdate, type Update,
  type UpdateDraft } from '../backend/updatesLogic';
import { Button, Card, Field, Notice, StatusPill } from '../ui/controls';
import Icon from '../ui/Icon';
import { SkeletonCards } from '../ui/Placeholder';
import { colors, radius, space, type } from '../ui/theme';

type Feed = Awaited<ReturnType<typeof loadUpdates>>;
type Picked = { uri: string; mimeType?: string };

// Bundled photos for sample content only (see assets/photos/README.md). Real
// updates carry their own uploaded photo.
const SAMPLE_PHOTOS: Record<string, ImageSourcePropType> = {
  'Sample event: Home football game': require('../../assets/photos/football-game.jpg'),
};

/** A photo cropped to a 16:9 frame (the frame sets the size, not the image). */
function Photo({ source, label, flush }: { source: ImageSourcePropType; label: string; flush?: boolean }) {
  return (
    <View style={[styles.photo, flush && styles.cardPhoto]}>
      {/* Explicit size: a bundled image's own dimensions would otherwise win (react-native-web). */}
      <Image source={source} style={styles.photoImage} resizeMode="cover" accessibilityIgnoresInvertColors
        accessibilityLabel={label} />
    </View>
  );
}

function DateBadge({ iso }: { iso: string | null }) {
  const badge = dateBadge(iso);
  return (
    <View style={styles.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {badge ? (
        <>
          <Text style={styles.badgeMonth}>{badge.month}</Text>
          <Text style={styles.badgeDay}>{badge.day}</Text>
        </>
      ) : <Text style={styles.badgeTba}>TBA</Text>}
    </View>
  );
}

function UpdateCard({ update, photo, editor, onEdit }: {
  update: Update; photo?: ImageSourcePropType; editor: boolean; onEdit: () => void;
}) {
  const when = formatWhen(update.starts_at);
  return (
    <Card style={styles.updateCard}>
      {photo && <Photo source={photo} label={`Photo for ${update.title}`} flush />}
      <View style={styles.updateBody}>
        {(update.sample || update.status === 'draft') && (
          <View style={styles.pills}>
            {update.sample && <StatusPill label="Sample event" tone="sample" />}
            {update.status === 'draft' && <StatusPill label="Draft: only editors see this" tone="draft" />}
          </View>
        )}
        <View style={styles.headline}>
          <DateBadge iso={update.starts_at} />
          <View style={styles.headlineText}>
            <Text style={styles.updateTitle} accessibilityRole="header">{update.title}</Text>
            <View style={styles.metaRow}>
              <Icon name="clock" color={colors.textMuted} size={15} />
              <Text style={styles.meta}>{when ?? 'Date to be announced'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Icon name="pin" color={colors.textMuted} size={15} />
              <Text style={styles.meta}>{update.location || 'Location to be announced'}</Text>
            </View>
          </View>
        </View>
        {!!update.body && <Text style={styles.text}>{update.body}</Text>}
        {update.sample && <Text style={styles.caption}>Sample for the pilot, not a real game listing. Photo from a Burbank High School game.</Text>}
        {editor && <Button label="Edit" kind="secondary" onPress={onEdit} />}
      </View>
    </Card>
  );
}

function Editor({ update, photo, onDone }: { update: Update | null; photo?: string; onDone: () => void }) {
  const when = splitWhen(update?.starts_at ?? null);
  const [draft, setDraft] = useState<UpdateDraft>({
    title: update?.title ?? '', date: when.date, time: when.time, location: update?.location ?? '', body: update?.body ?? '',
  });
  const [picked, setPicked] = useState<Picked | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof UpdateDraft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    if (!result.canceled && result.assets[0]) { setPicked({ uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }); setRemoved(false); }
  };
  const save = async (status: Update['status']) => {
    const checked = validateUpdate(draft);
    if ('error' in checked) { setError(checked.error); return; }
    setBusy(status); setError(null);
    try {
      let photo_path = removed ? null : update?.photo_path ?? null;
      if (picked) photo_path = await uploadPhoto(picked.uri, picked.mimeType);
      const fields: UpdateFields = { title: draft.title.trim(), starts_at: checked.starts_at, location: draft.location.trim() || null,
        body: draft.body.trim(), photo_path, status };
      await saveUpdate(update?.id ?? null, fields);
      if (update?.photo_path && update.photo_path !== photo_path) removePhoto(update.photo_path).catch(() => {});
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const shown = picked?.uri ?? (removed ? undefined : photo);
  const published = update?.status === 'published';
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.editorHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to updates" onPress={onDone} hitSlop={10}>
          <Icon name="back" color={colors.brand} size={24} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">{update ? 'Edit update' : 'New update'}</Text>
      </View>
      {update && <StatusPill label={published ? 'Published' : 'Draft'} tone={published ? 'active' : 'draft'} />}
      <Card>
        <Field label="Title" value={draft.title} onChangeText={set('title')} maxLength={LIMITS.title} />
        <View style={styles.twoUp}>
          <View style={styles.half}><Field label="Date" value={draft.date} onChangeText={set('date')} placeholder="2026-11-06"
            autoCorrect={false} keyboardType="numbers-and-punctuation" /></View>
          <View style={styles.half}><Field label="Time" value={draft.time} onChangeText={set('time')} placeholder="19:00"
            autoCorrect={false} keyboardType="numbers-and-punctuation" /></View>
        </View>
        <Text style={styles.caption}>Date and time are optional. Use 24-hour time.</Text>
        <Field label="Location" value={draft.location} onChangeText={set('location')} maxLength={LIMITS.location}
          placeholder="For example: Quad" />
        <Field label="Short text" value={draft.body} onChangeText={set('body')} multiline maxLength={LIMITS.body}
          hint={`${draft.body.length}/${LIMITS.body}`} />
        <View style={styles.group}>
          <Text style={styles.label}>Photo</Text>
          {shown && <Photo source={{ uri: shown }} label="Selected photo" />}
          <View style={styles.actions}>
            <Button label={shown ? 'Change photo' : 'Choose photo'} icon="image" kind="secondary" onPress={pick} />
            {shown && <Button label="Remove" kind="quiet" onPress={() => { setPicked(null); setRemoved(true); }} />}
          </View>
          <Text style={styles.caption}>Use only photos the school or team owns or has permission to share.</Text>
        </View>
      </Card>
      {error && <Notice text={error} tone="error" />}
      <View style={styles.actions}>
        <Button label={published ? 'Save and keep published' : 'Publish'} onPress={() => save('published')} busy={busy === 'published'} grow />
        <Button label={published ? 'Unpublish' : 'Save draft'} kind="secondary" onPress={() => save('draft')} busy={busy === 'draft'} />
      </View>
    </ScrollView>
  );
}

// Realtime covers new and edited updates. An unpublished one stops being
// visible to students, so no event reaches them: also refresh on open and
// every minute.
const FEED_REFRESH_MS = 60_000;

function UpdatesScreen({ active }: { active: boolean }) {
  const { configured, profile } = useAuth();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Update | 'new' | null>(null);
  const editor = profile?.role === 'admin';
  const refresh = useCallback(() => {
    loadUpdates().then((f) => { setFeed(f); setError(null); }).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (!configured || !active) return;
    refresh();
    const stop = watchUpdates(refresh);
    const id = setInterval(refresh, FEED_REFRESH_MS);
    return () => { stop(); clearInterval(id); };
    // The feed changes for editors (drafts) when the account changes.
  }, [configured, active, refresh, profile?.id]);

  if (editing) {
    const u = editing === 'new' ? null : editing;
    return <Editor update={u} photo={u?.photo_path ? feed?.photos[u.photo_path] : undefined}
      onDone={() => { setEditing(null); refresh(); }} />;
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Updates</Text>
        <Text style={styles.muted}>Announcements and events at Burbank High School.</Text>
      </View>
      {editor && <Button label="New update" icon="plus" onPress={() => setEditing('new')} />}
      {error && <Notice text={error} tone="error" />}
      {configured && !feed && !error && <SkeletonCards />}
      {feed && feed.list.length === 0 && <Notice text="No updates yet. School announcements and events will appear here." />}
      {(configured ? feedOrder(feed?.list ?? []) : [SAMPLE_UPDATE]).map((u) => (
        <UpdateCard key={u.id} update={u} editor={editor} onEdit={() => setEditing(u)}
          photo={u.photo_path && feed?.photos[u.photo_path] ? { uri: feed.photos[u.photo_path] } : u.sample ? SAMPLE_PHOTOS[u.title] : undefined} />
      ))}
      {!configured && <Text style={styles.caption}>Live school updates appear here once Updates is connected.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: space.xl, paddingBottom: 48, gap: space.md },
  header: { gap: 4, marginBottom: space.xs },
  title: { ...type.screenTitle },
  muted: { ...type.bodyMuted },
  updateCard: { padding: 0, overflow: 'hidden', gap: 0 },
  photo: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, overflow: 'hidden' },
  cardPhoto: { borderRadius: 0 },
  photoImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  updateBody: { padding: space.lg, gap: space.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  headline: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  headlineText: { flex: 1, gap: 4 },
  badge: {
    width: 54, minHeight: 58, borderRadius: radius.sm, backgroundColor: colors.brandSoft, alignItems: 'center',
    justifyContent: 'center', paddingVertical: 6,
  },
  badgeMonth: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.brand },
  badgeDay: { fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 28 },
  badgeTba: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6, color: colors.brand },
  updateTitle: { ...type.title, fontSize: 21, lineHeight: 26, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 15, color: colors.textMuted },
  text: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.label },
  group: { gap: space.sm },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  twoUp: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

export default memo(UpdatesScreen);
