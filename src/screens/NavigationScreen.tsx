import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import InteractiveMap, { type MapControls } from '../map/InteractiveMap';
import { ALL_PLACES, CAMPUS, DEFAULT_FLOOR, FLOOR_ORDER, FLOORS, PLACE_NAMES, searchPlaces, type FloorId,
  type Place } from '../map/floors';
import { CAMPUS_NETWORK } from '../navigation/campusNetwork';
import { B1_GROUND_SPACE } from '../navigation/data/building1Walkable';
import { areaFor, destinationStatus, planTrip, startFromTap, startPointFor, type Trip, type TripStart } from '../navigation/directions';
import RouteOverlay from '../navigation/RouteOverlay';
import LiveTestPanel, { type TapPurpose } from '../positioning/LiveTestPanel';
import { currentRadius, routeGuidance } from '../positioning/tracker';
import type { LiveTracking } from '../positioning/useLiveTracking';
import { Button, StatusPill } from '../ui/controls';
import Icon, { type IconName } from '../ui/Icon';
import { useKeyboardInset } from '../ui/useKeyboardInset';
import { colors, radius, shadow, space, type } from '../ui/theme';

const POPULAR = ['Library', 'Cafeteria', 'Quad', 'Admin Offices', 'Career Center', 'Auditorium', 'Gymnasium (3-101)'];
const SUGGESTIONS = POPULAR
  .map((title) => ALL_PLACES.find((p) => p.title === title && p.floorId === 'floor-1'))
  .filter((p): p is Place => Boolean(p));
const FLOOR_OF = { 1: 'floor-1', 2: 'floor-2', 3: 'floor-3' } as const;

type Mode = 'browse' | 'start' | 'tap' | 'plan' | 'guide';
const OPEN_AREAS = ['Student Area', 'Quad', 'Lunch Shelter', 'Senior Hill']
  .map((title) => ALL_PLACES.find((p) => p.title === title && p.floorId === 'floor-1'))
  .filter((p): p is Place => Boolean(p));
const WALKABLE = [{ level: 1 as const, outline: B1_GROUND_SPACE.outline }];
const LIVE_TAP: Record<TapPurpose, { title: string; text: string }> = {
  correct: { title: 'Set my location', text: 'Tap where you are standing now.' },
  reference: { title: 'Add a reference point',
    text: 'Stand on a spot you can find exactly on the map, such as a building corner, and tap it. Then hold still for 15 seconds.' },
  checkpoint: { title: 'Log a checkpoint', text: 'Tap where you are really standing. The error of the live estimate is recorded.' },
};
type LiveNote = { text: string; tone: 'ok' | 'warn'; fix?: boolean };
const metres = (r: number) => `±${Math.max(1, Math.round(r))} m`;

/** What the live-location chip says, from the tracker state. */
function liveChip(live: LiveTracking, radius: number | null): { text: string; tone: 'ok' | 'warn' | 'off' } {
  if (live.status === 'starting') return { text: 'Live location starting…', tone: 'off' };
  if (live.status === 'denied') return { text: 'Location permission is off', tone: 'off' };
  if (live.status === 'error') return { text: 'Live location unavailable', tone: 'off' };
  if (live.estimate && radius !== null) {
    if (live.quality === 'precise') return { text: `Live location ${metres(radius)}`, tone: 'ok' };
    if (live.quality === 'approximate') return { text: `Approximate ${metres(radius)} · tap to confirm`, tone: 'warn' };
    return { text: 'Location uncertain · tap to set it', tone: 'warn' };
  }
  if (!live.reference) return { text: 'Map not aligned yet · tap to set location', tone: 'warn' };
  return { text: 'Waiting for an accurate reading', tone: 'warn' };
}

function placeIcon(place: Place): IconName {
  return place.kind === 'room' ? 'room' : place.kind === 'building' ? 'building' : 'area';
}

function MapButton({ icon, label, onPress, children }: {
  icon: IconName; label: string; onPress: () => void; children?: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
      <Icon name={icon} color={colors.brand} size={22} />
      {children}
    </Pressable>
  );
}

