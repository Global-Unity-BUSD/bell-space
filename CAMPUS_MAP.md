# Campus Map: Sources, Placement and Uncertainty

This document records how the Bell Space campus map was built from
`BHSCampusMap.pdf` (a 2023 Epson scan) and the user's floor explanations, and
what is still unverified. Student-facing screens carry no source commentary;
it lives here, in the SVG `data-note` attributes and in `TODO.md`.

## Shared campus frame

* The PDF was rendered at 6000 × 4636 px and straightened by **1.005°** about
  the page centre (the scan is slightly rotated). These "page px" are the
  tracing coordinates.
* **Campus units = (page px − (120, 1900)) / 10.** Every level uses the same
  `0 0 580 210` frame, so switching floors keeps the camera in place.
* There is **no real-world scale**. Distances are proportional to the scan,
  not measured. GPS reference points are needed before any positioning work.

## Levels and sources

| App floor | Contents | Source drawing | File |
| --- | --- | --- | --- |
| Floor 1 | Buildings 3 (left), 2 (middle), 1 (right), parking, tennis courts, ramp | The long ground-level drawing at the bottom of the PDF | `2026-10-21_campus-floor1.svg` |
| Floor 2 | Building 1 (12xx) | Upper-right drawing | `2026-10-21_campus-floor2.svg` |
| Floor 2 | Building 2 (22xx) | Upper-middle drawing | `2026-10-21_campus-floor2.svg` |
| Floor 2 | Building 3 (3-2xx) | Upper-left drawing | `2026-10-21_campus-floor2.svg` |
| Floor 3 | Building 1 (13xx) | Drawing left of the 12xx plan | `2026-10-21_campus-floor3.svg` |

The building names come from the user. Only "BUILDING 3" is printed in the
PDF.

**Label check.** The previous build's Floor 2 showed only Building 1's 12xx
plan (STEAM Lab, Small Quad, rooms 1202–1248); it had no auditorium or drama
content. In this build:
* Auditorium, Stage, Choir (2107) and Drama (2101) are on Floor 1, Building 2.
* The 22xx plan's "Auditorium" appears on Floor 2, Building 2, because that
  plan shows the auditorium's upper level.
* The 12xx plan remains Floor 2.

Automated tests check every room's building and level association.

## Upper-floor placement (estimated)

The upper drawings are separate plans at their own scale and position on the
page. Each one is placed over its building with a uniform scale + offset.
**No placement has been checked on site.** Review images are in
`reference/overlays/` (red = documented, blue = uncertain, green = label boxes).

| Drawing | Placement | Evidence | Uncertainty |
| --- | --- | --- | --- |
| Building 2 Floor 2 (22xx) | scale 1.0, offset (−23, +1049) page px | Auditorium walls align with the ground auditorium; plan width matches Building 2 | ~2–3 m. The two "2215" labels need checking |
| Building 3 Floor 2 (3-2xx) | scale 1.0, offset (+2, +628) | East wall and north wall matched to the locker row | West extent (it reaches over the ramp area) and vertical position uncertain. The elevator symbol sits ~8 units west of the ground ELEV |
| Building 1 Floor 2 (12xx) | campus = 0.81439 × (design + (7.5, 9.5)) + (406.387, −5.887) | Traced from `2026-10-04_floor-2.svg`; that clean plan is the labeled export without its room glyphs, shifted by (−7.5, −9.5) | The 1213–1218 row lands ~2.7 units south of 1155–1162. The STEAM Lab overlaps the parking lot's east edge |
| Building 1 Floor 3 (13xx) | STEAM Lab outline → 12xx plan (scale 0.99), then as above | Identical north-wing outline | Same as 12xx, plus the 13xx/12xx STEAM Lab match |

Building 1 Floor 2 is generated into the traced SVG from the clean line plan.
`2026-10-04_floor2-labeled.svg` (the earlier runtime overlay) is archived: it is
no longer imported by the app, and its room label positions were converted into
the generator's `U12_ROOMS` table.

## What each floor contains

**Floor 1:**
* Building 1: the earlier partial trace, shifted into the campus frame.
* Building 2: auditorium, stage, WR, 2101–2135, Band, Choir, Drama and the
  east service rooms.
* Building 3: locker row, two gymnasiums, lobby, outdoor pool with leader-labelled rooms, and the
  basement-side block.
* Site: the "Tennis Courts" and "Parking Garage Below" labels (no outline is
  drawn). The teacher parking lot north of the Cafeteria (printed "PARKING") is
  left off the student map.
* Stairs: in their own `stairs` layer, one path per symbol in the PDF (16 on Floor 1,
  11 on Floor 2 including six from the 12xx plan, 5 on Floor 3).

**Floor 2:**
* Faint ground footprints for orientation.
* Building 1 Floor 2, Building 2 Floor 2 and Building 3 Floor 2.

**Floor 3:**
* Faint ground footprints.
* Building 1's 13xx plan.

Not traced anywhere:
* doors and entrances, which the PDF does not draw;
* walkways and the street outlines;
* the blank "BUILDING FOOT-PRINT" area north of Building 1;
* the basketball courts;
* the handwritten 2023 event notes (Judges, Tab Room, Student Area, Awards,
  Parking arrow);
* the numbered callout boxes (3, 8, 10, 3).

Building 1 Floor 2 keeps the individual wall lines of its clean source plan.
The other upper floors draw each room's rectangle, not individual traced
partitions.

## Features needing annotated placement (not drawn)

