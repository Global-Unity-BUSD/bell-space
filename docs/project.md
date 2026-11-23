# Bell Space

## Purpose

Bell Space is a cross-platform Expo/React Native student app for Burbank High
School. Indoor maps and navigation are its first focus; announcements, chat
and Q&A are planned parts of the same app.

## Current Stage

**First UI version, tested on a physical iPhone with Expo Go.**

* The app opens directly to the main app with **Navigation** selected.
  There is no welcome page or sign-in.
* Bottom tabs: Updates, Navigation, Chat, Q&A, Settings. Updates, Chat and
  Q&A are clearly labeled preview screens; Settings shows real version and
  map-status information plus labeled preview preferences.
* Navigation shows the campus map with a floor picker (1–3), zoom in/out
  and Reset view. The search bar sits above
  the tab bar and opens a results panel upward. Selecting a room switches
  floor, centres it, pins it and shows a card with Cancel.
* Pan and pinch-zoom are enabled. Two-finger rotation is disabled in the UI.
* Directions: choose a destination, tap Directions, pick a starting point. "Start
  directions" appears only when every door, walkway and stair on the route is
  checked; otherwise the card says what is still to be confirmed. Building 1 is
  first: open areas and the classroom rows, Library, Book Room and Career Center
  (entrance side confirmed, door position approximate).
* Live location is an experiment, off by default (Settings). It is used only
  when its measured accuracy allows (`docs/positioning-experiment.md`).

## Maps

One campus frame holds every level, so students can pan across all three
buildings and switch floors without losing their place. Details, sources and
uncertainty: `docs/campus-map.md`.

| Floor | Contents |
| --- | --- |
| Floor 1 (default) | Ground level: Buildings 3, 2 and 1, parking, tennis courts, reported ramp |
| Floor 2 | Building 1 (12xx), Building 2 (22xx), Building 3 (3-2xx) |
| Floor 3 | Building 1 (13xx) |

Building 1 ground-floor walkable space and room-entrance sides are recorded
(door positions approximate); other doors and walkways are not mapped yet. Uncertain items are marked
`data-status="uncertain"` in the SVGs and drawn lighter in the app.

## Project Direction

```text
App shell + campus map (current)
    ↓
In-person checks (doors, paths, stairs, elevators, ramp)
    ↓
Verified route network + manual starting point → real directions
    ↓
iPhone live-location experiment (docs/positioning-experiment.md, current)
    ↓
Tune or drop live guidance from measured walk tests
```

Teacher search waits for an approved, verified teacher-to-room list.

## Future Systems

These are not part of the current stage unless specifically requested:

* indoor positioning beyond the iPhone experiment (BLE beacons)
* automatic floor detection
* Q&A content and backend
* school sign-in (SSO) and production use of Chat (needs school approval)
* push notifications (`docs/backend-plan.md`, later step)

In progress: a self-hosted server and staff website for Updates and the
staff-supervised support chat (`docs/backend-plan.md`).
* teacher directory data

## Important Principles

* Do not invent rooms, doors, paths or geometry to match a mockup. Map data
  comes from supplied sources and is marked when unverified.
* Never draw a route from room-number labels alone.
* Each floor's SVG should be replaceable by a better source without rewriting
  the application.
