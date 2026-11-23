import { memo, type ReactElement } from 'react';
import { Circle, G, Path } from 'react-native-svg';

import type { Pt } from './data/building1Walkable';
import type { RouteNetwork } from './routing';
import { mapColors } from '../ui/theme';

const STROKE = { vectorEffect: 'non-scaling-stroke' as const, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, fill: 'none' };

export type DrawnRoute = {
  // Points per floor, in order; only the visible floor is drawn.
  legs: { level: 1 | 2 | 3; points: Pt[] }[];
  // Stair/elevator/ramp points where the route changes floor.
  changes?: { level: 1 | 2 | 3; at: Pt }[];
  reviewOnly?: boolean;
};

/**
 * Route, start point and map-review drawing in campus units, inside the
 * map's vector layer. Routes only come from walkable data, never from
 * straight lines between labels.
 */
export default memo(function RouteOverlay({ level, route, start, activeAt, network, showNetwork, walkable }: {
  level: 1 | 2 | 3;
  route?: DrawnRoute | null;
  start?: { level: 1 | 2 | 3; at: Pt } | null;
  activeAt?: { level: 1 | 2 | 3; at: Pt } | null;
  network?: RouteNetwork;
  showNetwork?: boolean;
  // Walkable outlines to show in map review.
  walkable?: { level: 1 | 2 | 3; outline: Pt[] }[];
}) {
  const parts: ReactElement[] = [];
  if (showNetwork && walkable) {
    walkable.filter((w) => w.level === level).forEach((w, i) => {
      const d = `M${w.outline.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
      parts.push(<Path key={`walk-${i}`} d={d} fill="none" stroke={mapColors.route} strokeWidth={1.5}
        strokeDasharray="2 3" vectorEffect="non-scaling-stroke" opacity={0.7} />);
    });
  }
  if (showNetwork && network) {
    // Map review: proposed door links for enclosed rooms, by status.
    const byId = new Map(network.nodes.map((n) => [n.id, n]));
    for (const status of ['unknown', 'proposed', 'checked'] as const) {
      const d = network.edges.filter((e) => e.status === status).map((e) => {
        const a = byId.get(e.from); const b = byId.get(e.to);
        return a && b && a.level === level && b.level === level ? `M${a.x} ${a.y}L${b.x} ${b.y}` : '';
      }).join('');
      if (d) {
        parts.push(<Path key={`net-${status}`} d={d} {...STROKE} strokeWidth={status === 'checked' ? 3 : 2}
          stroke={status === 'checked' ? mapColors.route : status === 'proposed' ? mapColors.routeReview : '#b91c1c'}
          strokeDasharray={status === 'checked' ? undefined : '4 4'} opacity={0.85} />);
      }
    }
  }
  if (route) {
    const color = route.reviewOnly ? mapColors.routeReview : mapColors.route;
    const d = route.legs.filter((l) => l.level === level && l.points.length > 1)
      .map((l) => `M${l.points.map((p) => `${p.x} ${p.y}`).join('L')}`).join('');
    if (d) {
      parts.push(<Path key="route-casing" d={d} {...STROKE} stroke="#ffffff" strokeWidth={9} />);
      parts.push(<Path key="route" d={d} {...STROKE} stroke={color} strokeWidth={5}
        strokeDasharray={route.reviewOnly ? '9 6' : undefined} />);
    }
    for (const c of route.changes ?? []) {
      if (c.level === level) {
        parts.push(<Circle key={`change-${c.at.x}-${c.at.y}`} cx={c.at.x} cy={c.at.y} r={1.6} fill={mapColors.stair}
          stroke="#ffffff" strokeWidth={2} vectorEffect="non-scaling-stroke" />);
      }
    }
    const lastLeg = route.legs[route.legs.length - 1];
    const end = lastLeg?.points[lastLeg.points.length - 1];
    if (end && lastLeg.level === level) {
      parts.push(<Circle key="end" cx={end.x} cy={end.y} r={1.6} fill={color} stroke="#ffffff"
        strokeWidth={2} vectorEffect="non-scaling-stroke" />);
    }
  }
  if (start && start.level === level) {
    parts.push(<Circle key="start" cx={start.at.x} cy={start.at.y} r={1.6} fill="#ffffff" stroke={mapColors.route}
      strokeWidth={4} vectorEffect="non-scaling-stroke" />);
  }
  if (activeAt && activeAt.level === level) {
    parts.push(<Circle key="step" cx={activeAt.at.x} cy={activeAt.at.y} r={2.6} fill="none" stroke={mapColors.route}
      strokeWidth={2} vectorEffect="non-scaling-stroke" />);
  }
  return <G>{parts}</G>;
});
