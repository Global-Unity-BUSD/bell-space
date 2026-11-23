import { memo } from 'react';
import { G, Path } from 'react-native-svg';

import map from '../../../maps/2026-10-04_floor2-labeled.svg';
import type { DetailLevel } from './detailPolicy';
import type { MapPlacement } from './placement';

const WALL = '#788791';
// Walls are thin filled outlines in the export. A thin screen-space stroke
// keeps them visible when the whole campus is zoomed out.
const EDGE = { stroke: WALL, strokeWidth: 0.8, vectorEffect: 'non-scaling-stroke' as const };

export const MAP_SIZE = { width: map.width, height: map.height };

// Building 1 Floor 2 geometry from the flat export, drawn inside the campus
// frame at `placement`. Room dividers and fine partitions appear with detail.
export default memo(function Floor2Layers({ placement, detail }: { placement: MapPlacement; detail: DetailLevel }) {
  const { scale, x, y } = placement;
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* The export's base rectangle and border marks frame its canvas, not the
          building, so they are not drawn inside the campus. */}
      <Path {...map.structure.major} fill={WALL} {...EDGE} />
      {detail >= 1 ? <Path {...map.structure.partitions} fill={WALL} {...EDGE} /> : null}
      {detail >= 2 ? <Path {...map.structure.fine} fill={WALL} {...EDGE} /> : null}
    </G>
  );
});
