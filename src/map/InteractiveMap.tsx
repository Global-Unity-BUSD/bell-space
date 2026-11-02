import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useState, type ComponentType,
  type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { DETAIL_THRESHOLDS, type DetailLevel, type DetailThresholds } from './detailPolicy';
import type { LabelSpec } from './labelPlan';
import MapLabels from './MapLabels';
import { boundPan, cameraMatrix, clamp, fitMap, moveCamera, touchFrame, MAX_ZOOM, MIN_ZOOM,
  type TouchFrame } from './mapMath';
import LiveMarker from './LiveMarker';
import SelectionPin from './SelectionPin';
import { mapColors } from '../ui/theme';

// Two-finger rotation is off in the student UI; pan and pinch remain.
export const ROTATION_ENABLED = false;
export const ZOOM_STEP = 1.8;
// The vector map is drawn larger than the screen so short pans never reveal
// an empty edge before it is redrawn.
export const OVERSCAN = 0.3;
// After a pinch, wait briefly before redrawing so the redraw never lands on the
// frame where the fingers lift, and a quick follow-up gesture can cancel it.
export const SETTLE_DELAY_MS = 120;
// A touch that moves less than this and lifts quickly is a tap.
const TAP_SLOP = 8;
const TAP_MS = 350;
const now = () => {
  'worklet';
  return Date.now();
};
const ANIMATION_MS = 260;

export type MapControls = { zoomIn: () => void; zoomOut: () => void; reset: () => void };
export type MapView = {
  size: { width: number; height: number };
  zoom: { min: number; max: number };
  thresholds: DetailThresholds;
  // Selecting a place zooms to at least this level so its label is visible.
  focusZoom: number;
  // Margin around the fitted map at the lowest zoom.
  padding?: number;
  // Opening view (and Reset view): a map point to centre and a zoom.
  initial?: { x: number; y: number; zoom: number };
};
type MapPoint = { x: number; y: number; labelHalfHeight?: number };
export type GeometryProps = { detail: DetailLevel };
type MapFloor = {
  id: string;
  Geometry: ComponentType<GeometryProps>;
  labels: LabelSpec[];
};
type MapProps = {
  floor: MapFloor;
  view?: MapView;
  selected?: MapPoint | null;
  // Extra vector content in map units (for example a route), drawn above the floor.
  overlay?: ReactNode;
  // Map point to bring into view, for example the next step of a route.
  focus?: MapPoint | null;
  // Called with the map point under a single-finger tap.
  onMapTap?: (point: { x: number; y: number }) => void;
  // Live position estimate (map units) with its uncertainty radius.
  live?: { x: number; y: number; radius: number; quality: 'precise' | 'approximate' | 'unknown' } | null;
  controlsRef?: RefObject<MapControls | null>;
  // Cover text shown over the map while a floor loads, e.g. "Loading Floor 2…".
  loading?: string | null;
};
type CameraState = { zoom: number; x: number; y: number };

const DEFAULT_VIEW: MapView = { size: { width: 201, height: 258 }, zoom: { min: MIN_ZOOM, max: MAX_ZOOM },
  thresholds: DETAIL_THRESHOLDS, focusZoom: DETAIL_THRESHOLDS.fullEnter + 0.2 };

// Map units → screen: the shared camera (pan about the viewport centre)
// after scaling the map about its own centre.
export function geometryMatrix(width: number, height: number, x: number, y: number, rotation: number,
  scale: number, mapWidth: number, mapHeight: number): number[] {
  'worklet';
  const [a, b, c, d, e, f] = cameraMatrix(width, height, x, y, rotation);
  const zx = width / 2 - scale * mapWidth / 2;
  const zy = height / 2 - scale * mapHeight / 2;
  return [a * scale, b * scale, c * scale, d * scale, a * zx + c * zy + e, b * zx + d * zy + f];
}

export function detailFor(zoom: number, t: DetailThresholds): DetailLevel {
  return zoom >= t.fullEnter ? 2 : zoom >= t.mediumEnter ? 1 : 0;
}

