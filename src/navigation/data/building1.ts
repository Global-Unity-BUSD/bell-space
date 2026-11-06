import type { Check, EdgeKind, NodeKind, RouteEdge, RouteNetwork, RouteNode } from '../routing';

// Building 1 door network for enclosed rooms: explicit data, separate from the
// map artwork. Open areas (Quad, Student Area, Lunch Shelter, Senior Hill) are
// routed through the walkable areas in building1Walkable.ts instead.
//
// Every element has a check status:
//   checked:  confirmed at school (none yet)
//   proposed: suggested from the campus PDF and needs confirmation
//   unknown:  required but not determinable from the PDF
// Student directions use only `checked` elements. Positions of ground-floor
// points are given in the pixel frame of the earlier Building 1 trace
// (tools/campus-trace/floor1.py) and converted to campus units here, so they
// can be compared with the PDF overlay in reference/proposals/.
const b1 = (x: number, y: number) => ({
  x: Math.round((x + 3897.8 - 120)) / 10,
  y: Math.round((y + 2617.6 - 1900)) / 10,
});

const nodes: RouteNode[] = [];
const edges: RouteEdge[] = [];

function node(id: string, level: 1 | 2 | 3, at: { x: number; y: number }, kind: NodeKind, status: Check,
  extra: Partial<RouteNode> = {}) {
  nodes.push({ id, level, ...at, kind, building: '1', status, ...extra });
}
function edge(from: string, to: string, kind: EdgeKind, status: Check, name?: string, note?: string,
  accessible = kind !== 'stairs') {
  edges.push({ id: `${from}~${to}`, from, to, kind, status, accessible, ...(name ? { name } : {}), ...(note ? { note } : {}) });
}
function chain(ids: string[], name: string, status: Check, note?: string) {
  for (let i = 1; i < ids.length; i++) edge(ids[i - 1], ids[i], 'walk', status, name, note);
}

// ---- Floor 1: covered walkway along the north row (dashed edge in the PDF) ----
const NORTH_Y = 452;
const north: [string, number][] = [['nw', 510], ['n-stair1', 580], ['n-t', 780], ['n-1162', 872], ['n-1161', 964],
  ['n-1160', 1084], ['n-1158', 1285], ['n-east', 1300], ['n-1157', 1405], ['n-1156', 1497], ['n-1155', 1620]];
for (const [id, x] of north) node(`b1-${id}`, 1, b1(x, NORTH_Y), 'junction', 'proposed');
chain(north.map(([id]) => `b1-${id}`), 'north walkway', 'proposed',
  'Covered walkway along the south side of the 1155–1162 row; dashed in the PDF');

// ---- Floor 1: walkway along the Admin Offices and the 1138–1144 row ----
const south: [string, number, number][] = [['sw', 450, 915], ['s-admin', 600, 915], ['s-1138', 756, 915],
  ['s-bend', 850, 915], ['s-1139', 865, 940], ['s-stair3', 902, 940], ['s-1140', 960, 940], ['s-1141', 1055, 940],
  ['s-mid', 1084, 940], ['s-1142', 1150, 940], ['s-1143', 1244, 940], ['s-east', 1300, 940], ['s-1144', 1341, 940],
  ['s-bookrm', 1438, 940]];
for (const [id, x, y] of south) node(`b1-${id}`, 1, b1(x, y), 'junction', 'proposed');
chain(south.map(([id]) => `b1-${id}`), 'south walkway', 'proposed',
  'Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF');

// ---- Floor 1: east walkway (west of the Career Center) and Quad links ----
const east: [string, number][] = [['e-career', 730], ['e-library', 915]];
for (const [id, y] of east) node(`b1-${id}`, 1, b1(1300, y), 'junction', 'proposed');
chain(['b1-n-east', 'b1-e-career', 'b1-e-library', 'b1-s-east'], 'east walkway', 'proposed',
  'Open edge of the Quad west of the Career Center; dashed in the PDF');
node('b1-quad-w', 1, b1(500, 500), 'junction', 'proposed');
edge('b1-nw', 'b1-quad-w', 'walk', 'proposed', 'west side of the Quad');
edge('b1-quad-w', 'b1-sw', 'walk', 'proposed', 'west side of the Quad',
  'Open Quad edge by the Student Area; no boundary is drawn');
edge('b1-n-1160', 'b1-s-mid', 'walk', 'proposed', 'Quad crossing',
  'Straight crossing of the open Quad; planters, steps or fences are not shown in the PDF');
node('b1-library-path', 1, b1(1440, 915), 'junction', 'proposed');
edge('b1-e-library', 'b1-library-path', 'walk', 'proposed', 'Library path',
  'South of the Career Center, toward the Library\'s west side');

