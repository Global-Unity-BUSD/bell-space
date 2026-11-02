# Persistent Map Slowdown and White Artifacts

## Status — Android stutter reported gone (2026-11-01)

**2026-11-01 note:** the per-switch mount of the Building 1 Floor 2 labeled
export was removed; Floor 2 now draws its traced walls and labels from
`2026-10-21_campus-floor2.svg`. The user reports the Android stutter is gone
after that change. The white-artifact question was not re-reported and stays
unconfirmed.

**2026-10-21 note:** map geometry is now drawn as vectors through a camera
matrix (like the labels), instead of a bitmap scaled by a View transform.
Re-baseline Android with the new build before using the measurements below.

The user reports that the map still slows down after the two-finger rotation
and gesture-path changes. This issue has not been fixed or diagnosed on a device.

Confirmed by the user:

* Testing is on an Android phone in **Expo Go**.
* Slowdown occurs during one-finger panning, pinch zoom, rotation, and detail
  changes. It is not limited to crossing a zoom/detail threshold.
* Unexpected white shapes appear over map lines. Their exact appearance and
  source need a screenshot or video to establish.

Unknown: phone model, Android version, refresh rate, Expo Go version, native
frame times, release-build behavior, and whether iOS has the same symptoms.

## Goal

Identify the actual rendering/gesture bottleneck and the source of the white
artifacts, then verify a targeted fix on the affected Android phone. Preserve
the existing SVG, combined gestures, bounded label sizes, and discrete detail
levels. Use this document for the detailed investigation and `TODO.md` for status.

## Evidence and Hypotheses

### White label halos — suspected artifact source

`src/map/AnnotationLayer.tsx` draws each source label twice: a light-colored
filled/stroked path (`#f8fafc`, 1.5-pixel non-scaling stroke), then the dark label.
The light path is a readability halo. It can cover nearby floor lines and also
adds drawing work. It is a hypothesis, not a confirmed explanation for the
reported white shapes. Check clipping, alignment, and stale frames if removing
the halo does not eliminate the artifact.

### Native SVG redraw cost — suspected performance source

Pan and rotation update one parent SVG group, while zoom updates label
projections. Fewer animated-property updates do not prove that native drawing
is cheap. Inspection of the installed Android `react-native-svg` source shows
matrix/opacity invalidation paths and an SVG surface cache that is redrawn when
invalidated. Profile the actual device to establish how much that costs here.

Relevant installed-library files for that inspection:

* `node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/VirtualView.java`
* `node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/SvgView.java`

Other candidates are per-label zoom updates, floor drawing, opacity transitions,
gesture calculations, and development-mode overhead. Do not pick a fix until
comparisons or traces identify the expensive work.

### What existing verification establishes

The 17 automated tests cover camera math, long combined gestures, pointer
transitions, rotated bounds, glyph projection/sizing, and compiled callback
behavior. A hook harness checks static worklet-closure dependencies. Lint,
TypeScript, and iOS/Android production Hermes exports have passed.

These checks do not measure native drawing, animation timing, missed frames,
or device smoothness. A production export is not an installed release-build
performance test. The persistent user report takes precedence over assumptions
that the earlier changes removed the stutter.

## Step 1 — Collect Device Details and Visual Evidence

* [ ] Record phone model, Android version, refresh rate, and Expo Go version.
* [ ] Record app Git revision, viewport/orientation, build mode, and debugger state.
* [ ] Obtain a screenshot with the white area marked, plus its approximate zoom
  level and whether the map was stationary or moving.
* [ ] Obtain a 20–30 second reproduction video showing the gestures and artifacts.
* [ ] Check whether the white shapes remain after movement stops or Reset view.

Screenshots, videos, and profiling outputs can be shared for analysis. USB
debugging plus `adb` or an Android system-trace capture on the user's computer
helps with deeper profiling. This sandbox does not automatically expose host USB
devices; guide the capture and analyze the supplied output when direct access
is unavailable. Account credentials and broad computer access are not needed.

## Step 2 — Establish a Repeatable Baseline

Start with the current normal map. Let loading and any initial fades settle.
Use the same phone, orientation, zoom/detail level, build mode, and tracing
settings for comparisons.

