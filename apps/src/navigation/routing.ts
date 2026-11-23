import type { WallSegment } from '../map/annotationLayout';

// Walkable route network in campus units (the same frame as every map level),
// kept separate from the map artwork. Nodes are room doors, walkway/hallway
// junctions, entrances, stair landings, elevators and ramp points; edges are
// walkable connections between them. Routes start and end at doors, never at
// printed room labels, and student directions use only `checked` data.
export type Check = 'checked' | 'proposed' | 'unknown';
export type NodeKind = 'door' | 'junction' | 'entrance' | 'stair' | 'elevator' | 'ramp';
export type EdgeKind = 'walk' | 'stairs' | 'elevator' | 'ramp';

export type RouteNode = {
  id: string;
  level: 1 | 2 | 3;
  x: number;
  y: number;
  kind: NodeKind;
  building?: string;
  // Searchable place this door serves (the place's map label id).
  placeId?: string;
  status: Check;
  note?: string;
};

export type RouteEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  // Walkway or hallway name used in instructions, e.g. "north walkway".
  name?: string;
  // Step-free: no stairs on this edge.
  accessible: boolean;
  status: Check;
  note?: string;
  // Optional measured length (campus units); otherwise straight-line length.
  length?: number;
};

export type RouteNetwork = { nodes: RouteNode[]; edges: RouteEdge[] };
export type Route = { nodes: RouteNode[]; edges: RouteEdge[]; length: number };
export type Step = { text: string; level: 1 | 2 | 3; at: { x: number; y: number } };
export type MissingItem = { id: string; what: string; status: Check | 'missing'; note?: string };
export type RouteResult =
  | { status: 'available'; route: Route; steps: Step[]; reviewOnly: boolean }
  | { status: 'unavailable'; missing: MissingItem[] };

// Moving between levels costs extra so routes do not change floors needlessly.
const LEVEL_CHANGE_COST = { stairs: 15, elevator: 25, ramp: 5, walk: 0 } as const;
const CHECKED_ONLY: Check[] = ['checked'];

function edgeLength(edge: RouteEdge, a: RouteNode, b: RouteNode) {
  return (edge.length ?? Math.hypot(a.x - b.x, a.y - b.y)) + LEVEL_CHANGE_COST[edge.kind];
}

/**
 * Shortest route between two nodes (Dijkstra) using only nodes and edges whose
 * status is in `allow` (checked only, by default). Returns null if none.
 */
export function findRoute(network: RouteNetwork, fromId: string, toId: string,
  options: { accessibleOnly?: boolean; allow?: Check[] } = {}): Route | null {
  const allow = options.allow ?? CHECKED_ONLY;
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  const usable = (n?: RouteNode): n is RouteNode => Boolean(n && allow.includes(n.status));
  if (!usable(nodes.get(fromId)) || !usable(nodes.get(toId))) return null;
  const adjacency = new Map<string, { edge: RouteEdge; to: string; cost: number }[]>();
  for (const edge of network.edges) {
    if (!allow.includes(edge.status)) continue;
    if (options.accessibleOnly && !edge.accessible) continue;
    const a = nodes.get(edge.from); const b = nodes.get(edge.to);
    if (!usable(a) || !usable(b)) continue;
    const cost = edgeLength(edge, a, b);
    adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), { edge, to: b.id, cost }]);
    adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), { edge, to: a.id, cost }]);
  }
  const distance = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, { node: string; edge: RouteEdge }>();
  const open = new Set([fromId]);
  while (open.size) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const d = distance.get(id) ?? Infinity;
      if (d < best) { best = d; current = id; }
    }
    open.delete(current);
    if (current === toId) break;
    for (const { edge, to, cost } of adjacency.get(current) ?? []) {
      const next = best + cost;
      if (next < (distance.get(to) ?? Infinity)) {
        distance.set(to, next);
        previous.set(to, { node: current, edge });
        open.add(to);
      }
    }
  }
  if (!distance.has(toId)) return null;
  const pathNodes: RouteNode[] = [];
  const pathEdges: RouteEdge[] = [];
  for (let id: string | undefined = toId; id;) {
    pathNodes.unshift(nodes.get(id)!);
    const step = previous.get(id);
    if (step) pathEdges.unshift(step.edge);
    id = step?.node;
  }
  return { nodes: pathNodes, edges: pathEdges, length: distance.get(toId)! };
}

