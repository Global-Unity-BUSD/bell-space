import { toCampus, type GeoReference } from './positionGate.ts';

// Live position estimate for the walking experiment. Pure functions over a
// small state object, so the logic is testable without a phone:
// * GPS fixes are blended in by their reported accuracy (combined with the
//   reference-fit error). Fixes worse than `maxFixAccuracy` are ignored.
// * Steps move the estimate along the compass heading only when the heading is
//   calibrated; every step widens the uncertainty, and an uncalibrated compass
//   widens it by a full stride without moving the estimate.
// * A manual "I am here" correction resets the estimate.
// * The estimate is always for the ground floor; no floor is inferred.
// Uncertainty (`radius`) is in metres; positions are campus map units.

export type HeadingReading = { degrees: number; quality: 0 | 1 | 2 | 3; at: number };
export type Fix = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type Estimate = { x: number; y: number; radius: number; source: 'gps' | 'steps' | 'manual'; at: number };
export type TrackerState = { estimate: Estimate | null; steps: number | null; heading: HeadingReading | null };
export type Quality = 'precise' | 'approximate' | 'unknown';

export const TRACKER = {
  strideMetres: 0.7,
  // Fixes with a larger radius than this are too coarse to help.
  maxFixAccuracy: 20,
  // iOS heading calibration levels → uncertainty in degrees.
  headingError: { 3: 20, 2: 35, 1: 50, 0: Infinity } as Record<number, number>,
  // Along-track stride error per step, as a fraction of the stride.
  strideError: 0.1,
  // Uncertainty grows while no reading arrives (people keep walking).
  driftPerSecond: 0.3,
  manualRadius: 2,
  // Proposed thresholds; adjust from the walk tests.
  preciseRadius: 3,
  approximateRadius: 10,
  rerouteRadius: 4,
  advanceDistance: 3,
};

export const emptyTracker = (): TrackerState => ({ estimate: null, steps: null, heading: null });

/** Radius now, including drift since the last update. */
export function currentRadius(e: Estimate, now: number) {
  return e.radius + Math.max(0, (now - e.at) / 1000) * TRACKER.driftPerSecond;
}

export function quality(e: Estimate | null, now: number): Quality {
  if (!e) return 'unknown';
  const r = currentRadius(e, now);
  return r <= TRACKER.preciseRadius ? 'precise' : r <= TRACKER.approximateRadius ? 'approximate' : 'unknown';
}

export function applyFix(state: TrackerState, fix: Fix, ref: GeoReference | null): TrackerState {
  if (!ref) return state;
  const accuracy = Math.hypot(fix.accuracy, ref.residualMetres);
  if (!(accuracy <= TRACKER.maxFixAccuracy)) return state;
  const p = toCampus(fix, ref);
  const prior = state.estimate;
  if (!prior) return { ...state, estimate: { ...p, radius: accuracy, source: 'gps', at: fix.timestamp } };
  // Variance-weighted blend (a 2-D Kalman update with equal x/y variance).
  const r0 = currentRadius(prior, fix.timestamp);
  const k = (r0 * r0) / (r0 * r0 + accuracy * accuracy);
  return { ...state, estimate: {
    x: prior.x + k * (p.x - prior.x), y: prior.y + k * (p.y - prior.y),
    radius: Math.sqrt((r0 * r0 * accuracy * accuracy) / (r0 * r0 + accuracy * accuracy)),
    source: k > 0.5 ? 'gps' : prior.source, at: fix.timestamp,
  } };
}

export function applyHeading(state: TrackerState, heading: HeadingReading): TrackerState {
  return { ...state, heading };
}

/**
 * Cumulative pedometer count (iOS counts from when watching started). Moves
 * the estimate by the new steps when the heading is usable.
 */
export function applySteps(state: TrackerState, cumulative: number, ref: GeoReference | null, now: number): TrackerState {
  const previous = state.steps;
  const next = { ...state, steps: cumulative };
  if (previous === null || cumulative < previous || !state.estimate || !ref) return next;
  const n = cumulative - previous;
  if (!n) return next;
  const metres = n * TRACKER.strideMetres;
  const e = state.estimate;
  const r0 = currentRadius(e, now);
  const h = state.heading;
  const error = h ? TRACKER.headingError[h.quality] : Infinity;
  if (!h || !Number.isFinite(error) || now - h.at > 5000) {
    // Direction unknown: stay put, but the person may be anywhere within a stride per step.
    return { ...next, estimate: { ...e, radius: r0 + metres, source: 'steps', at: now } };
  }
  // Heading is clockwise from true north; local metres are (east, south).
  const rad = (h.degrees * Math.PI) / 180;
  const east = Math.sin(rad) * metres;
  const south = -Math.cos(rad) * metres;
  const c = Math.cos(ref.angle) * ref.scale;
  const s = Math.sin(ref.angle) * ref.scale;
  return { ...next, estimate: {
    x: e.x + c * east - s * south, y: e.y + s * east + c * south,
    radius: r0 + metres * (TRACKER.strideError + Math.sin((error * Math.PI) / 180)),
    source: 'steps', at: now,
  } };
}

export function setManual(state: TrackerState, point: { x: number; y: number }, now: number): TrackerState {
  return { ...state, estimate: { ...point, radius: TRACKER.manualRadius, source: 'manual', at: now } };
}

function distanceToPolyline(p: { x: number; y: number }, line: { x: number; y: number }[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]; const b = line[i];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/**
 * What live position may do for a route right now. Steps advance and
 * rerouting happens only for a precise estimate; otherwise the app shows an
 * approximate position and asks the student to confirm where they are.
 */
export function routeGuidance(e: Estimate | null, now: number, ref: GeoReference | null,
  route: { x: number; y: number }[], nextStepAt: { x: number; y: number } | null) {
  const q = quality(e, now);
  if (!e || !ref || q === 'unknown') return { action: 'confirm' as const, quality: q };
  const toMetres = (units: number) => units / ref.unitsPerMetre;
  const r = currentRadius(e, now);
  const off = toMetres(distanceToPolyline(e, route));
  if (r <= TRACKER.rerouteRadius && off > Math.max(6, 2 * r)) return { action: 'reroute' as const, quality: q, offMetres: off };
  if (q === 'precise' && nextStepAt && toMetres(Math.hypot(e.x - nextStepAt.x, e.y - nextStepAt.y)) <= TRACKER.advanceDistance) {
    return { action: 'advance' as const, quality: q };
  }
  return { action: q === 'precise' ? ('follow' as const) : ('confirm' as const), quality: q };
}