* [ ] Record 10-second one-finger pan sequences at approximately 2× and 4×.
* [ ] Record 10-second rotation sequences at those zoom levels.
* [ ] Record pinch sequences within a detail level, separately from threshold
  crossings (Medium enters at 2×; Full enters at 3.4×).
* [ ] Record combined pinch/twist/translation and both directions of LOD changes.
* [ ] Repeat each measured case three times and note warm-up or thermal changes.

Capture the visual reproduction separately from performance measurements:
screen recording itself may change performance. Record UI/JS frame timing when
the tooling supports it, missed frames, and native drawing/rendering activity.
Do not treat perceived smoothness or a JavaScript-only timing as native FPS.

## Step 3 — Isolate Rendering Cost

Implement temporary diagnostic switches before running comparisons. Select
modes before starting a gesture, keeping instrumentation lightweight. Remove
disabled layers from rendering/update work rather than setting opacity to zero.
All variants must retain the same camera and viewport behavior.

| Variant | Change from the normal map | Question answered |
| --- | --- | --- |
| A — Normal | None | What is the baseline? |
| B — Floor only | Unmount the entire annotation layer | Do labels/overlay updates account for most of the cost? |
| C — No halos | Omit only the light label path | Are halos causing the white shapes or significant drawing cost? |
| D — Annotations only | Omit floor geometry | How costly is floor rendering? |
| E — Fixed detail | Hold the starting detail level constant | Are level crossings contributing to pauses? |
| F — No fades | Keep dynamic detail, but disable transition animations | Are opacity fades contributing to pauses? |

* [ ] Implement the diagnostic switches without changing source SVG geometry.
* [ ] Run A–F using the same baseline gesture cases, changing one variable at a time.
* [ ] Compare white artifacts as well as timing; they may be a separate issue.
* [ ] Return to A between comparisons to check that improvement is reproducible.
* [ ] Record results before selecting a rendering or gesture optimization.

## Step 4 — Profile and Compare Build Modes

* [ ] Capture an Android system trace for the slowest baseline and the most
  informative isolation variant; inspect main/UI-thread drawing, rendering/GPU
  work, allocations/garbage collection, and missed frames.
* [ ] Use React/JavaScript profiling if the trace or layer comparisons point to
  JS calculations or unnecessary component renders.
* [ ] Choose an available build method, then compare Expo Go with an installed
  optimized/release build on the same device using the same gesture sequences.
* [ ] Document evidence for the bottleneck, separating source-code observations
  from measured device results.

## Step 5 — Fix, Recheck, and Close

* [ ] Implement a focused fix supported by the measurements.
* [ ] Repeat the same measured cases before/after, three runs per case.
* [ ] Verify the white artifacts are explained and the intended visuals restored.
* [ ] Recheck label readability/alignment, clipping, rotated pan bounds, reset,
  pointer transitions, combined gestures, and LOD levels in both directions.
* [ ] Run `node --test tests/map.test.cjs`, `npx expo lint`, and `npx tsc --noEmit`;
  check iOS/Android production exports when implementation changes warrant it.
* [ ] Verify Android on the affected device and check iOS for regressions.
* [ ] Remove temporary diagnostic controls after retaining the useful findings.

Close only with reproducible device evidence that the slowdown has improved
and the artifact is addressed. At 60 Hz the frame budget is about 16.7 ms;
at 120 Hz it is about 8.3 ms. Evaluate against the actual device refresh rate,
reporting frame-time consistency and missed frames rather than promising a
particular FPS from automated math tests.

## Results Log

The 2026-11-01 build removed the Floor 2 export overlay: switching to Floor 2
no longer mounts the export's 377 filled subpaths. The user reports Android
smoothness restored. The measurements below were never taken and are optional
unless a new slowdown appears.

| Revision / device / build | Variant and gesture | Frame timing / missed frames | White-artifact result | Evidence / conclusion |
| --- | --- | --- | --- | --- |
| 2026-11-01 / user's Android phone / Expo Go | Floor switching with the traced Floor 2 (export overlay removed) | Not measured | Not re-reported | User confirms the stutter is gone; cause was the per-switch export mount |
| Pending | Pending | Not measured | Screenshot needed | Cause unconfirmed |
