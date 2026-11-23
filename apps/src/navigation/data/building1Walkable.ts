import type { Check } from '../routing';

// Building 1 ground-level walkable space: explicit routing data, separate from
// the map artwork. Coordinates are written in the pixel frame of the earlier
// Building 1 trace (tools/campus-trace/floor1.py) and converted to campus
// units, so they can be compared with the PDF and the review images.
const b1 = ([x, y]: [number, number]) => ({ x: (x + 3897.8 - 120) / 10, y: (y + 2617.6 - 1900) / 10 });
const poly = (points: [number, number][]) => points.map(b1);
const rect = (x0: number, y0: number, x1: number, y1: number) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
function circle(cx: number, cy: number, r: number, sides = 24) {
  return poly(Array.from({ length: sides }, (_, i) => [cx + r * Math.cos((i / sides) * 2 * Math.PI),
    cy + r * Math.sin((i / sides) * 2 * Math.PI)] as [number, number]));
}

export type Pt = { x: number; y: number };
export type WalkableSpace = {
  id: string;
  level: 1 | 2 | 3;
  // Outline of the open space. Its edges follow real walls and building fronts.
  outline: Pt[];
  status: Check;
  source: string;
};
export type Obstacle = { id: string; kind: 'stair' | 'structure'; outline: Pt[]; note: string };
export type AreaDestination = {
  placeId: string;
  name: string;
  region: Pt[];
  status: Check;
  note: string;
};

/**
 * Quad, Student Area, Lunch Shelter, the widened gap beside it and the covered
 * walkways along the room rows. Outside it: every building, the Career Center
 * next to the Library, and the corner structures. Confirmed as generally
 * walkable by the user on 2026-10-22.
 */
export const B1_GROUND_SPACE: WalkableSpace = {
  id: 'b1-ground-open-space',
  level: 1,
  outline: poly([[-42, 80], [52, 80], [52, 134], [246, 134], [246, 478], [487, 478], [487, 430], [1655, 430],
    [1655, 480], [1699, 480], [1699, 770], [1640, 770], [1640, 623], [1319, 623], [1319, 784], [1355, 784],
    [1355, 860], [1483, 860], [1483, 972], [837, 972], [837, 927], [-10, 927], [-10, 478], [-42, 478]]),
  status: 'checked',
  source: 'User, 2026-10-22: the student area, Quad, Lunch Shelter and the open space between them are generally walkable. Edges from the campus PDF walls.',
};

// Stairs are not flat walking space: routes go around them. Whether each stair
// connects to an upper floor is not assumed (see building1.ts).
export const B1_GROUND_OBSTACLES: Obstacle[] = [
  { id: 'stair-cafeteria', kind: 'stair', outline: rect(543, 478, 622, 595), note: 'Hatched stair near the Cafeteria' },
  { id: 'stair-career', kind: 'stair', outline: rect(1418, 510, 1530, 585), note: 'Hatched stair north of the Career Center block' },
  { id: 'stair-quad-south', kind: 'stair', outline: rect(820, 860, 985, 905), note: 'Hatched stair on the south side of the Quad' },
];

// Open-area destinations a route can end in. A route ends where it first
// enters the area, so the Lunch Shelter is reached through whichever open side
// is nearest (south toward the Student Area, west toward the gap).
export const B1_AREA_DESTINATIONS: AreaDestination[] = [
  { placeId: 'g-b1-lunch-shelter', name: 'Lunch Shelter', region: rect(52, 134, 246, 478), status: 'checked',
    note: 'Wide open covered area with no doors; open on its south and west sides' },
  { placeId: 'g-b1-senior-hill', name: 'Senior Hill', region: circle(1215, 700, 80), status: 'checked',
    note: 'Round student area at the middle-right edge of the Quad; boundary is a draft' },
  { placeId: 'g-b1-quad', name: 'Quad', region: rect(487, 478, 1300, 925), status: 'checked', note: 'Open Quad' },
  { placeId: 'g-b1-student-area', name: 'Student Area', region: rect(-10, 501, 455, 904), status: 'checked',
    note: 'Open area west of the Quad' },
];

