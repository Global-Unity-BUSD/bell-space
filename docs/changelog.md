# Map Work Summary

## 2026-10-26: Bell Space rename and product pass

* **Diagnosis:** no `.env.local`, so no backend: Chat and Updates were
  unavailable and Settings hid Account. Q&A was a placeholder. No runtime
  errors were found in the web run.
* **Changes:**
  * Rename (UI, app.json, permission text, docs, test accounts `*@bellspace-pilot.test`).
  * Navigation: consistent buttons and route-status labels.
  * Chat: state cards and how-it-works.
  * Updates: redesigned cards with date badges, and the provided football photo
    on the sample.
  * Q&A: searchable sample content.
  * Settings: rebuilt.
* **Checks:** 56 tests, lint, TypeScript, expo-doctor 20/20, iOS export, web
  check at phone size.
  * Not tested on an iPhone or against a real Supabase project.

## 2026-10-25 (later): upgrade to Expo SDK 58

* **Why:** Expo Go on the iPhone supports only SDK 58.
* **How:** `npx expo install expo@^58.0.0 --fix`, per Expo's upgrade guide.
  * Upgraded: expo 58.0.19, React Native 0.88.0, React 19.3, Reanimated 4.7.1,
    Worklets 0.13, Gesture Handler 3.3, SVG 15.16, Safe Area Context 5.10,
    expo-location, expo-sensors, expo-image-picker and expo-status-bar to 58.x,
    and eslint-config-expo 58.
  * Unchanged: Supabase, AsyncStorage and PGlite.
* **Code changes:**
  * Refs now use `ComponentRef<typeof View>` / `ComponentRef<typeof ScrollView>`
    for React Native's Strict TypeScript API, which is now the default.
  * The map keeps Gesture Handler's `Gesture.Manual()` builder API, which is
    deprecated in v3 but still supported.
* **Config:** `expo-status-bar` plugin added by the upgrade. The precise-location
  text for the new temporary-accuracy key is set.
* **Checks:**
  * expo-doctor 20/20, 53 tests, lint, TypeScript, and iOS exports with and
    without backend settings.
  * Web run: map, directions, Updates, and Chat question → live queue → accept → live reply.
  * Not yet run on an iPhone.

## 2026-10-25: Chat and Updates two-phone pilot

* **Backend:** a Supabase migration with row-level security on every table.
  Supabase's default grants are revoked; chat changes go only through checked
  functions; photos are in a private bucket.
  * 8 access-rule tests run the real migration in PGlite. Deliberately
    weakening the rules makes them fail.
* **Chat:**
  * A student asks anonymously or with a first name. The question queues
    for available guides matching its topic and language; one guide accepts.
  * Messages arrive in real time. End conversation and Report are available,
    and reviewers see reported chats only. No student directory.
* **Updates:** feed, a sample football event (placeholder graphic, no
  opponent or date), and an editor form with draft, publish and unpublish.
* **Settings:** cleaned up; developer tools are hidden behind 5 taps on
  Version. Chat and Updates are isolated by error boundaries, so Navigation keeps working.
* **Verification:** 53 tests, lint, TypeScript, iOS export.
  * A two-tab browser run against a local stand-in (PGlite, the same
    migration, and an imitation of the realtime service) covered: question,
    queue, accept, live reply, report, reviewer, publish and unpublish.
  * Not yet run against a real Supabase project or on two iPhones.

## 2026-10-22 (evening): Building 1 entrances, live-location experiment, AR removed

* **Entrances:** 17 Building 1 entrances (north row, south row, Book Room,
  Library, Career Center) with checked sides, approximate door points and
  walkable approach points. Routes go to the approach point, then the door.
  Starting from a room begins at its door.
* **Live location (experimental, off by default):** expo-location and
  expo-sensors.
  * Alignment needs 3+ measured reference points.
  * GPS fixes are blended by accuracy; steps are combined with heading for dead
    reckoning, with an uncertainty that grows.
  * There are precise, approximate and unknown markers, plus a set-my-location
    control.
  * Auto-advance and rerouting happen only when precise, on Floor 1 only.
  * A test panel logs checkpoints for error and drift.
