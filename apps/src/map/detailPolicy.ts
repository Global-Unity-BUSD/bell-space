export type DetailLevel = 0 | 1 | 2;
export const DETAIL_NAMES = ['Overview', 'Medium', 'Full'] as const;
export const DETAIL_FADE_MS = 140;

export type DetailThresholds = { mediumEnter: number; mediumExit: number; fullEnter: number; fullExit: number };

// Relative to viewport fit. A lower exit boundary prevents boundary jitter.
export const DETAIL_THRESHOLDS: DetailThresholds = {
  mediumEnter: 2,
  mediumExit: 1.75,
  fullEnter: 3.4,
  fullExit: 3.1,
};
// Labels are laid out at the lowest zoom of each level, so they stay apart
// throughout that level's range.
export function layoutMinZoom(t: DetailThresholds): readonly [number, number, number] {
  return [1, t.mediumExit, t.fullExit];
}
export const LAYOUT_MIN_ZOOM = layoutMinZoom(DETAIL_THRESHOLDS);

export function nextDetailLevel(zoom: number, current: DetailLevel,
  t: DetailThresholds = DETAIL_THRESHOLDS): DetailLevel {
  'worklet';
  if (zoom >= t.fullEnter) return 2;
  if (current === 2 && zoom >= t.fullExit) return 2;
  if (zoom >= t.mediumEnter) return 1;
  if (current >= 1 && zoom >= t.mediumExit) return 1;
  return 0;
}