function FloorPicker({ floorId, onChange }: { floorId: FloorId; onChange: (id: FloorId) => void }) {
  return (
    <View style={styles.floorPicker} accessibilityRole="radiogroup" accessibilityLabel="Floor">
      <Text style={styles.floorCaption} importantForAccessibility="no">FLOOR</Text>
      {FLOOR_ORDER.map((id) => {
        const selected = id === floorId;
        return (
          <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected }}
            accessibilityLabel={FLOORS[id].label} onPress={() => onChange(id)} hitSlop={2}
            style={[styles.floorOption, selected && styles.floorOptionSelected]}>
            <Text style={[styles.floorText, selected && styles.floorTextSelected]}>{FLOORS[id].short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlaceHeader({ place }: { place: Place }) {
  return (
    <View style={styles.placeHeader}>
      <View style={styles.cardIcon}>
        <Icon name={placeIcon(place)} color={colors.text} size={26} strokeWidth={1.6} />
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={1}>{place.title}</Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>{place.subtitle}</Text>
      </View>
    </View>
  );
}

function SelectionCard({ place, review, onDirections, onCancel }: {
  place: Place; review: boolean; onDirections: () => void; onCancel: () => void;
}) {
  const status = destinationStatus(place, review);
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <PlaceHeader place={place} />
      <View style={styles.routeStatus}>
        <Icon name={status.offered ? 'check' : 'info'} color={status.offered ? colors.success : colors.textMuted} size={16}
          strokeWidth={2.4} />
        <Text style={[styles.routeStatusText, status.offered && styles.routeStatusOk]}>
          {status.offered ? 'Verified route available' : status.reason}
        </Text>
      </View>
      <View style={styles.actions}>
        {status.offered && <Button label="Directions" icon="navigation" onPress={onDirections} grow />}
        <Button label="Close" kind="secondary" onPress={onCancel} grow={!status.offered} />
      </View>
    </View>
  );
}

function PlanCard({ start, destination, trip, onStart, onChangeStart, onCancel }: {
  start: TripStart; destination: Place; trip: Trip;
  onStart: () => void; onChangeStart: () => void; onCancel: () => void;
}) {
  const available = trip.status === 'available';
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.legs}>
        <View style={styles.leg}>
          <View style={[styles.legDot, styles.legStart]} />
          <Text style={styles.legText} numberOfLines={1}>{start.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Change starting point" onPress={onChangeStart} hitSlop={8}>
            <Text style={styles.link}>Change</Text>
          </Pressable>
        </View>
        <View style={styles.legLine} />
        <View style={styles.leg}>
          <View style={[styles.legDot, styles.legEnd]} />
          <Text style={styles.legText} numberOfLines={1}>{destination.title}</Text>
        </View>
      </View>
      {available && trip.reviewOnly && (
        <View style={styles.reviewNote}>
          <Icon name="info" color={colors.previewText} size={15} />
          <Text style={styles.reviewText}>Review route: uses connections not yet checked at school.</Text>
        </View>
      )}
      {!available && (
        <View style={styles.unavailable}>
          <Text style={styles.unavailableTitle}>No route for this trip yet</Text>
          {trip.reasons.map((r) => <Text key={r} style={styles.unavailableText}>{r}</Text>)}
        </View>
      )}
      <View style={styles.actions}>
        {available && <Button label={trip.reviewOnly ? 'Start review route' : 'Start directions'} icon="navigation" onPress={onStart} grow />}
        <Button label="Cancel" kind="secondary" onPress={onCancel} grow={!available} />
      </View>
    </View>
  );
}

function GuideCard({ trip, index, onStep, onEnd, liveNote, onSetLocation }: {
  trip: Extract<Trip, { status: 'available' }>; index: number; onStep: (i: number) => void; onEnd: () => void;
  liveNote?: LiveNote | null; onSetLocation?: () => void;
}) {
  const { steps } = trip;
  const step = steps[index];
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.stepCount}>Step {index + 1} of {steps.length} · Floor {step.level}</Text>
      <Text style={styles.stepText}>{step.text}</Text>
      {trip.reviewOnly && <Text style={styles.reviewInline}>Review route, not yet checked at school</Text>}
      {liveNote && (
        <View style={styles.liveNote}>
          <View style={[styles.liveDot, liveNote.tone === 'ok' ? styles.liveDotOk : styles.liveDotWarn]} />
          <Text style={styles.liveNoteText}>{liveNote.text}</Text>
          {liveNote.fix && onSetLocation && (
            <Pressable accessibilityRole="button" accessibilityLabel="Set my location on the map" onPress={onSetLocation} hitSlop={8}>
              <Text style={styles.link}>Set location</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.actions}>
        <Button label="Back" kind="secondary" onPress={() => onStep(Math.max(0, index - 1))} />
        {index < steps.length - 1
          ? <Button label="Next" onPress={() => onStep(index + 1)} grow />
          : <Button label="Done" onPress={onEnd} grow />}
        <Button label="End" kind="quiet" onPress={onEnd} />
      </View>
    </View>
  );
}

function ResultRow({ place, onPress, routed }: { place: Place; onPress: () => void; routed?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}
      accessibilityLabel={`${place.title}, ${place.subtitle}${routed === undefined ? '' : routed ? ', route available' : ', map only'}`}
      style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}>
      <View style={styles.resultIcon}>
        <Icon name={placeIcon(place)} color={colors.textMuted} size={19} />
      </View>
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={1}>{place.title}</Text>
        <Text style={styles.resultSubtitle} numberOfLines={1}>{place.subtitle}</Text>
      </View>
      {routed !== undefined && <StatusPill label={routed ? 'Route' : 'Map only'} tone={routed ? 'active' : 'closed'} style={styles.resultPill} />}
    </Pressable>
  );
}


export default function NavigationScreen({ review = false, live = null, liveTest = false }: {
  review?: boolean;
  // Present only while live location is switched on in Settings.
  live?: LiveTracking | null;
  liveTest?: boolean;
}) {
  const container = useRef<ComponentRef<typeof View>>(null);
  const controls = useRef<MapControls | null>(null);
  const [floorId, setFloorId] = useState<FloorId>(DEFAULT_FLOOR);
  // While a tapped floor is being drawn, the picker already shows it and the
  // map keeps the previous floor under a cover.
  const [loadingFloor, setLoadingFloor] = useState<FloorId | null>(null);
  const floorFrame = useRef<number | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [start, setStart] = useState<TripStart | null>(null);
  const [mode, setMode] = useState<Mode>('browse');
  const [stepIndex, setStepIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [liveTap, setLiveTap] = useState<TapPurpose | null>(null);
  const [seenUpdate, setSeenUpdate] = useState<number | null>(null);
  const [screenHeight, setScreenHeight] = useState(0);
  const [bottomStackHeight, setBottomStackHeight] = useState(0);
  const keyboardInset = useKeyboardInset(container);
  // Keep the result panel above the keyboard and leave room for the map. The
  // panel's own list scrolls, so a short screen never pushes the map away.
  const panelMaxHeight = screenHeight
    ? Math.max(120, Math.min(360, screenHeight - keyboardInset - space.md - 52 - space.sm - 170))
    : 360;
  // Covered height: the panel stack plus the keyboard and its bottom margin.
  const bottomInset = searching ? bottomStackHeight + keyboardInset + space.md : 0;
  const results = useMemo(() => searchPlaces(query), [query]);
  const trip = useMemo(() => (start && destination ? planTrip(start, destination, review, PLACE_NAMES) : null),
    [start, destination, review]);
  const guide = mode === 'guide' && trip?.status === 'available' ? trip : null;
  const step = guide?.steps[stepIndex];
  const estimate = live?.estimate ?? null;
  const liveRadius = live && estimate ? currentRadius(estimate, live.now) : null;
  // A live start needs a precise estimate inside the walkable area.
  const liveStart = live?.quality === 'precise' && estimate ? startFromTap(estimate) : null;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => () => {
    if (floorFrame.current !== null) cancelAnimationFrame(floorFrame.current);
  }, []);
  // Search results and start choices apply a floor at once and drop any picker
  // switch that is still waiting for its frame.
  const showFloor = (id: FloorId) => {
    if (floorFrame.current !== null) cancelAnimationFrame(floorFrame.current);
    floorFrame.current = null;
    setLoadingFloor(null);
    setFloorId(id);
  };
  // Follow the route onto the floor of each step.
  const goToStep = (index: number) => {
    const next = trip?.status === 'available' ? trip.steps[index] : undefined;
    if (!next) return;
    setStepIndex(index);
    // This can run while rendering (live guidance), so it must not touch the
    // pending-switch ref; a cover from a picker tap is simply dropped.
    setLoadingFloor(null);
    setFloorId(FLOOR_OF[next.level]);
  };

  // Live position may advance steps or reroute only on Floor 1 (the estimate is
  // for the ground; no floor is inferred) and only when it is precise enough.
  const ground = live && guide && step?.level === 1 ? guide : null;
  const nextStep = ground?.steps[stepIndex + 1];
  const guidance = ground && live ? routeGuidance(estimate, live.now, live.reference,
    ground.route.legs.filter((l) => l.level === 1).flatMap((l) => l.points),
    nextStep?.level === 1 ? nextStep.at : null) : null;
  // Act once per new estimate (adjusting state while rendering, not in an effect).
  if (guidance && estimate && estimate.at !== seenUpdate) {
    setSeenUpdate(estimate.at);
    if (guidance.action === 'advance') goToStep(stepIndex + 1);
    if (guidance.action === 'reroute') {
      const from = startFromTap(estimate);
      if (from) {
        setStart({ title: 'Your location', level: 1, point: from, live: true });
        setStepIndex(0);
        setNotice('Rerouted from your live location.');
      }
    }
  }
  const liveNote: LiveNote | null = !live || !guide ? null
    : step?.level !== 1 ? { text: 'Live location works on Floor 1 only. Use Next and Back here.', tone: 'warn' }
    // Without a measured alignment there is no metre scale, so even a set location cannot drive steps.
    : !live.reference ? { text: 'Live location isn’t aligned with the map yet. Use Next and Back.', tone: 'warn' }
    : guidance && (guidance.action === 'follow' || guidance.action === 'advance') && liveRadius !== null
      ? { text: `Following your live location (${metres(liveRadius)}).`, tone: 'ok' }
    : { text: liveRadius !== null
      ? `Your location is approximate (${metres(liveRadius)}), so steps won’t move on their own.`
      : 'No accurate live location yet, so steps won’t move on their own.', tone: 'warn', fix: true };

  const clearTrip = () => { setDestination(null); setStart(null); setMode('browse'); setStepIndex(0); };
  // A picker tap changes the floor number at once and shows a loading cover
  // while the new floor draws.
  const changeFloor = (id: FloorId) => {
    if (mode === 'browse' && destination && destination.floorId !== id) setDestination(null);
    // A second tap replaces the switch that has not swapped the map yet.
    if (floorFrame.current !== null) cancelAnimationFrame(floorFrame.current);
    floorFrame.current = null;
    if (id === floorId) { setLoadingFloor(null); return; }
    // Acknowledge the tap at once: the picker shows the new number and the map
    // is covered. Swap the map on the next frame, then uncover it once drawn.
    setLoadingFloor(id);
    floorFrame.current = requestAnimationFrame(() => {
      setFloorId(id);
      floorFrame.current = requestAnimationFrame(() => {
        floorFrame.current = null;
        setLoadingFloor((current) => (current === id ? null : current));
      });
    });
  };
  const closeSearch = () => {
    Keyboard.dismiss();
    setSearching(false);
    setQuery('');
    if (mode === 'start') setMode(start ? 'plan' : 'browse');
  };
  const applyStart = (next: TripStart) => {
    setStart(next);
    showFloor('floor-1');
    setMode('plan');
  };
  const chooseStartOnMap = () => {
    Keyboard.dismiss();
    setSearching(false);
    setQuery('');
    showFloor('floor-1');
    setMode('tap');
  };
  const beginLiveTap = (purpose: TapPurpose) => {
    Keyboard.dismiss();
    setSearching(false);
    showFloor('floor-1');
    setLiveTap(purpose);
  };
  const onMapTap = (point: { x: number; y: number }) => {
    if (liveTap && live) {
      if (liveTap === 'reference') live.startCapture(point);
      else if (liveTap === 'checkpoint') { live.addCheckpoint(point); setNotice('Checkpoint logged.'); }
      else { live.correct(point); setNotice('Location set.'); }
      setLiveTap(null);
      return;
    }
    if (mode !== 'tap') return;
    const snapped = startFromTap(point);
    if (!snapped) { setNotice('Tap a spot in Building 1’s open area.'); return; }
    applyStart({ title: 'Marked spot', level: 1, point: snapped });
  };
  const choose = (place: Place) => {
    Keyboard.dismiss();
    setSearching(false);
    setQuery('');
    if (mode === 'start') {
      const point = startPointFor(place.id);
      if (point) applyStart({ title: place.title, level: 1, point, placeId: place.id });
      else if (review) applyStart({ title: place.title, level: 1, point: place.anchor, placeId: place.id });
      else setNotice('Pick an open area or tap the map to set your start.');
      return;
    }
    showFloor(place.floorId);
    setDestination(place);
    setStart(null);
    setMode('browse');
  };
  const pickStart = () => { setMode('start'); setSearching(true); };
  const startList = (query.trim() ? results : OPEN_AREAS)
    .filter((p) => p.key !== destination?.key && (review || areaFor(p.id)));
  const list = mode === 'start' ? startList : query.trim() ? results : SUGGESTIONS;
  const pinned = mode === 'guide' ? null : destination;
  const drawn = trip?.status === 'available' && (mode === 'plan' || mode === 'guide') ? trip.route : null;
  // While planning, centre the whole route; while guiding, follow the step.
  const routeCentre = useMemo(() => {
    const pts = drawn?.legs.filter((l) => `floor-${l.level}` === floorId).flatMap((l) => l.points) ?? [];
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }, [drawn, floorId]);

  return (
    <View style={styles.screen} ref={container}
      onLayout={({ nativeEvent }) => setScreenHeight(nativeEvent.layout.height)}>
      <InteractiveMap floor={FLOORS[floorId]} view={CAMPUS} controlsRef={controls}
        bottomInset={bottomInset}
        loading={loadingFloor ? `Loading ${FLOORS[loadingFloor].label}…` : null}
        selected={pinned?.floorId === floorId ? { ...pinned.anchor, labelHalfHeight: pinned.labelHalfHeight } : null}
        focus={step ? step.at : mode === 'plan' ? routeCentre : null}
        onMapTap={mode === 'tap' || liveTap ? onMapTap : undefined}
        live={floorId === 'floor-1' && live && estimate && liveRadius !== null ? {
          x: estimate.x, y: estimate.y, quality: live.quality,
          // Without a measured alignment there is no metre scale: the marker then shows no size.
          radius: live.reference ? liveRadius * live.reference.unitsPerMetre : 0,
        } : null}
        overlay={<RouteOverlay level={Number(floorId.slice(-1)) as 1 | 2 | 3} network={CAMPUS_NETWORK}
          route={drawn} start={start && mode !== 'browse' ? { level: start.level, at: start.point } : null}
          activeAt={step ? { level: step.level, at: step.at } : null}
          showNetwork={review && mode === 'browse'} walkable={WALKABLE} />} />

      <View style={styles.topBar} pointerEvents="box-none">
        <FloorPicker floorId={loadingFloor ?? floorId} onChange={changeFloor} />
        <View style={styles.chipSlot} pointerEvents="box-none">
          {live && (() => {
            const chip = liveChip(live, liveRadius);
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={`${chip.text}. Set my location on the map.`}
                onPress={() => beginLiveTap('correct')} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <View style={[styles.liveDot, chip.tone === 'ok' ? styles.liveDotOk : chip.tone === 'warn'
                  ? styles.liveDotWarn : styles.liveDotOff]} />
                <Text style={styles.chipText} numberOfLines={2}>{chip.text}</Text>
              </Pressable>
            );
          })()}
        </View>
        <View style={styles.controls}>
          <View style={styles.zoomGroup}>
            <MapButton icon="plus" label="Zoom in" onPress={() => controls.current?.zoomIn()} />
            <View style={styles.divider} />
            <MapButton icon="minus" label="Zoom out" onPress={() => controls.current?.zoomOut()} />
          </View>
          <View style={styles.zoomGroup}>
            <MapButton icon="reset" label="Reset view to Building 1" onPress={() => controls.current?.reset()} />
          </View>
          {live && (
            <View style={styles.zoomGroup}>
              <MapButton icon="locate" label="Set my location on the map" onPress={() => beginLiveTap('correct')} />
            </View>
          )}
        </View>
      </View>

      <View style={[styles.bottom, { bottom: space.md + keyboardInset }]} pointerEvents="box-none"
        onLayout={({ nativeEvent }) => setBottomStackHeight(nativeEvent.layout.height)}>
        {notice && <Text style={styles.toast} accessibilityLiveRegion="polite">{notice}</Text>}
        {live && liveTest && !searching && <LiveTestPanel live={live} onTap={beginLiveTap} />}
        {liveTap && (
          <View style={styles.card}>
            <Text style={styles.stepCount}>{LIVE_TAP[liveTap].title}</Text>
            <Text style={styles.tapText}>{LIVE_TAP[liveTap].text}</Text>
            <View style={styles.actions}>
              <Button label="Cancel" kind="secondary" onPress={() => setLiveTap(null)} />
            </View>
          </View>
        )}
        {searching && (
          <View style={[styles.panel, { maxHeight: panelMaxHeight }]}>
            <Text style={styles.panelHeading}>
              {mode === 'start' ? 'Choose a starting point' : query.trim() ? 'Results' : 'Popular places'}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
              style={styles.panelList} contentContainerStyle={styles.panelListContent}>
              {mode === 'start' && live && (liveStart ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Use my live location as the start"
                  onPress={() => { closeSearch(); applyStart({ title: 'Your location', level: 1, point: liveStart, live: true }); }}
                  style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}>
                  <View style={[styles.resultIcon, styles.resultIconBrand]}>
                    <Icon name="locate" color="#ffffff" size={19} />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle}>Use my live location</Text>
                    <Text style={styles.resultSubtitle}>{liveRadius !== null ? `Accurate to ${metres(liveRadius)}` : ''}</Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.result}>
                  <View style={styles.resultIcon}><Icon name="locate" color={colors.textFaint} size={19} /></View>
                  <View style={styles.resultText}>
                    <Text style={[styles.resultTitle, styles.mutedText]}>Live location not accurate enough</Text>
                    <Text style={styles.resultSubtitle}>Pick a place below or tap the map instead</Text>
                  </View>
                </View>
              ))}
              {mode === 'start' && (
                <Pressable accessibilityRole="button" accessibilityLabel="Tap a spot on the map to set your start"
                  onPress={chooseStartOnMap} style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}>
                  <View style={[styles.resultIcon, styles.resultIconBrand]}>
                    <Icon name="navigation" color="#ffffff" size={19} />
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.resultTitle}>Tap a spot on the map</Text>
                    <Text style={styles.resultSubtitle}>Anywhere in Building 1’s open area</Text>
                  </View>
                </Pressable>
              )}
              {list.map((place) => (
                <ResultRow key={place.key} place={place} onPress={() => choose(place)}
                  routed={mode === 'start' ? undefined : destinationStatus(place, review).offered} />
              ))}
              {list.length === 0 && (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No matching rooms or places</Text>
                  <Text style={styles.emptyText}>Try a room number such as 1155, or a place such as Library.</Text>
                </View>
              )}
            </ScrollView>
            <Text style={styles.panelFoot}>Teacher search is coming soon.</Text>
          </View>
        )}
        {!searching && !liveTap && mode === 'browse' && destination && (
          <SelectionCard place={destination} review={review} onDirections={pickStart} onCancel={clearTrip} />
        )}
        {mode === 'tap' && !liveTap && (
          <View style={styles.card}>
            <Text style={styles.stepCount}>Set your starting point</Text>
            <Text style={styles.tapText}>Tap where you are in Building 1’s open area: the Quad, Student Area, Lunch Shelter or a walkway.</Text>
            <View style={styles.actions}>
              <Button label="Back" kind="secondary" onPress={pickStart} />
              <Button label="Cancel" kind="quiet" onPress={clearTrip} />
            </View>
          </View>
        )}
        {!searching && !liveTap && mode === 'plan' && start && destination && trip && (
          <PlanCard start={start} destination={destination} trip={trip}
            onStart={() => { goToStep(0); setMode('guide'); }} onChangeStart={pickStart} onCancel={clearTrip} />
        )}
        {!searching && !liveTap && guide && <GuideCard trip={guide} index={stepIndex} onStep={goToStep} onEnd={clearTrip}
          liveNote={liveNote} onSetLocation={() => beginLiveTap('correct')} />}
        {mode !== 'guide' && mode !== 'tap' && !liveTap && (
          <View style={[styles.search, searching && styles.searchActive]}>
            <Icon name="search" color={colors.textMuted} size={21} />
            <TextInput value={query} placeholder={mode === 'start' ? 'Search for where you are' : 'Search rooms and places'}
              placeholderTextColor={colors.textFaint} style={styles.searchInput}
              accessibilityLabel={mode === 'start' ? 'Search for a starting point' : 'Search rooms and places'}
              returnKeyType="search" autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing"
              onChangeText={(text) => { setQuery(text); setSearching(true); }}
              // Results stay open on blur so a tap on one is never lost;
              // choosing a result or Cancel closes the panel.
              onFocus={() => setSearching(true)}
              onSubmitEditing={() => { if (query.trim() && list[0]) choose(list[0]); }} />
            {searching && (
              <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={closeSearch} hitSlop={8}>
                <Text style={styles.searchCancel}>Cancel</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  pressed: { opacity: 0.6 },
  topBar: {
    position: 'absolute', top: space.md, left: space.md, right: space.md,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  floorPicker: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, alignItems: 'center', gap: 2, ...shadow,
  },
  floorCaption: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, color: colors.textFaint, marginTop: 2, marginBottom: 1 },
  floorOption: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  floorOptionSelected: { backgroundColor: colors.brand },
  floorText: { fontSize: 17, fontWeight: '700', color: colors.text },
  floorTextSelected: { color: '#ffffff' },
  controls: { gap: space.sm, alignItems: 'flex-end' },
  chipSlot: { flex: 1, alignItems: 'center', paddingHorizontal: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, minHeight: 36, backgroundColor: colors.surface,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, ...shadow,
  },
  chipText: { flexShrink: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveDotOk: { backgroundColor: '#1769ff' },
  liveDotWarn: { backgroundColor: '#d97706' },
  liveDotOff: { backgroundColor: '#8b95a1' },
  liveNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveNoteText: { flex: 1, fontSize: 13.5, color: colors.textMuted },
  mutedText: { color: colors.textMuted },
  zoomGroup: { backgroundColor: colors.surface, borderRadius: radius.md, ...shadow },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: space.sm },
  mapButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: space.md, right: space.md, gap: space.sm },
  toast: {
    alignSelf: 'center', backgroundColor: colors.scrim, color: '#ffffff', fontSize: 15, fontWeight: '500',
    paddingHorizontal: space.lg, paddingVertical: 10, borderRadius: radius.pill, overflow: 'hidden',
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.md, ...shadow },
  placeHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardIcon: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { ...type.title },
  cardSubtitle: { ...type.caption, fontSize: 14 },
  actions: { flexDirection: 'row', gap: space.sm },
  legs: { gap: 2 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 30 },
  legDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3 },
  legStart: { borderColor: colors.brand, backgroundColor: '#ffffff' },
  legEnd: { borderColor: colors.brand, backgroundColor: colors.brand },
  legLine: { width: 2, height: 10, backgroundColor: colors.border, marginLeft: 5 },
  legText: { ...type.label, fontSize: 16, flex: 1 },
  link: { fontSize: 15, fontWeight: '600', color: colors.brand },
  reviewNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.previewBg,
    borderRadius: radius.sm, padding: space.sm,
  },
  reviewText: { flex: 1, fontSize: 13, color: colors.previewText, fontWeight: '600' },
  reviewInline: { fontSize: 12.5, color: colors.previewText, fontWeight: '600' },
  unavailable: { gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: space.md },
  unavailableTitle: { ...type.label },
  unavailableText: { ...type.caption, fontSize: 14 },
  stepCount: { ...type.overline },
  tapText: { ...type.body, color: colors.textMuted },
  routeStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeStatusText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textMuted },
  routeStatusOk: { color: colors.success },
  resultIconBrand: { backgroundColor: colors.brand },
  stepText: { ...type.title, fontSize: 21, lineHeight: 27 },
  panel: {
    backgroundColor: colors.surface, borderRadius: radius.lg, paddingTop: space.md,
    maxHeight: 360, ...shadow,
  },
  panelHeading: { ...type.overline, paddingHorizontal: space.lg, marginBottom: space.xs },
  panelList: { flexGrow: 0, flexShrink: 1 },
  panelListContent: { paddingBottom: space.xs },
  panelFoot: {
    ...type.caption, fontSize: 12.5, paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 54 },
  resultPressed: { backgroundColor: colors.surfaceMuted },
  resultIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  resultText: { flex: 1 },
  resultPill: { alignSelf: 'center' },
  resultTitle: { fontSize: 16, fontWeight: '500', color: colors.text },
  resultSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  empty: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 4 },
  emptyTitle: { ...type.label },
  emptyText: { ...type.caption },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: radius.pill,
    paddingHorizontal: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow,
  },
  searchActive: { borderColor: colors.brand },
  searchInput: { flex: 1, fontSize: 17, color: colors.text, height: '100%' },
  searchCancel: { fontSize: 16, fontWeight: '600', color: colors.brand },
});