export function doorFor(network: RouteNetwork, placeId: string) {
  return network.nodes.find((n) => n.kind === 'door' && n.placeId === placeId);
}

const EDGE_WHAT: Record<EdgeKind, string> = { walk: 'walkway', stairs: 'stair connection', elevator: 'elevator connection', ramp: 'ramp connection' };
const NODE_WHAT: Record<NodeKind, string> = { door: 'door', junction: 'walkway point', entrance: 'entrance', stair: 'stair', elevator: 'elevator', ramp: 'ramp' };

/**
 * Route between two places (by their map label ids). With `review`, proposed
 * data is allowed so the network can be checked on site; such routes are
 * marked `reviewOnly`. When no route exists, lists the data that is missing
 * or still needs checking, using the best candidate path when there is one.
 */
export function routeBetween(network: RouteNetwork, fromPlace: string, toPlace: string,
  options: { accessibleOnly?: boolean; review?: boolean; names?: Record<string, string> } = {}): RouteResult {
  const names = options.names ?? {};
  const from = doorFor(network, fromPlace);
  const to = doorFor(network, toPlace);
  const missing: MissingItem[] = [];
  if (!from) missing.push({ id: fromPlace, what: `Door of ${names[fromPlace] ?? fromPlace}`, status: 'missing' });
  if (!to) missing.push({ id: toPlace, what: `Door of ${names[toPlace] ?? toPlace}`, status: 'missing' });
  if (!from || !to) return { status: 'unavailable', missing };
  const allow: Check[] = options.review ? ['checked', 'proposed'] : CHECKED_ONLY;
  const doorItem = (n: RouteNode, place: string): MissingItem =>
    ({ id: n.id, what: `Door of ${names[place] ?? place}`, status: n.status, note: n.note });
  const route = findRoute(network, from.id, to.id, { accessibleOnly: options.accessibleOnly, allow });
  if (route) {
    return { status: 'available', route, steps: routeSteps(route, names),
      reviewOnly: [...route.nodes, ...route.edges].some((x) => x.status !== 'checked') };
  }
  // Unconfirmed doors are always named, even when nothing connects to them yet.
  if (!allow.includes(from.status)) missing.push(doorItem(from, fromPlace));
  if (!allow.includes(to.status)) missing.push(doorItem(to, toPlace));
  const candidate = findRoute(network, from.id, to.id, { accessibleOnly: options.accessibleOnly,
    allow: ['checked', 'proposed', 'unknown'] });
  if (!candidate) {
    missing.push({ id: `${from.id}…${to.id}`, status: 'missing',
      what: `A walkable connection between ${names[fromPlace] ?? fromPlace} and ${names[toPlace] ?? toPlace}` });
    return { status: 'unavailable', missing };
  }
  for (const n of candidate.nodes) {
    // Walkway points are covered by their walkway links; doors were named above.
    if (n.kind === 'junction' || n.id === from.id || n.id === to.id) continue;
    if (!allow.includes(n.status)) {
      const place = n.placeId ? names[n.placeId] ?? n.placeId : '';
      missing.push({ id: n.id, status: n.status, note: n.note,
        what: n.kind === 'door' && place ? `Door of ${place}` : `${NODE_WHAT[n.kind]} ${n.id}` });
    }
  }
  for (const e of candidate.edges) {
    if (!allow.includes(e.status)) {
      missing.push({ id: e.id, status: e.status, note: e.note, what: `${e.name ?? EDGE_WHAT[e.kind]} (${e.id})` });
    }
  }
  return { status: 'unavailable', missing };
}

