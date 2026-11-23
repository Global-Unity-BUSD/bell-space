import type { MapAnnotation, WallSegment } from './annotationLayout';

export type RouteCandidate = {
  type: 'stair' | 'elevator' | 'entrance' | 'exit';
  building: string;
  x: number;
  y: number;
  status: 'uncertain';
  note: string;
};

// Output of prepareFloorPlanSvg.cjs for the structured campus floor plans.
export type FloorPlanData = {
  floor: number;
  frame: string;
  coverage: string;
  viewBox: string;
  width: number;
  height: number;
  layers: Record<'footprint' | 'site' | 'walls' | 'dividers' | 'uncertain-lines' | 'uncertain-symbols' | 'stairs'
    | 'open-areas' | 'covered-areas' | 'hills' | 'ramp' | 'ramp-marks', string>;
  annotations: MapAnnotation[];
  walls: WallSegment[];
  stairs: StairSymbol[];
  routeCandidates: RouteCandidate[];
};

// A stair symbol from the source, by its own id; nearby stairs stay separate.
export type StairSymbol = { id: string; building: string; x: number; y: number; note: string };
