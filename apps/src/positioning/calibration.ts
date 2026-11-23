import { fitGeoReference, type GeoReference, type ReferencePoint } from './positionGate.ts';
import type { Estimate, Fix } from './tracker.ts';

// Measured reference points (GPS ↔ campus map) and walk-test checkpoints.
// Nothing here guesses the GPS alignment: a reference point is made only by
// standing on a spot tapped on the map while the phone collects fixes.

export type CapturedReference = ReferencePoint & { accuracy: number; samples: number; capturedAt: number };
export type Checkpoint = {
  at: number;
  truth: { x: number; y: number };
  estimate: { x: number; y: number; radius: number; source: Estimate['source'] } | null;
  fixAccuracy: number | null;
  errorMetres: number | null;
  secondsSinceFix: number | null;
};

// A reference point needs this many fixes within this accuracy.
export const CAPTURE = { seconds: 15, minSamples: 5, maxAccuracy: 15 };

/** Accuracy-weighted mean of fixes collected while standing still. */
export function averageFixes(fixes: Fix[], point: { x: number; y: number }, now: number): CapturedReference | null {
  const good = fixes.filter((f) => f.accuracy <= CAPTURE.maxAccuracy);
  if (good.length < CAPTURE.minSamples) return null;
  const w = good.map((f) => 1 / (f.accuracy * f.accuracy));
  const total = w.reduce((a, b) => a + b, 0);
  const latitude = good.reduce((s, f, i) => s + f.latitude * w[i], 0) / total;
  const longitude = good.reduce((s, f, i) => s + f.longitude * w[i], 0) / total;
  // GPS errors over a few seconds are correlated, so averaging does not shrink
  // them much: report the median sample accuracy (conservative).
  const sorted = good.map((f) => f.accuracy).sort((a, b) => a - b);
  return { latitude, longitude, x: point.x, y: point.y, accuracy: sorted[Math.floor(sorted.length / 2)],
    samples: good.length, capturedAt: now };
}

/** Fit from at least three references (two fit exactly and cannot show their own error). */
export function referenceFrom(points: ReferencePoint[]): GeoReference | null {
  return points.length >= 3 ? fitGeoReference(points) : null;
}

export function checkpoint(truth: { x: number; y: number }, estimate: Estimate | null, lastFix: Fix | null,
  ref: GeoReference | null, now: number): Checkpoint {
  const error = estimate && ref ? Math.hypot(estimate.x - truth.x, estimate.y - truth.y) / ref.unitsPerMetre : null;
  return {
    at: now, truth,
    estimate: estimate ? { x: estimate.x, y: estimate.y, radius: estimate.radius, source: estimate.source } : null,
    fixAccuracy: lastFix?.accuracy ?? null, errorMetres: error,
    secondsSinceFix: lastFix ? (now - lastFix.timestamp) / 1000 : null,
  };
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Error summary by estimate source: GPS-led vs step-only (drift). */
export function summarize(log: Checkpoint[]) {
  const by = (source: Estimate['source']) => log.filter((c) => c.estimate?.source === source && c.errorMetres !== null)
    .map((c) => c.errorMetres as number);
  const all = log.filter((c) => c.errorMetres !== null).map((c) => c.errorMetres as number);
  const within = all.length ? log.filter((c) => c.errorMetres !== null && c.estimate
    && (c.errorMetres as number) <= c.estimate.radius).length / all.length : null;
  return {
    checkpoints: log.length,
    medianError: median(all), maxError: all.length ? Math.max(...all) : null,
    gpsMedian: median(by('gps')), stepsMedian: median(by('steps')),
    // Share of checkpoints whose true spot was inside the shown uncertainty circle.
    withinRadius: within,
  };
}