function turnWord(ax: number, ay: number, bx: number, by: number) {
  // Screen coordinates (y down): a positive cross product is a right turn.
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  const angle = Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
  if (angle < 35) return 'straight';
  if (angle > 150) return 'back';
  return cross > 0 ? 'right' : 'left';
}

/** Plain-language steps; consecutive segments on one walkway are merged. */
export function routeSteps(route: Route, names: Record<string, string> = {}): Step[] {
  const { nodes, edges } = route;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const placeName = (n: RouteNode) => (n.placeId ? names[n.placeId] ?? n.placeId : 'the start');
  const steps: Step[] = [{ text: `Leave ${placeName(first)} by its door`, level: first.level, at: first }];
  let currentName: string | undefined;
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const a = nodes[i];
    const b = nodes[i + 1];
    if (edge.kind === 'stairs' || edge.kind === 'elevator' || edge.kind === 'ramp') {
      const way = edge.kind === 'stairs' ? 'the stairs' : edge.kind === 'elevator' ? 'the elevator' : 'the ramp';
      steps.push({ text: `Take ${way} ${b.level > a.level ? 'up' : 'down'} to Floor ${b.level}`, level: b.level, at: b });
      currentName = undefined;
      continue;
    }
    if (!edge.name || edge.name === currentName) continue;
    const prev = i > 0 ? nodes[i - 1] : undefined;
    const turn = prev && edges[i - 1].kind === 'walk'
      ? turnWord(a.x - prev.x, a.y - prev.y, b.x - a.x, b.y - a.y) : 'straight';
    const verb = turn === 'left' ? 'Turn left onto' : turn === 'right' ? 'Turn right onto'
      : currentName ? 'Continue onto' : 'Follow';
    steps.push({ text: `${verb} the ${edge.name}`, level: a.level, at: a });
    currentName = edge.name;
  }
  steps.push({ text: `Arrive at the door of ${placeName(last)}`, level: last.level, at: last });
  return steps;
}

function segmentsCross(ax: number, ay: number, bx: number, by: number, w: WallSegment) {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(w.x1, w.y1, w.x2, w.y2, ax, ay);
  const d2 = d(w.x1, w.y1, w.x2, w.y2, bx, by);
  const d3 = d(ax, ay, bx, by, w.x1, w.y1);
  const d4 = d(ax, ay, bx, by, w.x2, w.y2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Data checks: every edge references known nodes, level changes only happen
 * on stairs/elevator/ramp edges, stairs are never step-free, doors name a
 * place, and same-level walk edges do not pass through a solid wall.
 */
export function validateNetwork(network: RouteNetwork, wallsByLevel: Record<number, WallSegment[]>): string[] {
  const problems: string[] = [];
  const nodes = new Map(network.nodes.map((n) => [n.id, n]));
  if (nodes.size !== network.nodes.length) problems.push('Duplicate node ids');
  if (new Set(network.edges.map((e) => e.id)).size !== network.edges.length) problems.push('Duplicate edge ids');
  for (const edge of network.edges) {
    const a = nodes.get(edge.from); const b = nodes.get(edge.to);
    if (!a || !b) { problems.push(`Edge ${edge.from}→${edge.to} references a missing node`); continue; }
    if (a.level !== b.level && edge.kind === 'walk') problems.push(`Walk edge ${a.id}→${b.id} changes level`);
    if (a.level === b.level && edge.kind !== 'walk') problems.push(`${edge.kind} edge ${a.id}→${b.id} stays on one level`);
    if (edge.kind === 'stairs' && edge.accessible) problems.push(`Stairs edge ${a.id}→${b.id} marked step-free`);
    if (a.level === b.level && edge.kind === 'walk' && a.kind !== 'door' && b.kind !== 'door') {
      const wall = (wallsByLevel[a.level] ?? []).find((w) => segmentsCross(a.x, a.y, b.x, b.y, w));
      if (wall) problems.push(`Walk edge ${a.id}→${b.id} crosses a wall`);
    }
  }
  return problems;
}