/**
 * Pan/zoom offsets that centre map point `p` at `zoom`, kept inside the pan bounds.
 */
export function centreOn(p: { x: number; y: number }, zoom: number, fitScale: number,
  fitted: { width: number; height: number }, width: number, height: number) {
  'worklet';
  return {
    x: boundPan(-zoom * (p.x * fitScale - fitted.width / 2), fitted.width, width, zoom),
    y: boundPan(-zoom * (p.y * fitScale - fitted.height / 2), fitted.height, height, zoom),
  };
}

/**
 * Whether the drawn layer must be redrawn for a settled camera. A pure pan
 * that stays inside the overscan keeps the layer sharp (it is only moved), so
 * it is not redrawn; any zoom change is.
 */
export function needsRedraw(zoom: number, x: number, y: number, settledZoom: number, settledX: number,
  settledY: number, width: number, height: number) {
  'worklet';
  if (Math.abs(zoom - settledZoom) > 1e-4 * settledZoom) return true;
  return Math.abs(x - settledX) > width * OVERSCAN * 0.75 || Math.abs(y - settledY) > height * OVERSCAN * 0.75;
}

function MapViewport({ width, height, floor, view = DEFAULT_VIEW, selected = null, focus = null, overlay,
  onMapTap, live = null, controlsRef }: MapProps & { width: number; height: number }) {
  const { size, zoom: limits, thresholds } = view;
  const { Geometry } = floor;
  const fitted = fitMap(width, height, size.width, size.height, view.padding);
  const fitScale = fitted.width / size.width;
  const start = useMemo<CameraState>(() => {
    if (!view.initial) return { zoom: limits.min, x: 0, y: 0 };
    const zoom = clamp(view.initial.zoom, limits.min, limits.max);
    return { zoom, ...centreOn(view.initial, zoom, fitScale, fitted, width, height) };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the opening view is computed once per viewport
  }, []);
  const zoom = useSharedValue(start.zoom);
  const rotation = useSharedValue(0);
  const x = useSharedValue(start.x);
  const y = useSharedValue(start.y);
  const previous = useSharedValue<TouchFrame | null>(null);

  // The vector map is redrawn only for a settled camera. While a gesture or
  // animation runs, the drawn layer is moved and scaled on the GPU from the
  // settled camera to the live one; labels and the pin follow the live camera.
  const [settled, setSettled] = useState<CameraState>(start);
  const settledZoom = useSharedValue(start.zoom);
  const settledX = useSharedValue(start.x);
  const settledY = useSharedValue(start.y);
  useLayoutEffect(() => {
    settledZoom.value = settled.zoom;
    settledX.value = settled.x;
    settledY.value = settled.y;
  }, [settled, settledZoom, settledX, settledY]);
  const commitSettled = useCallback((z: number, sx: number, sy: number) => {
    setSettled((prev) => (prev.zoom === z && prev.x === sx && prev.y === sy ? prev : { zoom: z, x: sx, y: sy }));
  }, []);
  // The redraw is scheduled on the UI thread after a short delay; a new touch
  // cancels it (see onTouchesDown), so quick successive gestures redraw once.
  const settleTick = useSharedValue(0);
  // Tap → map point, using the live camera.
  const handleTap = useCallback((sx: number, sy: number) => {
    const s = fitScale * zoom.value;
    onMapTap?.({ x: size.width / 2 + (sx - width / 2 - x.value) / s, y: size.height / 2 + (sy - height / 2 - y.value) / s });
  }, [onMapTap, fitScale, size.width, size.height, width, height, zoom, x, y]);
  const tap = useSharedValue({ x: 0, y: 0, time: 0, moved: false, fingers: 0 });
  const wantsTaps = Boolean(onMapTap);

  // A single UI-thread pointer stream prevents independent pinch/pan
  // handlers from overwriting each other's focal translation. The attached
  // surface never transforms, so touch coordinates remain viewport-relative.
  const gesture = useMemo(() => Gesture.Manual()
    .shouldCancelWhenOutside(false)
    .onTouchesDown((event, manager) => {
      cancelAnimation(zoom);
      cancelAnimation(rotation);
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(settleTick);
      const first = !previous.value;
      previous.set(touchFrame(event.allTouches, width, height));
      const touch = event.allTouches[0];
      if (first && touch) tap.set({ x: touch.x, y: touch.y, time: now(), moved: false, fingers: event.allTouches.length });
      else tap.set({ ...tap.value, fingers: Math.max(tap.value.fingers, event.allTouches.length) });
      manager.activate();
    })
    .onTouchesMove((event) => {
      const current = touchFrame(event.allTouches, width, height);
      if (!current) return;
      // Reset can be pressed while another finger is still on the map.
      if (!previous.value) {
        cancelAnimation(zoom);
        cancelAnimation(x);
        cancelAnimation(y);
      }
      const touch = event.allTouches[0];
      if (touch && !tap.value.moved && Math.hypot(touch.x - tap.value.x, touch.y - tap.value.y) > TAP_SLOP) {
        tap.set({ ...tap.value, moved: true });
      }
      const next = moveCamera(
        { zoom: zoom.value, rotation: rotation.value, x: x.value, y: y.value },
        previous.value, current, fitted.width, fitted.height, width, height, ROTATION_ENABLED, limits,
      );
      zoom.set(next.zoom);
      rotation.set(next.rotation);
      x.set(next.x);
      y.set(next.y);
      previous.set(current);
    })
    .onTouchesUp((event, manager) => {
      previous.set(touchFrame(event.allTouches, width, height, event.changedTouches));
      if (!previous.value) {
        const t = tap.value;
        if (wantsTaps && !t.moved && t.fingers === 1 && now() - t.time < TAP_MS) scheduleOnRN(handleTap, t.x, t.y);
        manager.end();
      }
    })
    .onTouchesCancelled((_event, manager) => {
      previous.set(null);
      manager.fail();
    })
    .onFinalize(() => {
      previous.set(null);
      const z = zoom.value; const sx = x.value; const sy = y.value;
      if (needsRedraw(z, sx, sy, settledZoom.value, settledX.value, settledY.value, width, height)) {
        settleTick.set(withDelay(SETTLE_DELAY_MS, withTiming(settleTick.value + 1, { duration: 0 }, (finished) => {
          if (finished) scheduleOnRN(commitSettled, z, sx, sy);
        })));
      }
    }),
  [width, height, fitted.width, fitted.height, limits, previous, zoom, rotation, x, y, commitSettled, settleTick, tap,
    wantsTaps, handleTap, settledZoom, settledX, settledY]);

  const layerStyle = useAnimatedStyle(() => {
    const k = zoom.value / settledZoom.value;
    return {
      transform: [
        { translateX: x.value - k * settledX.value },
        { translateY: y.value - k * settledY.value },
        { scale: k },
      ],
    };
  });

  // Camera moves for the on-screen controls; the map redraws when they finish.
  const animateTo = (targetZoom: number, targetX: number, targetY: number) => {
    scheduleOnUI(() => {
      'worklet';
      previous.set(null);
      const nextZoom = clamp(targetZoom, limits.min, limits.max);
      const nx = boundPan(targetX, fitted.width, width, nextZoom);
      const ny = boundPan(targetY, fitted.height, height, nextZoom);
      rotation.set(0);
      x.set(withTiming(nx, { duration: ANIMATION_MS }));
      y.set(withTiming(ny, { duration: ANIMATION_MS }));
      zoom.set(withTiming(nextZoom, { duration: ANIMATION_MS }, (finished) => {
        if (finished && needsRedraw(nextZoom, nx, ny, settledZoom.value, settledX.value, settledY.value, width, height)) {
          scheduleOnRN(commitSettled, nextZoom, nx, ny);
        }
      }));
    });
  };
  // Zoom about the viewport centre: the centred map point stays centred.
  const zoomBy = (factor: number) => {
    const target = clamp(zoom.value * factor, limits.min, limits.max);
    const ratio = target / zoom.value;
    animateTo(target, x.value * ratio, y.value * ratio);
  };
  const reset = () => animateTo(start.zoom, start.x, start.y);
  useImperativeHandle(controlsRef, () => ({
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    reset,
  }));

  // Centre a selected place (zooming in far enough to read it) or a route step.
  const target = focus ?? selected;
  const targetX = target?.x;
  const targetY = target?.y;
  const isStep = Boolean(focus);
  useEffect(() => {
    if (targetX === undefined || targetY === undefined) return;
    // Route steps keep a little more context than a selected room.
    const nextZoom = Math.max(zoom.value, isStep ? view.focusZoom * 0.75 : view.focusZoom);
    const offset = centreOn({ x: targetX, y: targetY }, nextZoom, fitScale, fitted, width, height);
    animateTo(nextZoom, offset.x, offset.y);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when the target changes
  }, [targetX, targetY]);

  const drawW = width * (1 + 2 * OVERSCAN);
  const drawH = height * (1 + 2 * OVERSCAN);
  const matrix = geometryMatrix(drawW, drawH, settled.x, settled.y, 0, fitScale * settled.zoom, size.width, size.height);
  const detail = detailFor(settled.zoom, thresholds);
  const camera = useMemo(() => ({ width, height, fitScale, mapWidth: size.width, mapHeight: size.height,
    maxZoom: limits.max, zoom, x, y }), [width, height, fitScale, size.width, size.height, limits.max, zoom, x, y]);

  return (
    <View style={styles.viewport}>
      <GestureDetector gesture={gesture} touchAction="none">
        <View style={styles.gestureSurface} collapsable={false}
          accessible accessibilityLabel={`Campus map, ${floor.id.replace('-', ' ')}`}
          accessibilityHint="Drag with one finger to move the map, or pinch with two fingers to zoom. Room numbers appear as you zoom in.">
          <Animated.View pointerEvents="none" style={[styles.layer, {
            left: -width * OVERSCAN, top: -height * OVERSCAN, width: drawW, height: drawH,
          }, layerStyle]}>
            <Svg width={drawW} height={drawH}>
              <G transform={`matrix(${matrix.join(' ')})`}>
                <Geometry detail={detail} />
                {overlay}
              </G>
            </Svg>
          </Animated.View>
          <MapLabels specs={floor.labels} camera={camera} />
          {live && (
            <LiveMarker point={live} radius={live.radius} quality={live.quality} width={width} height={height}
              fitScale={fitScale} fittedWidth={fitted.width} fittedHeight={fitted.height} zoom={zoom} x={x} y={y} />
          )}
          {selected && (
            <SelectionPin point={selected} labelHalfHeight={selected.labelHalfHeight} width={width} height={height} fitScale={fitScale}
              fittedWidth={fitted.width} fittedHeight={fitted.height} zoom={zoom} x={x} y={y} />
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

export default function InteractiveMap(props: MapProps) {
  const { loading = null, ...mapProps } = props;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    // A hidden tab reports a zero size; keep the current camera instead of
    // unmounting the map and losing its position.
    if (!layout.width || !layout.height) return;
    setViewport((previous) => previous.width === layout.width && previous.height === layout.height
      ? previous : { width: layout.width, height: layout.height });
  };
  return (
    <View style={styles.viewport} onLayout={onLayout}>
      {viewport.width > 0 && viewport.height > 0 && (
        // Floors share one campus frame, so switching floors keeps the camera.
        // Refit only when the viewport itself changes (e.g. tablet resize).
        <MapViewport key={`${viewport.width}:${viewport.height}`} {...viewport} {...mapProps} />
      )}
      {loading ? (
        // Covers the previous floor while the next one is drawn; taps cannot
        // reach the old geometry underneath.
        <View style={styles.loading} accessible accessibilityRole="progressbar"
          accessibilityLabel={loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={mapColors.pin} />
          <Text style={styles.loadingText}>{loading}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: mapColors.background },
  gestureSurface: { flex: 1 },
  layer: { position: 'absolute' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center',
    justifyContent: 'center', gap: 8, backgroundColor: mapColors.background },
  loadingText: { fontSize: 15, fontWeight: '600', color: mapColors.contextText },
});
