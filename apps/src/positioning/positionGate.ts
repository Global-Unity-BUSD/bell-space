// Groundwork for the iPhone positioning experiment (POSITIONING_EXPERIMENT.md).
// No sensors are read here. This module turns surveyed reference points into
// a GPS → campus-map transform and decides whether a phone fix is accurate
// enough to be used as a navigation start. Until a fix passes, students pick
// their starting point manually.

export type GeoPoint = { latitude: number; longitude: number };
export type ReferencePoint = GeoPoint & { x: number; y: number };
export type GeoReference = {
  origin: GeoPoint;
  // campus = scale * R(angle) * local metres (east, south) + offset
  scale: number;
  angle: number;
  offset: { x: number; y: number };
  // Campus units per metre, from the fit (the PDF has no printed scale).
  unitsPerMetre: number;
  // Root-mean-square residual of the reference points, metres.
  residualMetres: number;
};
export type Fix = GeoPoint & { accuracy: number; timestamp: number };
export type GateResult =
  | { usable: true; x: number; y: number; radius: number }
  | { usable: false; reason: 'no-reference' | 'too-inaccurate' | 'stale' | 'off-campus' };

const EARTH_RADIUS = 6371008.8;

// Local tangent-plane metres: x east, y south (to match map y pointing down).
function toLocal(p: GeoPoint, origin: GeoPoint) {
  const lat0 = origin.latitude * Math.PI / 180;
  return {
    x: (p.longitude - origin.longitude) * Math.PI / 180 * EARTH_RADIUS * Math.cos(lat0),
    y: -(p.latitude - origin.latitude) * Math.PI / 180 * EARTH_RADIUS,
  };
}

/**
 * Least-squares similarity (scale, rotation, offset) from at least two
 * surveyed points with both GPS and map coordinates.
 */
export function fitGeoReference(points: ReferencePoint[]): GeoReference {
  if (points.length < 2) throw new Error('At least two reference points are needed.');
  const origin = { latitude: points[0].latitude, longitude: points[0].longitude };
  const local = points.map((p) => toLocal(p, origin));
  const n = points.length;
  const mx = local.reduce((s, p) => s + p.x, 0) / n;
  const my = local.reduce((s, p) => s + p.y, 0) / n;
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  let a = 0; let b = 0; let den = 0;
  local.forEach((p, i) => {
    const u = p.x - mx; const v = p.y - my;
    const X = points[i].x - cx; const Y = points[i].y - cy;
    a += u * X + v * Y;
    b += u * Y - v * X;
    den += u * u + v * v;
  });
  const sa = a / den; const sb = b / den;
  const scale = Math.hypot(sa, sb);
  const angle = Math.atan2(sb, sa);
  const offset = { x: cx - (sa * mx - sb * my), y: cy - (sb * mx + sa * my) };
  const reference = { origin, scale, angle, offset, unitsPerMetre: scale, residualMetres: 0 };
  const squared = points.reduce((sum, p) => {
    const q = toCampus(p, reference);
    return sum + ((q.x - p.x) ** 2 + (q.y - p.y) ** 2) / (scale * scale);
  }, 0);
  return { ...reference, residualMetres: Math.sqrt(squared / n) };
}

export function toCampus(p: GeoPoint, ref: Pick<GeoReference, 'origin' | 'scale' | 'angle' | 'offset'>) {
  const l = toLocal(p, ref.origin);
  const c = Math.cos(ref.angle) * ref.scale;
  const s = Math.sin(ref.angle) * ref.scale;
  return { x: c * l.x - s * l.y + ref.offset.x, y: s * l.x + c * l.y + ref.offset.y };
}

export const DEFAULT_GATE = {
  // Proposed thresholds; replace with values measured at school.
  maxAccuracyMetres: 4,
  maxAgeMs: 10000,
  campus: { width: 580, height: 210 },
};

/**
 * Accept a fix only when the phone's own accuracy estimate is within the
 * threshold, the reading is fresh, and it falls on the campus map.
 */
export function gateFix(fix: Fix, ref: GeoReference | null, now: number, gate = DEFAULT_GATE): GateResult {
  if (!ref) return { usable: false, reason: 'no-reference' };
  if (now - fix.timestamp > gate.maxAgeMs) return { usable: false, reason: 'stale' };
  // The reference fit's own error adds to the phone's estimate.
  const accuracy = Math.hypot(fix.accuracy, ref.residualMetres);
  if (accuracy > gate.maxAccuracyMetres) return { usable: false, reason: 'too-inaccurate' };
  const p = toCampus(fix, ref);
  if (p.x < 0 || p.y < 0 || p.x > gate.campus.width || p.y > gate.campus.height) return { usable: false, reason: 'off-campus' };
  return { usable: true, x: p.x, y: p.y, radius: accuracy * ref.unitsPerMetre };
}
