# Current TODO

## Current Task: Bell Space product pass (2026-10-26)

* **Diagnosis:** on the phone, Chat and Updates said "not available", and
  Settings hid its Account section, because there is no `.env.local`
  (no backend address). This is a configuration gap, not a runtime error. Q&A was
  an unfinished placeholder. The SDK mismatch was fixed by the SDK 58 upgrade.
* **Done:**
  * Renamed to Bell Space (app.json name and slug, header, permission text, docs).
  * Navigation uses the shared buttons; search results show Route or Map only,
    and the destination card states the route status.
  * Chat: a how-it-works card, and state cards for waiting, no guide
    available, connected and ended.
  * Updates: date badges, a 16:9 photo frame, and the sample football event
    with the provided photo (bundled, offline too).
  * Q&A: categories, search, and links to tabs. The answers are sample content in `src/content/qa.ts`.
  * Settings: Account / About Bell Space / hidden Developer tools.
* **Waiting on you:**
  * Supabase project and `.env.local` (`PILOT_SETUP.md`), then the two-phone test.
  * Photo-release approval (`assets/photos/README.md`) and the final Q&A wording.

## Current Task: two-phone pilot for Chat and Updates (2026-10-25)

Implemented (see `PILOT_SETUP.md`):
* **Backend:** Supabase migration with row-level security and checked chat functions,
  tested on real Postgres (`tests/pilot-rules.test.mjs`); seed script for 4 test accounts.
* **Chat:** sign-in only for Chat and posting.
  * Students: Ask as (Anonymous to guide / Show my name), topic, optional
    language and question. Pending, Active and Closed states, with a clear
    "no guide available" message.
  * Guides: availability, a matching queue and Accept.
  * Both sides: realtime messages, End conversation and Report.
  * Reviewers: reported conversations only.
* **Updates:** feed with realtime updates, and a labelled sample football event with a
  placeholder graphic. Editor form for title, date and time, location, text and
  a photo, with draft, publish and unpublish.
* **Settings:** Account and About only. Developer tools (live location, positioning readings,
  proposed routes) open after tapping Version 5 times.

### Waiting on you
* Create the Supabase project and run the two-phone test (`PILOT_SETUP.md`).
* School approvals listed in `PILOT_SETUP.md` before real students use Chat.

## Current Task: Building 1 entrances and the live-location experiment (2026-10-22)

Implemented:
* **Entrances** (`B1_ENTRANCES` in `src/navigation/data/building1Walkable.ts`):
  * 1155–1162 are entered from their bottom side (the Quad); 1138–1144 and the
    Book Room from their top side.
  * The Library is entered from the gap by the Career Center and the Book Room,
    and the Career Center from its bottom side.
  * Each entrance has a door point and an approach point in walkable space. The sides
    are checked, but the door positions are **approximate**
    (`reference/review/entrances.jpg`, `ROUTE_REVIEW.md`).
  * Other rooms (Cafeteria, Admin, 1-159, …) stay unavailable.
* **AR removed** (the button, the badge and the roadmap step).
* **Live location (experimental):** see `POSITIONING_EXPERIMENT.md`. It is off by
  default, and permissions are asked only when it is switched on. It does not work
  until 3+ reference points are measured.

### iPhone checklist

* [ ] Search 1155, then Directions, then start Student Area: the route ends at
  1155's Quad-side wall.
* [ ] 1141 from the Quad: the route arrives from above. Library from 1162: the
  first step is "Leave Room 1162 by its entrance facing the Quad".
* [ ] Cafeteria: no Directions ("entrance hasn't been confirmed").
* [ ] Settings → Live location on: the permission prompts appear only now. The
  chip shows "Map not aligned yet".
* [ ] Walk test in `POSITIONING_EXPERIMENT.md`, then Share log.

### Waiting on you

* Door positions along each row (left of, right of or at each ≈ point).
* 4 reference points plus a shared log from the walk test.

## Current Task — Building 1 corrections and first real directions (2026-10-22)

Implemented from the user's annotations:
* **Map:**
  * The gap between 2101 Drama and the Lunch Shelter is ~3× wider (only its two edges moved).
  * The ramp is drawn in its own style; its Floor 2 connection is a proposal.
  * Senior Hill is a draft circle at the Quad's middle-right edge.
  * The Career Center adjoins the Library.
  * The Lunch Shelter is an open covered area, open on its south and west sides.
  * The open student space is tinted.
