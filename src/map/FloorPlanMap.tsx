import { memo, type ReactNode } from 'react';
import { G, Path } from 'react-native-svg';

import type { FloorPlanData } from './floorPlanTypes';
import type { GeometryProps } from './InteractiveMap';
import { mapColors } from '../ui/theme';

// Renders a traced campus level (see prepareFloorPlanSvg.cjs) as SVG children
// of the camera group, in campus units. It is drawn only when the camera
// settles, so it can afford screen-space stroke widths that stay crisp and
// evenly weighted at every zoom. Uncertain items are lighter and dotted;
// stairs have their own fill and step lines so they read as stairs.
const LINE = { vectorEffect: 'non-scaling-stroke' as const, strokeLinejoin: 'round' as const, fill: 'none' };

export function createLevelGeometry({ plan, ghost, children }: {
  plan: FloorPlanData;
  // Ground-level footprints shown faintly under an upper floor for orientation.
  ghost?: string;
  children?: (props: GeometryProps) => ReactNode;
}) {
  return memo(function LevelGeometry(props: GeometryProps) {
    const { layers } = plan;
    return (
      <G>
        {ghost ? <Path d={ghost} fill={mapColors.ghost} /> : <Path d={layers.footprint} fill={mapColors.building} />}
        {layers['open-areas'] ? <Path d={layers['open-areas']} fill={mapColors.openArea} /> : null}
        {layers['covered-areas'] ? <Path d={layers['covered-areas']} fill={mapColors.coveredArea} /> : null}
        {layers.hills ? <Path d={layers.hills} fill={mapColors.hill} stroke={mapColors.hillEdge} strokeWidth={1.2}
          strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
        {layers.site ? <Path d={layers.site} stroke={mapColors.site} strokeWidth={1} {...LINE} /> : null}
        <Path d={layers['uncertain-lines']} stroke={mapColors.uncertain} strokeWidth={0.8} strokeDasharray="1.5 2.5" {...LINE} />
        <Path d={layers['uncertain-symbols']} stroke={mapColors.uncertain} strokeWidth={0.8} {...LINE} />
        <Path d={layers.dividers} stroke={mapColors.divider} strokeWidth={0.8} strokeDasharray="3 2.5" {...LINE} />
        <Path d={layers.walls} stroke={mapColors.wall} strokeWidth={1.3} {...LINE} />
        {layers.ramp ? <Path d={layers.ramp} fill={mapColors.rampFill} stroke={mapColors.ramp} strokeWidth={1.4}
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" /> : null}
        {layers['ramp-marks'] ? <Path d={layers['ramp-marks']} stroke={mapColors.ramp} strokeWidth={1.6} {...LINE} /> : null}
        {children?.(props)}
        {layers.stairs ? (
          <Path d={layers.stairs} fill={mapColors.stairFill} stroke={mapColors.stair} strokeWidth={1.1}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ) : null}
      </G>
    );
  });
}
