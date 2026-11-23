import type { AreaDestination, Obstacle, Pt, WalkableSpace } from './data/building1Walkable.ts';

// Routing inside open walkable space (Quad, Student Area, Lunch Shelter...).
// The space is rasterised into a fine grid; a cell is walkable only if it is
// inside the walkable outline, outside every obstacle (stairs, structures),
// and at least `clearance` from any edge, so paths keep off walls. A shortest
// grid path is then straightened by line-of-sight, which never crosses a
// non-walkable cell, so the drawn line cannot cut through a wall or a stair.

export type WalkGrid = {
  level: 1 | 2 | 3;
  originX: number;
  originY: number;
  cell: number;
  cols: number;
  rows: number;
  free: Uint8Array;
};
export type AreaStep = { text: string; at: Pt };
export type AreaRoute =
  | { status: 'available'; path: Pt[]; steps: AreaStep[]; length: number }
  | { status: 'unavailable'; reason: string };

export function pointInPolygon(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function edgesOf(poly: Pt[]) {
  return poly.map((a, i) => [a, poly[(i + 1) % poly.length]] as const);
}

export function buildWalkGrid(space: WalkableSpace, obstacles: Obstacle[],
  options: { cell?: number; clearance?: number } = {}): WalkGrid {
  const cell = options.cell ?? 0.5;
  const clearance = options.clearance ?? 0.7;
  const xs = space.outline.map((p) => p.x); const ys = space.outline.map((p) => p.y);
  const originX = Math.min(...xs); const originY = Math.min(...ys);
  const cols = Math.ceil((Math.max(...xs) - originX) / cell);
  const rows = Math.ceil((Math.max(...ys) - originY) / cell);
  const free = new Uint8Array(cols * rows);
  const edges = [space.outline, ...obstacles.map((o) => o.outline)].flatMap(edgesOf);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: originX + (c + 0.5) * cell, y: originY + (r + 0.5) * cell };
      if (!pointInPolygon(p, space.outline)) continue;
      if (obstacles.some((o) => pointInPolygon(p, o.outline))) continue;
      if (edges.some(([a, b]) => distanceToSegment(p, a, b) < clearance)) continue;
      free[r * cols + c] = 1;
    }
  }
  return { level: space.level, originX, originY, cell, cols, rows, free };
}

const centre = (g: WalkGrid, i: number) =>
  ({ x: g.originX + ((i % g.cols) + 0.5) * g.cell, y: g.originY + (Math.floor(i / g.cols) + 0.5) * g.cell });

export function isWalkable(g: WalkGrid, p: Pt) {
  const c = Math.floor((p.x - g.originX) / g.cell);
  const r = Math.floor((p.y - g.originY) / g.cell);
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.free[r * g.cols + c] === 1;
}

/** Nearest walkable point to `p` within `maxDistance` map units, or null. */
export function snapToWalkable(g: WalkGrid, p: Pt, maxDistance = 2): Pt | null {
  if (isWalkable(g, p)) return p;
  const reach = Math.ceil(maxDistance / g.cell);
  const c0 = Math.floor((p.x - g.originX) / g.cell);
  const r0 = Math.floor((p.y - g.originY) / g.cell);
  let best: Pt | null = null; let bestD = Infinity;
  for (let r = r0 - reach; r <= r0 + reach; r++) for (let c = c0 - reach; c <= c0 + reach; c++) {
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || !g.free[r * g.cols + c]) continue;
    const q = centre(g, r * g.cols + c);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD && d <= maxDistance) { bestD = d; best = q; }
  }
  return best;
}

