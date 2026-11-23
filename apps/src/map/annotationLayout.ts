// Shared map annotation types (labels as read from the map SVGs).
import type { DetailLevel } from './detailPolicy.ts';

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type WallSegment = { x1: number; y1: number; x2: number; y2: number };
export type MapAnnotation = {
  id: string;
  kind: 'room' | 'area' | 'context' | 'building';
  // Floor 2 labels carry the source SVG's glyph contours (`d`); traced plans
  // carry text. The app shows both as native text (see labelPlan.ts).
  d?: string;
  text?: string;
  lines?: string[];
  lineHeight?: number;
  fontSize?: number;
  rotate?: number;
  status?: 'documented' | 'uncertain';
  note?: string;
  building?: string;
  title?: string;
  // Building names show only when zoomed out (maxLevel 0).
  maxLevel?: DetailLevel;
  screenSize?: number;
  anchor: { x: number; y: number };
  bounds: Bounds;
  glyphHeight: number;
  roomBounds: Bounds;
  priority: number;
  minLevel: DetailLevel;
};
