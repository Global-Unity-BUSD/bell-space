declare module '*.svg' {
  import type { PathProps } from 'react-native-svg';
  import type { MapAnnotation, WallSegment } from './annotationLayout';
  const map: {
    viewBox: string;
    width: number;
    height: number;
    fill: string;
    base: PathProps;
    structure: Record<'major' | 'partitions' | 'fine', PathProps>;
    border: PathProps;
    annotations: MapAnnotation[];
    walls: WallSegment[];
  };
  export default map;
}
