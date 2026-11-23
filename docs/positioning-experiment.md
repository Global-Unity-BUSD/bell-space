# iPhone Live-Location Experiment

Goal: find out whether an iPhone's own location and motion sensors can place
a student on the Building 1 ground-floor map accurately enough to show a live
position, advance directions and reroute. There are no BLE beacons. Manual
starting points stay the default and always work.

**Status (2026-10-22):** implemented as an experimental mode (off by default).
No iPhone measurements yet; the map alignment is **not set** (see Results).

## Turning it on

Settings → **Live location (experimental)**:
* **Live location**: location (When In Use) and motion permission are asked
  for only when this is switched on. Nothing runs in the background and
  nothing is uploaded.
* **Show test readings**: the developer panel on the Navigation map.

## What the app does

| Piece | File |
| --- | --- |
| Sensors: `expo-location` `watchPositionAsync` (BestForNavigation, 1 s), `watchHeadingAsync`; `expo-sensors` `Pedometer.watchStepCount` | `apps/src/positioning/useLiveTracking.ts` |
| Fusion, dead reckoning, quality, route gating (pure, tested) | `apps/src/positioning/tracker.ts` |
| Reference capture, checkpoints, error summary (pure, tested) | `apps/src/positioning/calibration.ts` |
| GPS → campus fit (least-squares similarity) | `apps/src/positioning/positionGate.ts` |
| Measured references shipped with the app (empty) | `apps/src/positioning/referencePoints.ts` |
| Test panel / marker | `apps/src/positioning/LiveTestPanel.tsx`, `apps/src/map/LiveMarker.tsx` |

* **Alignment is measured, never guessed.** GPS is turned into map positions
  only after at least **3 reference points** are captured: stand on a spot you
  can find exactly on the map, tap "Add reference", tap that spot, and hold
  still for 15 s. Fixes worse than 15 m are dropped; at least 5 are needed. The
  fit reports its error (`fit error ±N m`), which is added to every fix.
* **GPS fixes** worse than 20 m (fix accuracy combined with fit error) are
  ignored. Better ones are blended with the current estimate by variance.
* **Steps × heading** move the estimate 0.7 m per step, only when the compass
  is calibrated (iOS accuracy level ≥ 1, < 5 s old). Each step widens the
  circle by 0.7 m × (0.1 + sin(heading error)). An uncalibrated compass does
  not move the estimate and widens the circle by a full stride per step.
  The circle also grows 0.3 m/s with no readings.
* **Quality:** precise ≤ 3 m (solid blue dot + circle), approximate ≤ 10 m
  (dashed orange circle, no dot), otherwise unknown (grey). The marker shows
  the raw estimate and is never snapped to a room.
* **Directions:** a step advances on its own only when the estimate is
  precise and within 3 m of the next turn. A reroute from the live position
  happens only when the circle is ≤ 4 m and the estimate is more than
  max(6 m, 2 × radius) off the route. Otherwise the step card says the
  position is approximate and offers "Set location". Live position works on
  Floor 1 only; **no floor is inferred** (upper-floor steps use Next/Back).
* **Set my location** (map button, chip, or step card): tap the map; the
  estimate resets there with a 2 m circle.
* **"Use my live location"** appears in the start list only when the estimate
  is precise and inside the walkable area.
* All thresholds are in `TRACKER` (`tracker.ts`) and are proposals to tune
  from the walk tests.

## Walk test

Use an iPhone with Precise Location on for Bell Space (Expo Go: Settings →
Privacy → Location Services → Expo Go → Precise Location).

1. **Reference points (outdoors, required first).** Capture 4 well-spread
   points you can locate exactly on the map, e.g.
   * the south-west corner of Room 1138's wall at the Student Area,
   * the corner where the Library meets the Book Room (the gap),
   * the north-east corner of Room 1155,
   * the south-west corner of the Lunch Shelter.
   Check the fit error is under ~3 m. Repeat on a second day.
2. **Static checkpoints.** At 6 marked spots in the Quad and Student Area,
   stand 30 s, then tap "Checkpoint" and tap your true spot.
3. **Walks** (start directions, phone held in front, normal pace; at each
   turn and on arrival tap "Checkpoint"):
   * Student Area → Room 1155 (long walk along the Quad);
   * Room 1162 → Library (row door to the gap);
   * Lunch Shelter → Career Center;
   * Quad (centre) → Room 1141 (south row, top-side door);
   * a deliberate wrong turn on one walk, to see whether rerouting triggers.
4. Repeat walk 1 with the phone in a pocket (steps without heading).
5. "Share log" sends the JSON (references, fit, checkpoints, summary).

## Measures (from the log)

* Median and maximum checkpoint error, GPS-led vs step-only (`gpsMedian`,
  `stepsMedian`), and the share of checkpoints inside the drawn circle
  (`withinRadius`). The circle should contain the true spot at least ~80% of
  the time; if not, widen the radii.
* Step drift: error growth per 10 m walked without a good fix.
* Whether steps advanced at the right turns and never early.

## Decision rules (proposed)

* Keep auto-advance only if precise checkpoints have median error < 3 m and
  no early advances. Otherwise raise `preciseRadius` limits or turn it off.
* Floor detection is out of scope; the student always picks the floor.

Expected without beacons: outdoor GPS 3–10 m near buildings, worse close to
walls; dead reckoning drifts a few metres per 20–30 m.

## Results

No iPhone measurements yet. `MEASURED_REFERENCES` is empty, so the app has
no GPS alignment until references are captured in a session or pasted into
`apps/src/positioning/referencePoints.ts` from a shared log.