export function lineOfSight(g: WalkGrid, a: Pt, b: Pt) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (g.cell * 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (!isWalkable(g, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

// Binary heap of [cost, index].
class Heap {
  private items: [number, number][] = [];
  get size() { return this.items.length; }
  push(item: [number, number]) {
    const a = this.items; a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.items; const top = a[0]; const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/** Shortest walkable path from `start` to the first point inside `region`. */
export function findAreaPath(g: WalkGrid, start: Pt, region: Pt[]): Pt[] | null {
  const s = snapToWalkable(g, start);
  if (!s) return null;
  const startIndex = Math.floor((s.y - g.originY) / g.cell) * g.cols + Math.floor((s.x - g.originX) / g.cell);
  const dist = new Float64Array(g.cols * g.rows).fill(Infinity);
  const prev = new Int32Array(g.cols * g.rows).fill(-1);
  const heap = new Heap();
  dist[startIndex] = 0; heap.push([0, startIndex]);
  const moves = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let goal = -1;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    if (pointInPolygon(centre(g, i), region)) { goal = i; break; }
    const c = i % g.cols; const r = Math.floor(i / g.cols);
    for (const [dc, dr, cost] of moves) {
      const nc = c + dc; const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows) continue;
      const n = nr * g.cols + nc;
      if (!g.free[n]) continue;
      // No corner cutting past a blocked cell.
      if (dc && dr && (!g.free[r * g.cols + nc] || !g.free[nr * g.cols + c])) continue;
      const nd = d + cost * g.cell;
      if (nd < dist[n]) { dist[n] = nd; prev[n] = i; heap.push([nd, n]); }
    }
  }
  if (goal < 0) return null;
  const cells: Pt[] = [];
  for (let i = goal; i >= 0; i = prev[i]) cells.unshift(centre(g, i));
  cells[0] = s;
  return simplifyPath(g, cells);
}

/** Drop intermediate points wherever a straight walkable line exists. */
export function simplifyPath(g: WalkGrid, points: Pt[]) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = anchor + 1;
    for (let j = points.length - 1; j > anchor + 1; j--) {
      if (lineOfSight(g, points[anchor], points[j])) { next = j; break; }
    }
    out.push(points[next]);
    anchor = next;
  }
  return out;
}

function turn(a: Pt, b: Pt, c: Pt) {
  const ux = b.x - a.x; const uy = b.y - a.y; const vx = c.x - b.x; const vy = c.y - b.y;
  const cross = ux * vy - uy * vx;
  const angle = Math.atan2(Math.abs(cross), ux * vx + uy * vy) * 180 / Math.PI;
  if (angle < 25) return null;
  const side = cross > 0 ? 'right' : 'left';
  return angle < 60 ? `Bear ${side}` : `Turn ${side}`;
}

const HEADINGS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
function heading(a: Pt, b: Pt) {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 360;
  return HEADINGS[Math.round(deg / 45) % 8];
}

export function areaSteps(path: Pt[], destination: string): AreaStep[] {
  const steps: AreaStep[] = [{ text: `Start at your marked spot and head ${heading(path[0], path[1])}`, at: path[0] }];
  for (let i = 1; i < path.length - 1; i++) {
    const words = turn(path[i - 1], path[i], path[i + 1]);
    if (words) steps.push({ text: words, at: path[i] });
  }
  steps.push({ text: `Arrive at ${destination}`, at: path[path.length - 1] });
  return steps;
}

/**
 * Route from a chosen start point to an open-area destination, entirely
 * inside the walkable space. Only checked spaces and destinations are used.
 */
export function areaRoute(g: WalkGrid | null, start: Pt, destination: AreaDestination | undefined): AreaRoute {
  if (!g) return { status: 'unavailable', reason: 'No walkable area is mapped on this floor yet.' };
  if (!destination) return { status: 'unavailable', reason: 'This place has no confirmed entrance or open side yet.' };
  if (destination.status !== 'checked') return { status: 'unavailable', reason: `${destination.name} is not confirmed yet.` };
  if (!snapToWalkable(g, start)) return { status: 'unavailable', reason: 'Choose a starting point in the open area.' };
  const path = findAreaPath(g, start, destination.region);
  if (!path) return { status: 'unavailable', reason: `No walkable connection to ${destination.name} is mapped.` };
  const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
  return { status: 'available', path, steps: areaSteps(path, destination.name), length };
}
