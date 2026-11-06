export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

export function fitMap(width: number, height: number, mapWidth: number, mapHeight: number, maxPadding = 24) {
  const padding = Math.min(maxPadding, width / 10, height / 10);
  const scale = Math.min((width - padding * 2) / mapWidth, (height - padding * 2) / mapHeight);
  return { width: mapWidth * scale, height: mapHeight * scale };
}

export function boundPan(offset: number, mapSize: number, viewportSize: number, zoom: number) {
  'worklet';
  const limit = Math.max(0, (mapSize * zoom - viewportSize) / 2);
  return clamp(offset, -limit, limit);
}

// Coordinates are relative to the viewport's center. Keep the map point under
// the initial focal point under the moving focal point at the new zoom.
export function focalOffset(startOffset: number, startFocal: number, focal: number, ratio: number) {
  'worklet';
  return focal - (startFocal - startOffset) * ratio;
}

export type MapCamera = { zoom: number; rotation: number; x: number; y: number };
type TouchPoint = { id: number; x: number; y: number };
export type TouchFrame = {
  count: number;
  firstId: number;
  secondId: number;
  x: number;
  y: number;
  distance: number;
  angle: number;
};

export function normalizeAngle(angle: number) {
  'worklet';
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

// Pointer IDs, not event-array order, determine the pair's direction. On UP,
// some platforms include the departing pointer in allTouches; exclude it by ID.
export function touchFrame(touches: readonly TouchPoint[], width: number, height: number,
  released?: readonly TouchPoint[]): TouchFrame | null {
  'worklet';
  let first: TouchPoint | undefined;
  let second: TouchPoint | undefined;
  let count = 0;
  for (const touch of touches) {
    let lifted = false;
    if (released) {
      for (const release of released) {
        if (touch.id === release.id) { lifted = true; break; }
      }
    }
    if (lifted) continue;
    count++;
    if (!first || touch.id < first.id) { second = first; first = touch; }
    else if (!second || touch.id < second.id) second = touch;
  }
  if (!first) return null;
  const dx = second ? second.x - first.x : 0;
  const dy = second ? second.y - first.y : 0;
  return {
    count, firstId: first.id, secondId: second?.id ?? -1,
    x: (second ? (first.x + second.x) / 2 : first.x) - width / 2,
    y: (second ? (first.y + second.y) / 2 : first.y) - height / 2,
    distance: second ? Math.sqrt(dx * dx + dy * dy) : 0,
    angle: second ? Math.atan2(dy, dx) : 0,
  };
}

export function rotatedSize(width: number, height: number, rotation: number) {
  'worklet';
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  return { width: width * c + height * s, height: width * s + height * c };
}

// One camera update per touch event combines scale, twist, and translation.
// Incremental rebasing makes reversing at a zoom/pan limit respond immediately.
// Bounds take precedence over focal anchoring at the map's edges.
// With `allowRotation` off, two fingers still pinch and translate, but twist is ignored.
export type ZoomLimits = { min: number; max: number };
export function moveCamera(camera: MapCamera, previous: TouchFrame | null, current: TouchFrame,
  mapWidth: number, mapHeight: number, width: number, height: number, allowRotation = true,
  limits: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM }): MapCamera {
  'worklet';
  if (!previous || current.count > 2 || previous.count !== current.count
    || previous.firstId !== current.firstId || previous.secondId !== current.secondId) return camera;
  let zoom = camera.zoom;
  let delta = 0;
  if (current.count === 2) {
    // Rebase near coincident fingers rather than dividing by a tiny distance.
    if (previous.distance < 2 || current.distance < 2) return camera;
    zoom = clamp(camera.zoom * current.distance / previous.distance, limits.min, limits.max);
    delta = allowRotation ? normalizeAngle(current.angle - previous.angle) : 0;
  }
  const ratio = zoom / camera.zoom;
  const c = Math.cos(delta);
  const s = Math.sin(delta);
  const dx = previous.x - camera.x;
  const dy = previous.y - camera.y;
  const rotation = camera.rotation + delta;
  const extent = rotatedSize(mapWidth, mapHeight, rotation);
  return {
    zoom, rotation,
    x: boundPan(current.x - ratio * (c * dx - s * dy), extent.width, width, zoom),
    y: boundPan(current.y - ratio * (s * dx + c * dy), extent.height, height, zoom),
  };
}

// Rotate the entire annotation group around the viewport center, then pan in
// screen coordinates. Individual labels do not subscribe to pan or rotation.
export function cameraMatrix(width: number, height: number, x: number, y: number, rotation: number) {
  'worklet';
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const cx = width / 2;
  const cy = height / 2;
  return [c, s, -s, c, cx + x - c * cx + s * cy, cy + y - s * cx - c * cy];
}
