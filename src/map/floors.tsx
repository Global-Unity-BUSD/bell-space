import type { ComponentType } from 'react';

import campusFloor1Source from '../../2026-10-21_campus-floor1.svg';
import campusFloor2Source from '../../2026-10-21_campus-floor2.svg';
import campusFloor3Source from '../../2026-10-21_campus-floor3.svg';
import type { MapAnnotation, WallSegment } from './annotationLayout';
import type { DetailThresholds } from './detailPolicy';
import { createLevelGeometry } from './FloorPlanMap';
import type { FloorPlanData, StairSymbol } from './floorPlanTypes';
import type { GeometryProps } from './InteractiveMap';
import type { LabelSpec } from './labelPlan';

export type FloorId = 'floor-1' | 'floor-2' | 'floor-3';

export type Place = {
  key: string;
  // The place's map label id; route data refers to places by this id.
  id: string;
  floorId: FloorId;
  building: string;
  title: string;
  subtitle: string;
  kind: 'room' | 'area' | 'building';
  anchor: { x: number; y: number };
  // Half the label's on-screen height, so the pin can sit just above it.
  labelHalfHeight: number;
};

export type Floor = {
  id: FloorId;
  label: string;
  short: string;
  Geometry: ComponentType<GeometryProps>;
  annotations: MapAnnotation[];
  labels: LabelSpec[];
  walls: WallSegment[];
  places: Place[];
};

// One shared campus frame for every level (units: see CAMPUS_MAP.md).
// The svg.d.ts wildcard types every map as the Floor 2 export; the traced
// campus plans have their own adapter and shape.
const ground = campusFloor1Source as unknown as FloorPlanData;
const upper2 = campusFloor2Source as unknown as FloorPlanData;
const upper3 = campusFloor3Source as unknown as FloorPlanData;

export const CAMPUS = {
  size: { width: ground.width, height: ground.height },
  zoom: { min: 1, max: 24 },
  // Zoom is relative to fitting the whole campus on screen.
  thresholds: { mediumEnter: 2.5, mediumExit: 2.2, fullEnter: 6, fullExit: 5.4 } satisfies DetailThresholds,
  focusZoom: 7,
  padding: 8,
  // Open on Building 1; Buildings 2 and 3 are a pan or pinch away.
  initial: { x: 471, y: 148, zoom: 3.3 },
};

// Building 1 Floor 2 geometry is traced in the campus Floor 2 SVG from
// 2026-10-04_floor-2.svg; the labeled export remains archived.

function titleOf(a: MapAnnotation) {
  if (a.title) return a.title;
  const name = a.text ?? a.id;
  return a.kind === 'room' && /^\d+$/.test(name) ? `Room ${name}` : name;
}

const FLOOR_LABELS: Record<FloorId, string> = { 'floor-1': 'Floor 1', 'floor-2': 'Floor 2', 'floor-3': 'Floor 3' };

function placesOf(floorId: FloorId, annotations: MapAnnotation[]): Place[] {
  return annotations
    // Unverified labels and street names are visible on the map, not searchable.
    // Building names are searchable once, on the ground floor.
    .filter((a) => a.kind !== 'context' && a.status !== 'uncertain'
      && (a.kind !== 'building' || floorId === 'floor-1'))
    .map((a) => ({
      key: `${floorId}:${a.id}`,
      id: a.id,
      floorId,
      building: a.building ?? '',
      kind: a.kind as Place['kind'],
      anchor: a.anchor,
      labelHalfHeight: a.rotate
        ? Math.max(...(a.lines ?? [a.text ?? a.id]).map((l) => l.length)) * 14 * 0.6 / 2
        : (a.lines?.length ?? 1) * 14 * 1.2 / 2,
      title: titleOf(a),
      subtitle: a.kind === 'building' ? 'Campus' : a.building
        ? `Building ${a.building} · ${FLOOR_LABELS[floorId]}` : `Campus grounds · ${FLOOR_LABELS[floorId]}`,
    }));
}

function labelSpecs(annotations: MapAnnotation[], stairs: StairSymbol[]): LabelSpec[] {
  const text: LabelSpec[] = annotations.map((a) => ({
    id: a.id,
    kind: a.kind,
    lines: a.lines ?? [a.text ?? a.id],
    rotate: a.rotate ? -90 : 0,
    uncertain: a.status === 'uncertain',
    anchor: a.anchor,
    room: a.roomBounds,
  }));
  const markers: LabelSpec[] = stairs.map((s) => ({
    id: s.id, kind: 'stair', lines: [], rotate: 0, anchor: { x: s.x, y: s.y },
    room: { minX: s.x, minY: s.y, maxX: s.x, maxY: s.y },
  }));
  return [...text, ...markers];
}

function makeFloor(id: FloorId, short: string, Geometry: Floor['Geometry'], annotations: MapAnnotation[],
  walls: WallSegment[], stairs: StairSymbol[]): Floor {
  return { id, label: FLOOR_LABELS[id], short, Geometry, annotations, labels: labelSpecs(annotations, stairs), walls,
    places: placesOf(id, annotations) };
}

const GHOST = ground.layers.footprint;

export const FLOORS: Record<FloorId, Floor> = {
  'floor-1': makeFloor('floor-1', '1', createLevelGeometry({ plan: ground }), ground.annotations, ground.walls, ground.stairs),
  'floor-2': makeFloor('floor-2', '2', createLevelGeometry({ plan: upper2, ghost: GHOST }),
    upper2.annotations, upper2.walls, upper2.stairs),
  'floor-3': makeFloor('floor-3', '3', createLevelGeometry({ plan: upper3, ghost: GHOST }),
    upper3.annotations, upper3.walls, upper3.stairs),
};

export const FLOOR_ORDER: FloorId[] = ['floor-3', 'floor-2', 'floor-1'];
export const DEFAULT_FLOOR: FloorId = 'floor-1';
export const PLACE_NAMES: Record<string, string> = {};
export const ALL_PLACES: Place[] = (['floor-1', 'floor-2', 'floor-3'] as FloorId[]).flatMap((id) => FLOORS[id].places);
for (const place of ALL_PLACES) PLACE_NAMES[place.id] = place.title;

const normalize = (s: string) => s.toLowerCase().replace(/[·()]/g, ' ').replace(/\s+/g, ' ').trim();

export function searchPlaces(query: string, limit = 30): Place[] {
  const q = normalize(query).replace(/^room\s*/, '');
  if (!q) return [];
  const scored = ALL_PLACES.map((place) => {
    const title = normalize(place.title);
    const bare = title.replace(/^room /, '');
    const words = title.split(' ');
    const score = bare === q ? 0 : bare.startsWith(q) ? 1 : words.some((w) => w.startsWith(q)) ? 2
      : title.includes(q) ? 3 : -1;
    return { place, score };
  }).filter(({ score }) => score >= 0);
  scored.sort((a, b) => a.score - b.score
    || a.place.title.localeCompare(b.place.title, undefined, { numeric: true })
    || a.place.floorId.localeCompare(b.place.floorId));
  return scored.slice(0, limit).map(({ place }) => place);
}