* **Directions:**
  * Open-area destinations (Lunch Shelter, Senior Hill, Quad, Student Area) are
    routed inside the walkable space, around walls and stairs.
  * The start is a tapped spot or an open area.
  * Enclosed rooms are not offered until their entrance and path are checked.
* **Performance:**
  * No redraw after a pure pan.
  * The redraw after a pinch is delayed 120 ms and cancelled by the next touch.
  * Overscan is 30%.

Review images: `reference/review/` (gap, ramp, senior-hill, career-center,
lunch-shelter, routes).

### iPhone checklist

* [ ] `npx expo start --clear`; opens on Floor 1 with Building 1 filling the view;
  no teacher parking.
* [ ] Perf: pan for 10 s, then pinch for 10 s (Perf Monitor on). Lifting after a
  pan causes no hitch; after a pinch, one short redraw.
* [ ] The gap beside the Lunch Shelter looks ~3× wider; the ramp (purple, with
  chevrons) is distinct from the teal stairs.
* [ ] Search "Lunch Shelter", then Directions, then "Tap a spot on the map";
  tap in the Student Area. A blue route enters the shelter from the south.
  Start directions, step through, End.
* [ ] Repeat with a tap in the gap west of the shelter: the route enters from the west side.
* [ ] Search "Senior Hill", then Directions, then start "Student Area": the route
  goes around the stairs.
* [ ] Tap inside a room as a start: "Tap a spot in Building 1's open area." appears.
* [ ] (Superseded: 1155 is now routed via its Quad-side entrance.)

### Waiting on you

* Senior Hill: mark its exact spot (no mark was found in the annotations).
* Ramp: confirm the Floor 2 landing (`reference/review/ramp.jpg`).
* Lunch Shelter: confirm its open sides (south and west assumed; north?).
* `ROUTE_REVIEW.md`: barriers in the open space, room entrances, stairs.

## Android Performance (stutter resolved, 2026-11-01)

Diagnose and fix persistent Android map slowdown and unexpected white shapes
over floor lines. The reported stutter followed switching to Floor 2, which
mounted the Building 1 labeled export. The 2026-11-01 build traces that floor
into `2026-10-21_campus-floor2.svg` and removes the overlay; the user reports
the stutter is gone.

**Read [MAP_RENDERING_ISSUE.md](./MAP_RENDERING_ISSUE.md)** for the detailed
investigation plan. The white shapes were never reproduced and remain
unconfirmed; profiling is optional unless a new slowdown appears.

### Fixed — Floor 2 Export Overlay (2026-11-01)

* Building 1 Floor 2 is now traced into `2026-10-21_campus-floor2.svg` from
  `2026-10-04_floor-2.svg`, so floor switching no longer mounts
  `2026-10-04_floor2-labeled.svg` and its 377 filled subpaths. The export is
  archived, not deleted.
* Verified: `node --test tests/map.test.cjs` (40 tests), `npx expo lint`,
  `npx tsc --noEmit`. The user reports the Android stutter is gone; this is
  device feedback, not a measured frame-time capture.

### Open Issue — Persistent Slowdown and White Artifacts

* [ ] Collect phone model/Android version, a marked screenshot of the white
  shapes, and a short reproduction video; see `MAP_RENDERING_ISSUE.md`, Step 1.
* [ ] Establish repeatable Android gesture/frame-time baselines, with three
  measured runs per case and no screen recording during timing captures.
* [ ] Add temporary layer/halo/LOD diagnostic switches and compare variants
  before choosing a fix; opacity-zero alone does not remove update work.
* [ ] Capture native Android traces and compare Expo Go with an installed
  optimized/release build on the same device.
* [ ] Implement the evidence-backed fix and repeat the same device measurements.
* [ ] Confirm the white artifacts are explained/addressed, then verify gestures,
  label alignment, clipping, detail levels, and iOS regression behavior.
* [ ] Record findings in `MAP_RENDERING_ISSUE.md` and remove temporary controls.

### Two-Finger Rotation and Gesture Performance

* [ ] Establish an Android performance baseline for pan, pinch, and LOD
  transitions; record device, build mode, frame times, and dropped frames.
* [ ] Compare development and optimized/release builds; identify gesture,
  annotation, SVG-rendering, or transition bottlenecks.
