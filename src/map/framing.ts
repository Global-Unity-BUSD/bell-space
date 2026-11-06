import type { Bounds } from './annotationLayout.ts';
import { boundFrame, clamp, type PanBounds, type ZoomLimits } from './mapMath.ts';

// Opening view for one floor in the shared campus frame. Floors are framed on
// their drawn bounds, so the top and bottom margins match, while `focus`
// decides which part of the floor the camera opens on.
export type FloorFrame = {
  // Map point placed at the viewport centre when the floor opens. y defaults
  // to the vertical centre of the drawn content.
  focus: { x: number; y?: number };
  // Zoom relative to the whole-canvas fit, or the share of the usable viewport
  // height that the drawn content should fill.
  zoom?: number;
  fillHeight?: number;
};

export type StartCamera = { zoom: number; x: number; y: number };
type Canvas = { width: number; height: number };

// A search panel or keyboard can cover the bottom of the map. Camera moves use
// the height that is still visible, and the map is drawn half the covered
// height higher, so framed content is centred in what the student can see.
export function visibleHeight(height: number, inset: number) {
  return Math.max(1, height - Math.max(0, inset));
}

export function insetShift(inset: number) {
  return Math.max(0, inset) / 2;
}

// Pan limits around the floor's drawn content, measured at zoom 1.
export function contentPan(bounds: Bounds, canvas: Canvas, fitScale: number): PanBounds {
  const width = Math.max(0, bounds.maxX - bounds.minX) * fitScale;
  const height = Math.max(0, bounds.maxY - bounds.minY) * fitScale;
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;
  return {
    width, height,
    centreX: (canvas.width / 2 - centreX) * fitScale,
    centreY: (canvas.height / 2 - centreY) * fitScale,
  };
}

// Camera that opens the floor: zoom from the frame (or a share of the usable
// height), centred on the frame's focus and kept inside the content bounds.
export function startCamera(frame: FloorFrame, pan: PanBounds, canvas: Canvas, fitScale: number,
  width: number, height: number, limits: ZoomLimits): StartCamera {
  const fill = frame.fillHeight !== undefined && pan.height > 0
    ? frame.fillHeight * height / pan.height : undefined;
  const zoom = clamp(frame.zoom ?? fill ?? limits.min, limits.min, limits.max);
  const focusY = frame.focus.y ?? canvas.height / 2 - pan.centreY / fitScale;
  return {
    zoom,
    x: boundFrame(zoom * fitScale * (canvas.width / 2 - frame.focus.x), pan.centreX, pan.width, width, zoom),
    y: boundFrame(zoom * fitScale * (canvas.height / 2 - focusY), pan.centreY, pan.height, height, zoom),
  };
}
