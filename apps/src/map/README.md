# Interactive campus map

`floors.tsx` registers three levels in one campus frame (`CAMPUS`: 580 × 210
units, zoom 1–24, opening on Building 1 at 3.1×). Each level has a geometry
component, label specs (text labels plus stair markers) and searchable places.
Floor 2 has all three buildings traced in the campus SVG, including Building 1
(12xx) from `2026-10-04_floor-2.svg`; the earlier labeled export is archived.

Rendering (`InteractiveMap.tsx`):
* **Geometry** is an SVG drawn for the *settled* camera, 40% larger than the
  screen on each side. During a gesture or animation, the drawn layer is
  translated and scaled on the GPU from the settled camera to the live one.
  When the fingers lift or the animation ends, it redraws sharply
  (`non-scaling-stroke` lines, detail level from the settled zoom).
* **Labels** (`MapLabels.tsx`, `labelPlan.ts`) are native text views:
  * The plan is computed once per floor and viewport. Each label appears at
    the zoom where it fits its room and no longer overlaps a more important
    label, and fades in over 4% of zoom.
  * Building names vanish above 2.2×.
  * Uncertain labels appear from 5×.
  * Pan moves one container; zoom updates label positions with arithmetic only.
* **Route drawing** (`navigation/RouteOverlay.tsx`) is part of the vector layer.

Two-finger rotation is off (`ROTATION_ENABLED`); the rotation math and tests
remain. The campus SVGs are read by `prepareFloorPlanSvg.cjs`. Layers:
`footprint`, `site`, `walls`, `dividers`, `uncertain-lines`,
`uncertain-symbols` and `stairs` (one path per stair symbol), plus `labels` and
`route-candidates`. See `CAMPUS_MAP.md` for sources.

# Archived: Floor 2 labeled sample map

This pipeline is no longer used by the app. It is kept as a reference for the
Building 1 Floor 2 export (`2026-10-04_floor2-labeled.svg`), whose room labels
were converted into the traced SVG's `U12_ROOMS` table. Nothing below is loaded
at runtime.

The former map input was `2026-10-04_floor2-labeled.svg`. Metro's small transformer
extracted its existing paths at bundle time; there are no generated map files,
network asset fetches, per-frame XML parsing, or alternate zoom-level maps.

## Export-specific geometry

The SVG has a gray base, 176 individual label glyph paths, and one huge
masked stroke path. Its first 377 closed subpaths contain the original
building, hallways and partitions; the next four contain the border. The
exported outside-background mask clips the walls away, and thousands of tiny
remaining outline fragments are mostly clipped too. The adapter renders the
same walls and border directly, omitting the costly masked glyph outlines
(which can contribute subpixel edge differences).
Glyph paths are joined per source label without changing their coordinates.
The SVG itself is untouched. The adapter fails if the expected export order
changes, and its cache key includes all build-time geometry/annotation helpers.

## Source-anchored annotations

`sourceAnnotations.cjs` identifies each four-glyph room number and the three
existing area names. It computes **exact path bounds**, including cubic curve
extrema, and uses each label's bounding-box center as its map-coordinate anchor.
For example, 1202 is anchored at `(58.4182, 223.729)` and 1208 at
`(141.0355, 223.918)` in the original `201 × 258` viewBox. There are no guessed
range-label coordinates. Original glyph contours and their rotated/multiline
orientations are retained.

The floor SVG scales, pans and rotates. `AnnotationLayer.tsx` projects these
anchors using the **same fitted camera, zoom, pan and rotation**, but scales glyphs
separately. Room glyph heights are 10–12 logical screen pixels, independent of
pinch zoom. Area-name glyphs stay within 10–14 pixels per line, including the
existing multiline names. At 8×, labels remain relatively small
inside enlarged rooms instead of becoming 8× larger. Label contours and local
offsets rotate with the floor; they are not counter-rotated to stay upright.

`annotationLayout.ts` computes three stable layouts only when the viewport
changes. Source wall spans constrain local offsets to the room's surrounding
walls. Small offsets (at most six pixels per axis **relative to the anchor**)
avoid walls/doors and label collisions. A label which cannot fit at its minimum
readable size is omitted at that level. It is never moved to another wing or
assigned a fixed screen position. Glyph rectangles include collision padding,
and a thin screen-sized halo helps separate text from the background.

## Discrete detail policy