The PDF has no outlines for these. They are firsthand descriptions from the
user and must be placed from a site visit or a measured source:

* **Football field:** above (north of) Building 3 on the campus map.
* **Baseball field:** left (west) of the tennis courts.

## Building 1 corrections (user annotations, 2026-10-22)

* **Gap:** the gap between 2101 Drama and the Lunch Shelter was drawn too narrow.
  * Drama's east wall moved 32 page px west.
  * The Lunch Shelter's edge now follows the PDF's inner west line (+30 px).
  * The gap is 9.5 units (was 3.2); nothing else moved.
* **Lunch Shelter:** a wide open covered area with no doors. Its south and
  west sides are open, so no wall is drawn there. Its north side and the
  Cafeteria/Wellness side stay closed.
* **Career Center:** a box adjoining the Library's west wall, below the
  T/ELEV block. The PDF prints the name in that block; the user's placement wins.
* **Senior Hill:** a draft circle at the middle-right edge of the Quad. No mark
  for it was found in the annotations, so its boundary is unconfirmed.
* **Student Area:** the open area west of the Quad (PDF handwriting; user annotation).
* **Ramp:** the drawing is confirmed. The user's arrow ends at page px
  (4343, 2667), which falls on the 12xx plan's west wing (by 1223) as currently
  placed. That independently supports the Floor 2 alignment there. The
  connection is a proposal (`reference/review/ramp.jpg`) and is not used in routes.

## Building 1 entrances (user clarification, 2026-10-22)

* The 1155–1162 row is entered from its bottom side, facing the Quad.
* The 1138–1144 row and the Book Room are entered from their top side.
* The Library is entered from the gap by the Career Center and the Book Room.
* The Career Center is entered from its bottom side, below its name.
* The PDF does not draw doors. Each door point is centred on its room's wall,
  so its position along the wall is **approximate**; only the side is confirmed.
  Data: `B1_ENTRANCES` in `src/navigation/data/building1Walkable.ts`. Overlay:
  `reference/review/entrances.jpg`.
* "1-159" (between 1160 and 1158) has no entrance: its label is uncertain.

## Ramp and parking

* The earlier "ramp" west of Building 3 was wrong and is removed.
* The ramp you described runs between 2101 Drama and the Wellness
  Center/Cafeteria block:
  * the approach is straight north through the gap between Drama and the
    Lunch Shelter;
  * it then turns right onto the curved band drawn north of the Lunch Shelter;
  * the band appears to end where it meets the Kitchen/Wellness block.
* The proposal is in `reference/proposals/ramp-proposal.jpg`. It is not on the
  student map or in the route network until you approve it. Which level it
  reaches is not inferred from the drawing.
* The teacher parking lot north of Building 1 is not shown. "PARKING GARAGE
  BELOW" (tennis courts) remains as a label.

## Stair alignment across floors

* Each Building 1 ground stair symbol lies within 2.4 map units of a stair
  symbol on the Floor 2 plan.
* Floor 2 and Floor 3 symbols match within 1.1 units.

This independently supports the upper-floor placements. It is recorded as
*proposed* stair links in the route data, not as confirmed connections.

## Uncertain labels and symbols

Each item below has `data-status="uncertain"` and a `data-note` in its SVG.
These items are shown lighter and in italics, and are left out of search.

| Area | Items |
| --- | --- |
| Building 1, Floor 1 | Three "T" rooms (restrooms?); "1-159" (1159, 1-159 or a closet); "ELEV. M." (elevator or machine room); "Comp…" (second line illegible); the dashed outlines in the Quad; the small dashed box east of the Cafeteria; three crossed-box symbols |
| Building 2, Floor 1 | "WR"; two "OFF" rooms and one vertical "OFF"; "2-108" (or 2-109); two "T" rooms; "2-116"; "ELEC" (electrical?); the unlabeled box west of the auditorium; hatched band south of the building (steps?) |
| Building 3, Floor 1 | "FL"/"EL", "ST", "EQ" (3-108 leader), "OFF" (3-109 and 3-115 leaders), four "T" rooms, two "TRN"; pool rooms 3-122/3-123, 3-124, 3-125 (leader labels only); "Basement Area" (may not be ground level); the ladder-like column; two pictograms; three triangle symbols; fence-like X lines |
| Building 2, Floor 2 | "2215" is printed twice |
| Building 3, Floor 2 | Six "ST" rooms and one "ST" in the T block, four "T" rooms, "OFF" (3-202 leader); the elevator symbol (3-204/ELEV. leaders) |
| Building 1, Floor 3 | "1-332"; the "1-310" leader |
| Printed numbers | The girls' locker room is printed "3-313" (possibly 3-113) |

## Route-network candidates

Each SVG's `route-candidates` group lists the stairs, elevators, entrances,
exit pictograms and the ramp that can be seen in its source drawing. All are
`uncertain`:

| Floor | Candidates |
| --- | --- |
| Floor 1 | 15 stairs, 3 elevators, 1 entrance ("Entrance from Quad"), 3 exits, 1 ramp |
| Floor 2 | 11 stairs (six from the 12xx plan), 1 elevator |
| Floor 3 | 4 stairs |

These are a survey checklist, not a route network. See `src/navigation/` and
`TODO.md`.

## Regenerating the traces

`tools/campus-trace/` holds the scripts and README. Edit the coordinate
lists in `campus.py` and regenerate the SVGs. Don't hand-edit coordinates in
the SVGs, or the two will drift apart.