* [x] Add continuous two-finger rotation alongside simultaneous pinch and
  two-finger translation using the existing gesture/Reanimated stack.
* [x] Coordinate gesture baselines and preserve the map point under the
  moving focal point without duplicate translation or camera jumps.
* [x] Handle one/two/three-finger transitions and gesture cancellation.
* [x] Rotate annotations with the floor while preserving source anchors
  and bounded screen sizes; prefer a shared parent rotation transform.
* [x] Update pan limits for rotated map extents and preserve correct clipping.
* [x] Make Reset view restore centered translation, 1× zoom, and 0° rotation;
  allow gestures to interrupt the reset animation.
* [x] Review and optimize shared camera calculations, per-frame SVG updates,
  allocations, and unnecessary annotation work in multiple passes.
* [x] Preserve viewport-memoized layouts, Overview/Medium/Full levels,
  hysteresis, and transition-only detail fades.
* [x] Update the interaction hint and accessibility description for rotation.
* [x] Extend automated checks for combined focal anchoring, rotated bounds,
  annotation transforms/sizing, and unchanged detail thresholds.
* [x] Run `node --test tests/map.test.cjs`, `npx expo lint`,
  and `npx tsc --noEmit`.
* [ ] Compare before/after performance on Android and verify combined
  gestures, reset, clipping, alignment, and readability on iOS.

### Remaining Map Work

* [ ] Resolve the confirmed persistent Android stutter and reported white artifacts
  using [MAP_RENDERING_ISSUE.md](./MAP_RENDERING_ISSUE.md). Native SVG drawing,
  label halos/updates, fades, and build-mode overhead are hypotheses to test.
* [ ] Improve the zoomed-out layout and explore cleaner organization of visible
  rooms/labels, priorities, spacing, and omissions while retaining useful orientation.
* [ ] Fix remaining room-label positioning/alignment issues against the labeled
  SVG and actual room boundaries; verify anchors and local offsets on devices.
* [ ] Preserve discrete Overview/Medium/Full levels and hysteresis during these
  improvements. Keep detail stable inside each range rather than changing it
  continuously with every zoom update.
* [ ] Recheck movement, alignment, and readability at multiple zoom levels on
  iOS and Android; automated layout checks alone do not establish device quality.

### Map

* [x] Render the existing detailed SVG in the React Native app
* [x] Make the SVG fit correctly within the map viewport
* [x] Add pinch-to-zoom
* [x] Add panning
* [x] Add continuous two-finger rotation, combined with pinch and translation
* [x] Add sensible minimum/maximum zoom
* [x] Keep zooming centered around the user's pinch gesture
* [ ] Confirm pinch smoothness on an iOS and Android device (user reported stutter)

### Dynamic Detail / LOD

* [x] Inspect the existing SVG structure
* [x] Identify groups/elements that should change with zoom
* [x] Define the detail levels from the provided map specification
* [x] Hide less-important details when zooming out
* [x] Reveal additional details when zooming in
* [x] Add smooth opacity transitions where appropriate
* [x] Verify the map becomes progressively more minimal when zoomed out
* [x] Verify the full detailed SVG appears when sufficiently zoomed in

### Verification

* [ ] Test on iOS
* [ ] Test on Android
* [x] Run Expo lint
* [x] Run TypeScript typecheck

### Map Refinement

* [x] Anchor each room/area annotation to exact labeled SVG glyph bounds
* [x] Keep room annotations at readable, bounded screen sizes while geometry zooms
* [x] Use source walls, bounded local offsets and priority-based collision handling
* [x] Replace approximate range labels with SVG-derived individual identifiers
* [x] Use Overview/Medium/Full detail thresholds with hysteresis and short transition fades
* [x] Keep important room identifiers at overview and reveal all labels at Full detail
* [x] Remove redundant masked glyph-outline rendering from the pinch path
* [x] Invalidate Metro cache when the labeled SVG adapter changes
* [ ] Confirm pinch responsiveness and overview readability on devices

### Rotation / Performance Notes (2026-10-07)

* A memoized `Gesture.Manual()` consumes one UI-thread touch stream. Pointer IDs
  stabilize pair ordering. One finger pans; two simultaneously translate, pinch,
  and rotate; three or more pause movement. Adding/removing fingers rebases the
  camera without jumps. Departing touch IDs are excluded from UP payloads on both
  platforms. Tiny finger separations rebase instead of producing invalid scales.