// ---- Floor 1: doors (route endpoints) ----
// Proposed doors sit on the wall facing the walkway, at the room's centre.
const doors: [string, string, number, number, string, string, Check][] = [
  ['1162', 'g-b1-room-1162', 872, 430, 'b1-n-1162', 'Quad-facing wall', 'proposed'],
  ['1161', 'g-b1-room-1161', 964, 430, 'b1-n-1161', 'Quad-facing wall', 'proposed'],
  ['1160', 'g-b1-room-1160', 1084, 430, 'b1-n-1160', 'Quad-facing wall', 'proposed'],
  ['1158', 'g-b1-room-1158', 1285, 430, 'b1-n-1158', 'Quad-facing wall', 'proposed'],
  ['1157', 'g-b1-room-1157', 1405, 430, 'b1-n-1157', 'Quad-facing wall', 'proposed'],
  ['1156', 'g-b1-room-1156', 1497, 430, 'b1-n-1156', 'Quad-facing wall', 'proposed'],
  ['1155', 'g-b1-room-1155', 1620, 430, 'b1-n-1155', 'Quad-facing wall', 'proposed'],
  ['restroom-north', '', 780, 430, 'b1-n-t', 'Room labeled T', 'proposed'],
  ['1138', 'g-b1-room-1138', 756, 927, 'b1-s-1138', 'Quad-facing wall', 'proposed'],
  ['1139', 'g-b1-room-1139', 865, 972, 'b1-s-1139', 'Quad-facing wall', 'proposed'],
  ['1140', 'g-b1-room-1140', 960, 972, 'b1-s-1140', 'Quad-facing wall', 'proposed'],
  ['1141', 'g-b1-room-1141', 1055, 972, 'b1-s-1141', 'Quad-facing wall', 'proposed'],
  ['1142', 'g-b1-room-1142', 1150, 972, 'b1-s-1142', 'Quad-facing wall', 'proposed'],
  ['1143', 'g-b1-room-1143', 1244, 972, 'b1-s-1143', 'Quad-facing wall', 'proposed'],
  ['1144', 'g-b1-room-1144', 1341, 972, 'b1-s-1144', 'Quad-facing wall', 'proposed'],
  ['bookrm', 'g-b1-book-room', 1438, 972, 'b1-s-bookrm', 'Quad-facing wall', 'proposed'],
  ['admin', 'g-b1-admin-offices', 600, 927, 'b1-s-admin', 'North wall; entrance not shown in the PDF', 'proposed'],
  ['cafeteria', 'g-b1-cafeteria', 380, 478, 'b1-quad-w', 'South wall; the 2023 event arrow points here', 'proposed'],
  ['career', 'g-b1-career-center', 1419, 860, '', 'Next to the Library (user); entrance not known', 'unknown'],
  ['library', 'g-b1-library', 1483, 915, 'b1-library-path', 'West side, below the Career Center; not confirmed', 'proposed'],
  // No door position can be proposed from the PDF for these places.
  ['wellness', 'g-b1-wellness-center', 370, 262, '', 'Inside the north block; door not shown', 'unknown'],
  ['kitchen', 'g-b1-kitchen', 615, 262, '', 'Inside the north block; door not shown', 'unknown'],
];
for (const [key, placeId, x, y, via, note, status] of doors) {
  const id = `b1-door-${key}`;
  node(id, 1, b1(x, y), 'door', status, { ...(placeId ? { placeId } : {}), note });
  if (via) edge(id, via, 'walk', status, undefined, 'From the door to the walkway');
}

// ---- Stairs: ground symbols and the symbols drawn above them ----
// The three ground-floor stair symbols each line up (within 2.6 map units)
// with a stair symbol on the Floor 2 plan, and those with Floor 3. That is
// evidence, not confirmation: which floors each stair actually serves must be
// checked at school.
const stairs: { key: string; f1?: [number, number]; via?: string; f2: [number, number]; f3?: [number, number]; note: string }[] = [
  { key: 'cafeteria', f1: [582, 536], via: 'b1-n-stair1', f2: [435.7, 125.7], f3: [436.5, 125.6], note: 'Hatched stair near the Cafeteria' },
  { key: 'career', f1: [1474, 547], via: 'b1-n-1156', f2: [524.7, 127.4], f3: [525.3, 126], note: 'Hatched stair north of the Career Center' },
  { key: 'quad-south', f1: [902, 882], via: 'b1-s-stair3', f2: [465.6, 160.8], note: 'Hatched stair on the south side of the Quad' },
];
for (const s of stairs) {
  const f1 = `b1-stair-${s.key}-1`;
  const f2 = `b1-stair-${s.key}-2`;
  node(f1, 1, b1(...s.f1!), 'stair', 'proposed', { note: s.note });
  edge(f1, s.via!, 'walk', 'proposed', undefined, 'Stair foot to the walkway');
  node(f2, 2, { x: s.f2[0], y: s.f2[1] }, 'stair', 'proposed', { note: `${s.note} (Floor 2 landing)` });
  edge(f1, f2, 'stairs', 'proposed', undefined, 'Symbols line up on the Floor 1 and Floor 2 plans; confirm the stair connects them');
  if (s.f3) {
    const f3 = `b1-stair-${s.key}-3`;
    node(f3, 3, { x: s.f3[0], y: s.f3[1] }, 'stair', 'proposed', { note: `${s.note} (Floor 3 landing)` });
    edge(f2, f3, 'stairs', 'proposed', undefined, 'Symbols line up on the Floor 2 and Floor 3 plans; confirm');
  }
}
// The room labeled ELEV. M. may be an elevator or its machine room.
// Its entrance is not shown, so it has no link yet (a link would cross a wall).
node('b1-elevator-1', 1, b1(1432, 654), 'elevator', 'unknown', { note: 'Room labeled ELEV. M.; elevator and entrance not confirmed' });

export const BUILDING1_NETWORK: RouteNetwork = { nodes, edges };
