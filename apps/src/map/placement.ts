import type { Bounds, MapAnnotation, WallSegment } from './annotationLayout';

// Uniform scale + translation from a source drawing's units into campus units.
// Upper-floor drawings are axis-aligned with the ground plan, so no rotation.
export type MapPlacement = { scale: number; x: number; y: number };

export function placePoint(p: { x: number; y: number }, t: MapPlacement) {
  return { x: p.x * t.scale + t.x, y: p.y * t.scale + t.y };
}

export function placeBounds(b: Bounds, t: MapPlacement): Bounds {
  return { minX: b.minX * t.scale + t.x, minY: b.minY * t.scale + t.y,
    maxX: b.maxX * t.scale + t.x, maxY: b.maxY * t.scale + t.y };
}

// Absolute M/L/H/V/C/Z paths only (the commands used by the Floor 2 export's
// label glyphs). Fails on anything else rather than guessing.
export function placePath(d: string, t: MapPlacement) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  const out: string[] = [];
  let command = '';
  const fmt = (v: number) => String(Math.round(v * 10000) / 10000);
  const X = (v: string) => fmt(Number(v) * t.scale + t.x);
  const Y = (v: string) => fmt(Number(v) * t.scale + t.y);
  for (let i = 0; i < tokens.length;) {
    if (/^[a-zA-Z]$/.test(tokens[i])) { command = tokens[i++]; out.push(command); if (command === 'Z') continue; }
    switch (command) {
      case 'M': case 'L': out.push(X(tokens[i]), Y(tokens[i + 1])); i += 2; break;
      case 'H': out.push(X(tokens[i])); i += 1; break;
      case 'V': out.push(Y(tokens[i])); i += 1; break;
      case 'C':
        out.push(X(tokens[i]), Y(tokens[i + 1]), X(tokens[i + 2]), Y(tokens[i + 3]), X(tokens[i + 4]), Y(tokens[i + 5]));
        i += 6; break;
      default: throw new Error(`Unsupported path command for placement: ${command}`);
    }
  }
  return out.join(' ');
}

export function placeWalls(walls: WallSegment[], t: MapPlacement): WallSegment[] {
  return walls.map((w) => ({ x1: w.x1 * t.scale + t.x, y1: w.y1 * t.scale + t.y,
    x2: w.x2 * t.scale + t.x, y2: w.y2 * t.scale + t.y }));
}

export function placeAnnotations(annotations: MapAnnotation[], t: MapPlacement,
  extra: { idPrefix: string; building: string; title: (a: MapAnnotation) => string }): MapAnnotation[] {
  return annotations.map((a) => ({
    ...a,
    id: `${extra.idPrefix}${a.id}`,
    building: extra.building,
    title: extra.title(a),
    d: a.d ? placePath(a.d, t) : a.d,
    anchor: placePoint(a.anchor, t),
    bounds: placeBounds(a.bounds, t),
    roomBounds: placeBounds(a.roomBounds, t),
    glyphHeight: a.glyphHeight * t.scale,
    fontSize: a.fontSize !== undefined ? a.fontSize * t.scale : undefined,
  }));
}
