import type { Bounds } from './annotationLayout';

// Map labels are native text at a fixed, readable screen size. Each label is
// planned once per floor and viewport: it appears at the zoom where it fits
// inside its room (or area) and no longer overlaps a more important label,
// and shows from that zoom on. During gestures only arithmetic runs;
// there is no layout, collision search or text measurement per frame.
export type LabelKind = 'room' | 'area' | 'building' | 'context' | 'stair';

export type LabelSpec = {
  id: string;
  kind: LabelKind;
  lines: string[];
  // -90: reads bottom-to-top, as vertical room numbers are printed.
  rotate: 0 | -90;
  uncertain?: boolean;
  anchor: { x: number; y: number };
  // Box the label must fit inside, in map units (its room or area).
  room: Bounds;
};

export type PlannedLabel = LabelSpec & {
  fontSize: number;
  // Unrotated text box, screen points.
  width: number;
  height: number;
  appear: number;
  vanish: number;
  priority: number;
};

export const LABEL_STYLE = {
  room: { fontSize: 14, minZoom: 0 },
  area: { fontSize: 14, minZoom: 0 },
  building: { fontSize: 14, minZoom: 0 },
  context: { fontSize: 12, minZoom: 0 },
  stair: { fontSize: 0, minZoom: 2.2 },
} as const;
export const STAIR_MARKER = 18;
// Unconfirmed labels only appear once the map is well zoomed in.
export const UNCERTAIN_MIN_ZOOM = 5;
// Building names belong to the zoomed-out view only.
export const BUILDING_VANISH_ZOOM = 2.2;
// Labels switch at their planned zoom with no fade band, so a label at rest
// is never left half-transparent.
export const FADE = 0;
const CHAR = 0.62;
const LINE = 1.22;
const PADDING = 6;
const GAP = 3;
const PRIORITY: Record<LabelKind, number> = { building: 300, area: 150, stair: 120, room: 60, context: 10 };

function boxOf(spec: LabelSpec) {
  if (spec.kind === 'stair') return { fontSize: 0, width: STAIR_MARKER, height: STAIR_MARKER };
  const fontSize = LABEL_STYLE[spec.kind].fontSize - (spec.uncertain ? 2 : 0);
  const longest = Math.max(...spec.lines.map((l) => l.length));
  return { fontSize, width: Math.ceil(longest * fontSize * CHAR) + PADDING, height: Math.ceil(spec.lines.length * fontSize * LINE) };
}

/** Screen-space extent along x and y after rotation. */
export function screenExtent(label: Pick<PlannedLabel, 'width' | 'height' | 'rotate'>) {
  return label.rotate ? { w: label.height, h: label.width } : { w: label.width, h: label.height };
}

// Zoom at which the label fits inside its room with a small margin.
function fitZoom(spec: LabelSpec, w: number, h: number, fitScale: number) {
  if (spec.kind === 'stair') return 0;
  const rw = (spec.room.maxX - spec.room.minX) * fitScale;
  const rh = (spec.room.maxY - spec.room.minY) * fitScale;
  if (rw <= 0 || rh <= 0) return Infinity;
  return Math.max((w + 2 * GAP) / rw, (h + 2 * GAP) / rh);
}

export function planLabels(specs: LabelSpec[], fitScale: number, maxZoom: number): PlannedLabel[] {
  const sized = specs.map((spec) => {
    const box = boxOf(spec);
    const extent = screenExtent({ ...box, rotate: spec.rotate });
    const priority = spec.uncertain ? 20 : PRIORITY[spec.kind];
    const minimum = Math.max(LABEL_STYLE[spec.kind].minZoom, spec.uncertain ? UNCERTAIN_MIN_ZOOM : 0);
    const appear = Math.max(minimum, fitZoom(spec, extent.w, extent.h, fitScale));
    const vanish = spec.kind === 'building' ? BUILDING_VANISH_ZOOM : Infinity;
    return { ...spec, ...box, priority, appear: appear > maxZoom ? Infinity : appear, vanish };
  });
  const order = [...sized].sort((a, b) => b.priority - a.priority || a.appear - b.appear || a.id.localeCompare(b.id));
  const placed: PlannedLabel[] = [];
  for (const label of order) {
    const a = screenExtent(label);
    for (const other of placed) {
      if (!Number.isFinite(other.appear)) continue;
      const b = screenExtent(other);
      const dx = Math.abs(label.anchor.x - other.anchor.x) * fitScale;
      const dy = Math.abs(label.anchor.y - other.anchor.y) * fitScale;
      // Boxes keep their screen size while anchors spread apart with zoom,
      // so two labels stop overlapping once either axis separates.
      const sepX = dx > 0 ? ((a.w + b.w) / 2 + GAP) / dx : Infinity;
      const sepY = dy > 0 ? ((a.h + b.h) / 2 + GAP) / dy : Infinity;
      const separate = Math.min(sepX, sepY);
      // They conflict from when both show until one hides or they separate;
      // the lower-priority label waits for the end of that range.
      const start = Math.max(label.appear, other.appear);
      const end = Math.min(label.vanish, other.vanish, separate);
      if (start < end) label.appear = end;
    }
    if (label.appear >= label.vanish || label.appear > maxZoom) label.appear = Infinity;
    placed.push(label);
  }
  return specs.map((spec) => placed.find((p) => p.id === spec.id)!);
}

/** Opacity for a planned label at `zoom`: shown from `appear` until `vanish`. */
export function labelOpacity(zoom: number, appear: number, vanish: number) {
  'worklet';
  if (zoom < appear || zoom >= vanish) return 0;
  if (!FADE) return 1;
  const fadeIn = Math.min(1, (zoom - appear) / (appear * FADE));
  const fadeOut = vanish === Infinity ? 1 : Math.min(1, (vanish - zoom) / (vanish * FADE));
  return Math.max(0, Math.min(fadeIn, fadeOut));
}