* Labels rotate with the floor and keep their original bounded screen sizes.
  Rotation/pan update one annotation parent, not 39 individual glyph transforms.
  Zoom uses one shared derived map scale and direct label matrices without an
  intermediate point allocation. Hidden labels emit no transform. Layouts and
  floor geometry are not rebuilt during gestures; LOD thresholds are unchanged.
* Pan bounds use rotated map extents (empty corners are possible). Reset returns
  to 1× / 0° / centered translation over 250 ms using the shortest rotation path.
  All four reset animations can be interrupted by touch input.
* Review passes covered camera math, real compiled gesture callbacks and worklet
  dependencies, and production bundling. The 17 tests include 2,500 combined
  rotation/zoom updates, full-turn continuity, finger transitions, reset/cancel,
  rotated bounds, glyph alignment/sizing, and parent-only pan/rotation updates.
  The hook harness captures static worklet-closure dependencies like Reanimated;
  its animation timing is simulated and it does not measure native FPS.
* All 17 tests, Expo lint, TypeScript, targeted full-file ESLint, and Git whitespace
  checks passed. iOS and Android production Hermes exports passed. No SVG files or dependencies
  changed. There is no attached device/Android tooling in this environment, so
  native frame-time baselines, before/after measurements, and physical-device
  smoothness remain open. Implementation checks do not establish stutter removal.
* Device profiling protocol: record model/OS, app revision, build mode and refresh
  rate; compare the same 10-second pan, off-center pinch/twist, combined movement,
  and LOD-crossing sequences at 1×/2×/4×/8×. Capture UI/JS frame times and dropped
  frames in development and release builds. Repeat on Android, then check iOS.
  See `src/map/README.md` for gesture edge cases.

### Implementation / Verification Notes (2026-10-05)

* Only `2026-10-04_floor2-labeled.svg` is imported. Its geometry is extracted
  at bundle time; the original SVG is unchanged. Its export mask hid the wall
  subpaths, so those existing subpaths are rendered outside that mask.
* Source-derived annotations replace approximate range labels. Exact glyph
  bounds anchor all 36 room IDs and three area names. Room label sizes remain
  10–12 logical screen pixels at every zoom; area-name glyphs are 10–14 pixels
  per line. At most six-pixel local offsets are constrained by SVG walls and
  collision checks.
* Stable levels: Overview initially; Medium enters at 2× and exits below 1.75×;
  Full enters at 3.4× and exits below 3.1×. A 140 ms fade happens only at a level
  transition. No continuous zoom-driven visibility changes remain. Full shows
  every original wall subpath and every source room/area label. Zoom is 1–8×.
* The clipped SVG outline/mask was responsible for thousands of extra glyph
  fragments and 177 mask paths. Only the original visible border is drawn;
  unchanged SVG glyph contours now form a separately projected annotation
  layer. UI-thread gestures and discrete transition fades are retained.
  Movement still stutters according to current user feedback; its cause is not
  established. Zoomed-out organization and room-label alignment still need work.
  Smoothness and readability require the iOS/Android device tests above.
* Passed for this refinement: `npx expo lint`, `npx tsc --noEmit`, full-file
  ESLint, `node --test tests/map.test.cjs` (9 tests), and iOS/Android production
  Hermes exports. No dependencies changed.
* Exports are not device tests. Automated tests cover source preservation,
  requested room anchors, bounded sizing/projection during pan/zoom, label/wall
  collisions on phone/tablet sizes, and threshold jitter. Rendered previews at
  Overview, Medium, Full and 8× check visual organization and small high-zoom labels.
* The `areas` runtime error was caused by a transformed SVG from an older
  adapter remaining in Metro's cache. The transformer now keys its cache on
  the adapter source. Restart an existing session with `npx expo start --clear`.
* See `src/map/README.md` for the source adapter, LOD policy and device checks.
* See `SUMMARY.md` for today's architecture, decisions, limitations, and next steps.

## Not Current

Do not work on these until a milestone above starts them:

* indoor positioning beyond the live-location experiment (BLE / Wi-Fi / ML)
* sensor fusion / ML
* production backend, school SSO, push notifications
* analytics and tracking
* beacon deployment