Zoom is relative to the initial aspect-ratio-preserving viewport fit:

| Zoom | Visible detail |
| --- | --- |
| Overview | Initial level; important building/hallway geometry and a sparse set of actual room IDs, STEAM Lab and Small Quad |
| Medium | Enter at 2×; add room dividers and more individual numbers as space permits |
| Full | Enter at 3.4×; reveal every original wall subpath, all 36 room IDs and all three area names |

Full exits below 3.1×; Medium exits below 1.75×. This hysteresis prevents rapid
switching around a threshold. Visibility, placement and glyph size stay
unchanged throughout each level. Only camera positions change while pinching.
At a crossing, a 140 ms opacity fade settles to the new discrete state; fades
are time-based, never proportional to every small zoom change. Layouts are
checked at the lower hysteresis limits so zooming out within a level is safe.

The annotation overlay updates its small affine transforms on the UI thread.
Pan and rotation use one parent SVG group around the viewport center so labels
can move into view without premature viewport clipping. Individual annotation
worklets do not capture pan or rotation shared values. Zoom uses one derived map
scale and direct glyph matrices, avoiding a temporary projected point per label.
Hidden glyphs emit opacity alone instead of unused transforms (their worklets
still subscribe to zoom through their static closure). The floor's LOD opacity changes only on
level transitions, avoiding expensive per-frame floor-SVG invalidation. No
React state updates or XML parsing occur during gestures. No libraries were
added for this refinement.

The SVG is transformed at bundle time. The transformer's cache key includes
its adapter source, so changes in how the SVG is prepared no longer leave
stale exports such as a missing `labels.areas`. After updating a running Expo
session from an older version, restart it once with `npx expo start --clear`.

## Interaction and checks

One finger pans; two fingers simultaneously zoom and translate about their
moving focal point (rotation is supported by the math but off in the UI). A memoized `Gesture.Manual()` processes a single touch
stream on the UI thread instead of letting separate recognizers overwrite the
same camera. Its attached viewport does not transform, so local touch coordinates
remain stable. Pair order follows pointer IDs, not array order. Pointer changes
rebase without moving the camera; three or more fingers pause movement. The last
touch-up explicitly ends the manual gesture; cancellation clears its baseline.

Zoom is limited to 1–8×. Rotation is continuous through multiple full turns,
without snapping. Translation is constrained to the rotated map's bounding
extents; empty space at rotated corners is expected. When a rotated/scaled axis
is smaller than the viewport, it stays centered. At these bounds, keeping the
map reachable takes precedence over focal anchoring. Incremental rebasing makes
reversing at a zoom/pan bound respond immediately. Nearly coincident fingers are
rebased rather than divided by a tiny distance.

Reset view animates back to 1× zoom, 0° rotation, and centered translation over
250 ms, taking the shortest rotation path. Touches interrupt the reset. Viewport
resizing refits the map and returns to the original orientation.

Run `node --test tests/map.test.cjs` (Node 22.18+ for TypeScript stripping),
`npx expo lint`, and `npx tsc --noEmit`.
Platform bundling can be checked with `npx expo export --platform ios` and
`npx expo export --platform android`.
On iOS and Android devices, check off-center pinch/twist, combined translation,
multiple full turns, one/two/three-finger transitions, cancellation, rotated pan
limits, reset during a gesture, interrupting reset, viewport resize, and discrete
levels in both directions. Verify labels entering from outside the viewport
appear while panning/rotating and glyphs remain aligned at 1×/2×/4×/8×.

The 17 automated tests cover original glyph/wall preservation, room anchors,
bounded sizing/collisions, combined focal anchoring, 2,500 gesture updates,
rotation seams, rotated bounds and hysteresis. Compiled callback tests simulate
reset/cancel/finger transitions. A hook harness checks static worklet-closure
dependencies: pan/rotation update the annotation parent only; zoom projects label
positions without rerunning layouts. These checks do not measure native drawing
cost, animation timing, or FPS.

Physical performance profiling was requested while the Floor 2 export overlay
was still mounted. The 2026-11-01 build removed that mount (the floor switch no
longer draws the export's 377 filled subpaths); the Android stutter was
reported gone after that change. Further profiling is optional. Record
model/OS, app revision, build mode and display refresh rate, and compare
identical 10-second pan, pinch/twist/translation and LOD-crossing sequences in
development and optimized/release builds.