* **Removed:** the AR button and AR roadmap.
* **Verification:** 39 tests, lint, TypeScript, an iOS export (permission
  strings checked) and a web walkthrough. No iPhone measurements yet.

## 2026-10-22 (later) — Building 1 corrections, walkable routing, smoother release

* **Map, from the user's annotations:**
  * The gap is ~3× wider; the Lunch Shelter is open covered space (south and west sides open).
  * The Career Center adjoins the Library; Senior Hill is a draft; the Student Area is added.
  * The ramp is drawn, with its Floor 2 landing proposed over the 12xx west wing.
  * Open student space is tinted.
* **Directions:**
  * A grid router (0.5-unit cells, 0.7-unit wall clearance, stairs as
    obstacles, line-of-sight straightening) inside checked walkable space.
  * The start is a tap on the map or an open area. Destinations: Lunch
    Shelter, Senior Hill, Quad, Student Area.
  * Rooms are not offered until their entrances are checked.
* **Performance:**
  * Pure pans no longer redraw the vector map.
  * Pinch redraws are delayed and cancellable; overscan is reduced to 30%.
  * Labels switch without a fade band.
* **Verification:** 33 tests, lint, TypeScript, iOS export; web walkthrough.

## 2026-10-22 — Corrections, readable labels, smoother gestures, directions groundwork

* **Map:**
  * Removed the wrong ramp and the teacher parking.
  * Stairs have their own layer and markers.
  * The app opens on Building 1.
  * Ramp proposal image for review.
* **Labels:** native text, 14 pt bold, planned once per floor and viewport:
  each label appears when it fits its room and stops overlapping more
  important labels. No per-frame layout.
* **Performance:** previously each pan frame redrew two full-screen SVGs (the
  geometry and about 100 text labels with halos), and each pinch frame updated
  every label's SVG transform. Now:
  * geometry is drawn once per settled camera, with 40% overscan;
  * between redraws it is moved and scaled as one layer on the GPU;
  * labels are native views, with pan moving one container and zoom updating
    positions only.
  Not measured on a device yet.
* **Directions:**
  * Building 1 route data with check statuses.
  * Dijkstra route finder with missing-data diagnosis and step wording.
  * Start and destination chosen through search; route drawing; step guide.
  * Map-review preview of proposed routes.
* **Positioning:** GPS→map fit and accuracy gate (tested).
* **Verification:** 28 tests, lint, TypeScript, iOS export; web build walkthrough.

## 2026-10-21 — Campus map structure and design pass

* **Design:** refined header, tab bar, typography and icons; bottom search
  bar with an upward results panel that rides above the keyboard; selection
  card with Cancel and "Directions coming soon"; vertical floor picker;
  "Coming soon" preview screens; Settings without development commentary.
* **Campus:** ground level now spans Buildings 3, 2 and 1 plus parking,
  tennis courts and the reported ramp. Upper floors (22xx, 3-2xx, 12xx, 13xx)
  are placed over their buildings in one shared frame. Every uncertain label,
  symbol and placement is recorded (`docs/campus-map.md`).
* **Rendering:** geometry is drawn as vectors through the camera matrix with
  screen-width strokes (sharp to 24×). This replaces the scaled bitmap and
  needs an iPhone smoothness check.
* **Navigation groundwork:** route-network schema, Dijkstra route finder,
  validator and gate; the network is empty until surveyed.
* **Verification:** 26 tests, lint, TypeScript and an iOS export pass; the UI
  was exercised in a web build at iPhone size. Not yet run on the iPhone.

## 2026-10-18 — First CLEAR 2.0 UI and partial Floor 1

* **Implemented:** app shell renamed to CLEAR 2.0 (five tabs, Navigation by
  default, no sign-in); preview screens for Updates/Chat/Q&A; Settings with
  real version and map status. Navigation: search, pin, centering, card with
  Cancel, zoom +/-, Reset view, floor switcher (an AR placeholder, since removed).
  Rotation disabled in the UI. No new dependencies; icons use react-native-svg.
