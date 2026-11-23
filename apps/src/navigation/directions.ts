import { areaRoute, buildWalkGrid, snapToWalkable, type WalkGrid } from './areaRouting.ts';
import { CAMPUS_NETWORK } from './campusNetwork.ts';
import { B1_AREA_DESTINATIONS, B1_ENTRANCES, B1_GROUND_OBSTACLES, B1_GROUND_SPACE, type AreaDestination,
  type Entrance, type Pt } from './data/building1Walkable.ts';
import type { DrawnRoute } from './RouteOverlay';
import { doorFor, routeBetween } from './routing.ts';

// One place for the directions rules shown to students:
// * Open areas (Quad, Student Area, Lunch Shelter, Senior Hill) are routed
//   through checked walkable space, around walls and stairs.
// * Enclosed rooms are offered when the side of their entrance is confirmed.
//   Routes go through the walkable space to an approach point outside that
//   side, then through the door. Door positions along a wall are approximate,
//   so instructions name the side, never an exact door.
// * Other rooms stay unavailable (map review can preview proposed door routes).
// * Stair and ramp connections are not assumed.
export type TripPlace = { id: string; title: string; building: string; floorId: string };
// `live`: the start came from a precise live-location estimate.
export type TripStart = { title: string; level: 1 | 2 | 3; point: Pt; placeId?: string; live?: boolean };
export type TripStep = { text: string; level: 1 | 2 | 3; at: Pt };
export type Trip =
  | { status: 'available'; route: DrawnRoute; steps: TripStep[]; reviewOnly: boolean }
  | { status: 'unavailable'; reasons: string[] };

let grid: WalkGrid | null = null;
/** Building 1 ground walkable grid, built on first use (~20 ms). */
export function groundGrid() {
  grid ??= buildWalkGrid(B1_GROUND_SPACE, B1_GROUND_OBSTACLES);
  return grid;
}

export const areaFor = (placeId: string) => B1_AREA_DESTINATIONS.find((a) => a.placeId === placeId);
export const entranceFor = (placeId: string) =>
  B1_ENTRANCES.find((e) => e.placeId === placeId && e.sideStatus === 'checked');

// A small target around an entrance's approach point.
function approachTarget(e: Entrance): AreaDestination {
  const r = 0.9;
  const region = Array.from({ length: 12 }, (_, i) => ({
    x: e.approach.x + r * Math.cos((i / 12) * 2 * Math.PI), y: e.approach.y + r * Math.sin((i / 12) * 2 * Math.PI) }));
  return { placeId: e.placeId, name: e.name, region, status: 'checked', note: e.note };
}

function centroid(points: Pt[]) {
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length };
}

/** A walkable point to start from for an open-area place, if it is one. */
export function startPointFor(placeId: string): Pt | null {
  const e = entranceFor(placeId);
  if (e) return e.approach;
  const area = areaFor(placeId);
  return area ? snapToWalkable(groundGrid(), centroid(area.region), 6) : null;
}

/** A tapped map point as a start, if it lies in the mapped walkable space. */
export function startFromTap(point: Pt): Pt | null {
  return snapToWalkable(groundGrid(), point, 2);
}

/** Why directions are or aren't offered for a destination, before a start is chosen. */
export function destinationStatus(place: TripPlace, review: boolean): { offered: boolean; reason?: string } {
  if (areaFor(place.id) || entranceFor(place.id)) return { offered: true };
  if (review && doorFor(CAMPUS_NETWORK, place.id)) return { offered: true };
  if (place.building !== '1') return { offered: false, reason: `Directions in Building ${place.building || 'grounds'} are coming later.` };
  if (place.floorId !== 'floor-1') return { offered: false, reason: 'Directions to upper floors are coming later.' };
  return { offered: false, reason: 'Directions aren’t available yet: this entrance hasn’t been confirmed.' };
}

export function planTrip(start: TripStart, destination: TripPlace, review: boolean, names: Record<string, string>): Trip {
  const area = areaFor(destination.id);
  const entrance = entranceFor(destination.id);
  if (area || entrance) {
    if (start.level !== 1) return { status: 'unavailable', reasons: ['Choose a starting point on Floor 1.'] };
    const r = areaRoute(groundGrid(), start.point, entrance ? approachTarget(entrance) : area);
    if (r.status === 'unavailable') return { status: 'unavailable', reasons: [r.reason] };
    const points = [...r.path];
    const steps: TripStep[] = r.steps.map((s) => ({ ...s, level: 1 as const }));
    // Leaving a room: begin at its door, on its confirmed side.
    const from = start.placeId ? entranceFor(start.placeId) : undefined;
    if (from) {
      points.unshift(from.door);
      steps[0] = { text: `Leave ${from.name} by its entrance facing ${from.facing}`, level: 1, at: from.door };
    } else if (start.placeId || start.live) {
      steps[0] = { ...steps[0], text: steps[0].text.replace('your marked spot', start.live ? 'your location' : start.title) };
    }
    if (entrance) {
      points.push(entrance.door);
      steps[steps.length - 1] = { text: `Arrive at the ${entrance.name} entrance, facing ${entrance.facing}`,
        level: 1, at: entrance.door };
    }
    return { status: 'available', reviewOnly: false, route: { legs: [{ level: 1, points }] }, steps };
  }
  if (review && start.placeId) {
    const r = routeBetween(CAMPUS_NETWORK, start.placeId, destination.id, { review: true, names });
    if (r.status === 'available') {
      const { nodes, edges } = r.route;
      const legs: DrawnRoute['legs'] = [];
      nodes.forEach((n, i) => {
        const last = legs[legs.length - 1];
        if (last && last.level === n.level && (i === 0 || edges[i - 1].kind === 'walk')) last.points.push(n);
        else legs.push({ level: n.level, points: [n] });
      });
      const changes = edges.flatMap((e, i) => (e.kind === 'walk' ? [] : [
        { level: nodes[i].level, at: nodes[i] }, { level: nodes[i + 1].level, at: nodes[i + 1] }]));
      return { status: 'available', reviewOnly: r.reviewOnly, route: { legs, changes, reviewOnly: r.reviewOnly }, steps: r.steps };
    }
    return { status: 'unavailable', reasons: r.missing.slice(0, 4).map((m) => `${m.what} not confirmed`) };
  }
  return { status: 'unavailable', reasons: [destinationStatus(destination, review).reason ?? 'Directions aren’t available yet.'] };
}