// The ramp you confirmed: straight approach north through the gap between
// 2101 Drama and the Lunch Shelter, a right turn, then up the curved band to
// Building 1 Floor 2 (the west wing by 1223). Proposed only; not used in routes
// until the Floor 2 landing and access are confirmed.
export const B1_RAMP_PROPOSAL = {
  status: 'proposed' as Check,
  approach: [b1([7, 477]), b1([7, 80])],
  turn: b1([9, 79]),
  // Page px (4343, 2667) from your annotation, which lies over the 12xx plan's west wing.
  floor2Landing: { x: 422.3, y: 76.7 },
  note: 'Connects the ground-level gap to Building 1 Floor 2; landing position and access to be confirmed',
};

// ---- Entrances (user, 2026-10-22) ----
// * The ground-floor classroom row at the top of the map opens from its
//   bottom side, onto the open student area and Quad.
// * The classroom row at the bottom of the map opens from its top side.
// * The Library entrance is in the gap between the Career Center and the
//   Book Room; the Career Center opens on its bottom side, below its name.
// The side of each entrance is confirmed. Where along that wall the door is
// is not: door points sit at the middle of the wall and are `approximate`.
// Each door has an approach point just outside it, inside the walkable space,
// where a route arrives before the last step through the door.
export type Entrance = {
  placeId: string;
  name: string;
  // Where the entrance faces, for instructions.
  facing: string;
  door: Pt;
  approach: Pt;
  sideStatus: Check;
  positionStatus: 'approximate' | 'checked';
  note: string;
};

const APPROACH = 15; // crop px (1.5 map units) out from the wall
function entrance(placeId: string, name: string, facing: string, door: [number, number], out: [number, number],
  note: string): Entrance {
  return { placeId, name, facing, door: b1(door), approach: b1([door[0] + out[0] * APPROACH, door[1] + out[1] * APPROACH]),
    sideStatus: 'checked', positionStatus: 'approximate', note };
}
const NORTH_ROW: [string, number][] = [['1162', 872], ['1161', 964], ['1160', 1084], ['1158', 1285], ['1157', 1405],
  ['1156', 1497], ['1155', 1620]];
const SOUTH_ROW: [string, number][] = [['1139', 865], ['1140', 960], ['1141', 1055], ['1142', 1150], ['1143', 1244],
  ['1144', 1341]];

export const B1_ENTRANCES: Entrance[] = [
  ...NORTH_ROW.map(([room, x]) => entrance(`g-b1-room-${room}`, `Room ${room}`, 'the Quad', [x, 430], [0, 1],
    'Bottom side of the top classroom row (confirmed); door position along the wall approximate')),
  entrance('g-b1-room-1138', 'Room 1138', 'the Student Area', [756, 927], [0, -1],
    'Top side of the bottom classroom row (confirmed); door position approximate'),
  ...SOUTH_ROW.map(([room, x]) => entrance(`g-b1-room-${room}`, `Room ${room}`, 'the Quad', [x, 972], [0, -1],
    'Top side of the bottom classroom row (confirmed); door position along the wall approximate')),
  entrance('g-b1-book-room', 'Book Room', 'the Quad', [1438, 972], [0, -1],
    'Top side of the bottom classroom row (confirmed); door position approximate'),
  entrance('g-b1-library', 'Library', 'the gap by the Career Center and Book Room', [1483, 916], [-1, 0],
    'In the gap between the Career Center and the Book Room (confirmed); exact point approximate'),
  entrance('g-b1-career-center', 'Career Center', 'the Quad', [1419, 860], [0, 1],
    'Bottom side, below the name (confirmed); exact point approximate'),
];