* **Floor 1:** partial trace of the documented Building 1 ground floor with
  uncertain items marked; Floor 2 stays the default until review.
* **Verification:** 21 tests, Expo lint, TypeScript and an iOS export pass;
  the UI was exercised in a web build. Not yet run on a physical iPhone.

## 2026-10-07 — Two-finger rotation and gesture-path optimization

* **Implemented:** Continuous two-finger rotation combined with pinch and focal
  translation; rotated pan bounds; labels rotating with the floor at bounded
  screen sizes; shortest-path reset to 1×/0°/center; updated interaction hints.
* **Gesture path:** One memoized UI-thread manual gesture coordinates the camera
  from stable pointer IDs. Finger changes rebase, three fingers pause, UP events
  exclude departed IDs, and near-coincident fingers cannot produce invalid zoom.
  Incremental camera updates preserve the focal anchor away from map bounds.
* **Performance review:** Pan/rotation share one annotation parent transform and
  do not trigger individual label worklets. Zoom uses a shared derived scale and
  direct matrices without intermediate point allocations. Stable viewport-only
  layouts, source geometry, and discrete LOD/hysteresis are retained.
* **Verification:** 17 tests pass, including a 2,500-update camera sequence,
  glyph projection/sizing under rotation, real compiled gesture callbacks, and
  static worklet-dependency checks. Expo lint, TypeScript, targeted full-file
  ESLint, whitespace checks, and iOS/Android production Hermes exports pass.
  Hook tests simulate timing and do not measure native render performance.
* **Open:** No device is attached here. Android baseline/release comparisons and
  before/after frame times, then iOS smoothness checks, remain in `TODO.md`.
  Reported stutter is not confirmed resolved. Overview organization and remaining
  label alignment work are still open. No dependencies or SVG sources changed.

## 2026-10-05 — Interactive sample map and annotation refinement

* **Implemented:** Expo rendering of the labeled floor-2 SVG, viewport fitting,
  focal pinch-to-zoom, bounded panning, 1–8× zoom, and animated reset. Added
  source-derived room annotations, collision-aware placement, bounded label
  sizes, discrete detail levels, and SVG-transform cache invalidation.
* **Organization:** The labeled SVG is the sole map source. Metro extracts its
  existing geometry and label metadata at bundle time. `LabeledMap` renders
  structural layers; `InteractiveMap` owns the shared gesture/camera state;
  `AnnotationLayer` projects 36 room IDs and three area names using that camera.
  Label layouts are precomputed per viewport. Anchors come from glyph bounds,
  with small wall-constrained offsets; screen-sized glyphs prevent oversized text.
* **Zoom/detail:** Overview retains major structure and selected identifiers.
  Medium enters at 2× and adds rooms/dividers; Full enters at 3.4× and reveals
  all available geometry and labels. Exit thresholds of 1.75× and 3.1× provide
  hysteresis. Detail stays stable within a level; a 140 ms fade accompanies
  transitions. Camera/annotation positions still update during movement.
* **Decisions:** Preserve original SVG coordinates and glyph contours rather
  than redraw the floor or use alternate maps. Separate annotations from floor
  scaling. Replace approximate range-label placements with source-anchored
  identifiers. Bypass the export mask that hid existing walls and omit its
  redundant masked glyph outlines. Keep the existing Expo-compatible stack
  and the project limited to the sample 2D map stage.
* **Current limitations:** Movement still stutters; zoom/detail logic is a
  possible contributor, not a proven cause. Room-label alignment and overview
  organization remain imperfect. Placement uses export-specific glyph indices
  and nearby wall spans, not semantic room polygons. Automated checks and
  production exports do not verify native gesture smoothness or device layout.
* **Next:** Profile gesture-time calculations/rerenders and native SVG updates,
  optimize movement, improve overview label selection/spacing, and correct
  remaining alignment issues. Preserve discrete detail levels and verify the
  results across zoom levels on iOS/Android. See `TODO.md` for open tasks.

Verification: Expo lint and TypeScript typecheck pass. Earlier map verification
also passed nine automated tests and iOS/Android production exports; device
acceptance remains open. This documentation/Git review changed no implementation.
