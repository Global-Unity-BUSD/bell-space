# Route Review: Building 1

Generated from `apps/src/navigation/data/building1.ts` by `tools/route-review/generate.cjs`.
Overlay: `reference/proposals/building1-network.jpg` (IDs match this list).

At school, confirm or correct each item, then set its `status` to `'checked'` in the data
file (move a door or point by editing its coordinates). Student directions use only
checked items; a route appears only when every door, walkway and stair on it is checked.

## Open areas: routed now

These use the walkable-space data in `apps/src/navigation/data/building1Walkable.ts`
(source: User, 2026-10-22: the student area, Quad, Lunch Shelter and the open space between them are generally walkable. Edges from the campus PDF walls.). Routes stay inside it, keep clear of walls,
and go around stairs.

| Destination | Status | Note |
| --- | --- | --- |
| Lunch Shelter | checked | Wide open covered area with no doors; open on its south and west sides |
| Senior Hill | checked | Round student area at the middle-right edge of the Quad; boundary is a draft |
| Quad | checked | Open Quad |
| Student Area | checked | Open area west of the Quad |

Stairs treated as obstacles (not flat walking space): `stair-cafeteria`, `stair-career`, `stair-quad-south`.

Please confirm at school:
* the open space has no fences, planters, steps or locked gates that block the drawn routes;
* the Lunch Shelter is open on its south and west sides (and whether the north side is open);
* where Senior Hill's edge is (the current circle is a draft).

## Ramp (proposal, not used in routes)

Connects the ground-level gap to Building 1 Floor 2; landing position and access to be confirmed. Review image: `reference/review/ramp.jpg`.
Confirm the Floor 2 landing, that it is step-free, and that students may use it.

## Room entrances: routed now (17)

The side of each room's entrance is confirmed; **where along that wall the door is, is not
measured** (every door point is `approximate`). Routes go to the approach point just outside
the door (in walkable space), then to the door. Overlay: `reference/review/entrances.jpg`.
At school, note for each room whether the real door is left of, right of or at the drawn point,
and roughly how far (in steps); then move `door` in `building1Walkable.ts` and set
`positionStatus: 'checked'`.

| Place | Side | Faces | Door point | Note |
| --- | --- | --- | --- | --- |
| Room 1162 | checked | the Quad | approximate (465.0, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1161 | checked | the Quad | approximate (474.2, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1160 | checked | the Quad | approximate (486.2, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1158 | checked | the Quad | approximate (506.3, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1157 | checked | the Quad | approximate (518.3, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1156 | checked | the Quad | approximate (527.5, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1155 | checked | the Quad | approximate (539.8, 114.8) | Bottom side of the top classroom row (confirmed); door position along the wall approximate |
| Room 1138 | checked | the Student Area | approximate (453.4, 164.5) | Top side of the bottom classroom row (confirmed); door position approximate |
| Room 1139 | checked | the Quad | approximate (464.3, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Room 1140 | checked | the Quad | approximate (473.8, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Room 1141 | checked | the Quad | approximate (483.3, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Room 1142 | checked | the Quad | approximate (492.8, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Room 1143 | checked | the Quad | approximate (502.2, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Room 1144 | checked | the Quad | approximate (511.9, 169.0) | Top side of the bottom classroom row (confirmed); door position along the wall approximate |
| Book Room | checked | the Quad | approximate (521.6, 169.0) | Top side of the bottom classroom row (confirmed); door position approximate |
| Library | checked | the gap by the Career Center and Book Room | approximate (526.1, 163.4) | In the gap between the Career Center and the Book Room (confirmed); exact point approximate |
| Career Center | checked | the Quad | approximate (519.7, 157.8) | Bottom side, below the name (confirmed); exact point approximate |

Still not routed (no confirmed entrance): Cafeteria, Kitchen, Wellness Center, Admin Offices,
the "1-159" room (label partly illegible), restrooms (T) and the other unlabeled rooms.

## Door graph for enclosed rooms (22, review mode only)

Proposed doors sit at the centre of the wall facing the walkway. Confirm **which wall the
door is on and roughly where**, and whether students may use it.

| ID | Place | Proposed position | Status |
| --- | --- | --- | --- |
| `door-1162` | Room 1162 | Quad-facing wall | proposed |
| `door-1161` | Room 1161 | Quad-facing wall | proposed |
| `door-1160` | Room 1160 | Quad-facing wall | proposed |
| `door-1158` | Room 1158 | Quad-facing wall | proposed |
| `door-1157` | Room 1157 | Quad-facing wall | proposed |
| `door-1156` | Room 1156 | Quad-facing wall | proposed |
| `door-1155` | Room 1155 | Quad-facing wall | proposed |
| `door-restroom-north` | restroom (T) | Room labeled T | proposed |
| `door-1138` | Room 1138 | Quad-facing wall | proposed |
| `door-1139` | Room 1139 | Quad-facing wall | proposed |
| `door-1140` | Room 1140 | Quad-facing wall | proposed |
| `door-1141` | Room 1141 | Quad-facing wall | proposed |
| `door-1142` | Room 1142 | Quad-facing wall | proposed |
| `door-1143` | Room 1143 | Quad-facing wall | proposed |
| `door-1144` | Room 1144 | Quad-facing wall | proposed |
| `door-bookrm` | book room | Quad-facing wall | proposed |
| `door-admin` | admin offices | North wall; entrance not shown in the PDF | proposed |
| `door-cafeteria` | cafeteria | South wall; the 2023 event arrow points here | proposed |
| `door-career` | career center | Next to the Library (user); entrance not known | unknown |
| `door-library` | library | West side, below the Career Center; not confirmed | proposed |
| `door-wellness` | wellness center | Inside the north block; door not shown | unknown |
| `door-kitchen` | kitchen | Inside the north block; door not shown | unknown |

## Walkway links (33)

Confirm each link is a walkable path students can use (no fence, planter, locked gate or steps
unless noted), and that it runs where drawn.

| ID | Walkway | Note | Status |
| --- | --- | --- | --- |
| `nw` → `n-stair1` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-stair1` → `n-t` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-t` → `n-1162` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1162` → `n-1161` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1161` → `n-1160` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1160` → `n-1158` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1158` → `n-east` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-east` → `n-1157` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1157` → `n-1156` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `n-1156` → `n-1155` | north walkway | Covered walkway along the south side of the 1155–1162 row; dashed in the PDF | proposed |
| `sw` → `s-admin` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-admin` → `s-1138` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1138` → `s-bend` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-bend` → `s-1139` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1139` → `s-stair3` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-stair3` → `s-1140` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1140` → `s-1141` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1141` → `s-mid` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-mid` → `s-1142` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1142` → `s-1143` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1143` → `s-east` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-east` → `s-1144` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `s-1144` → `s-bookrm` | south walkway | Along the north side of the Admin Offices and the 1138–1144 row; dashed edge in the PDF | proposed |
| `n-east` → `e-career` | east walkway | Open edge of the Quad west of the Career Center; dashed in the PDF | proposed |
| `e-career` → `e-library` | east walkway | Open edge of the Quad west of the Career Center; dashed in the PDF | proposed |
| `e-library` → `s-east` | east walkway | Open edge of the Quad west of the Career Center; dashed in the PDF | proposed |
| `nw` → `quad-w` | west side of the Quad |  | proposed |
| `quad-w` → `sw` | west side of the Quad | Open Quad edge by the Student Area; no boundary is drawn | proposed |
| `n-1160` → `s-mid` | Quad crossing | Straight crossing of the open Quad; planters, steps or fences are not shown in the PDF | proposed |
| `e-library` → `library-path` | Library path | South of the Career Center, toward the Library's west side | proposed |
| `stair-cafeteria-1` → `n-stair1` |  | Stair foot to the walkway | proposed |
| `stair-career-1` → `n-1156` |  | Stair foot to the walkway | proposed |
| `stair-quad-south-1` → `s-stair3` |  | Stair foot to the walkway | proposed |

## Stairs and floor links (5)

The stair symbols line up across the Floor 1, 2 and 3 plans. Confirm each stair exists, which
floors it reaches, and where its landing is on each floor.

| ID | Kind | Note | Status |
| --- | --- | --- | --- |
| `stair-cafeteria-1` → `stair-cafeteria-2` | stairs | Symbols line up on the Floor 1 and Floor 2 plans; confirm the stair connects them | proposed |
| `stair-cafeteria-2` → `stair-cafeteria-3` | stairs | Symbols line up on the Floor 2 and Floor 3 plans; confirm | proposed |
| `stair-career-1` → `stair-career-2` | stairs | Symbols line up on the Floor 1 and Floor 2 plans; confirm the stair connects them | proposed |
| `stair-career-2` → `stair-career-3` | stairs | Symbols line up on the Floor 2 and Floor 3 plans; confirm | proposed |
| `stair-quad-south-1` → `stair-quad-south-2` | stairs | Symbols line up on the Floor 1 and Floor 2 plans; confirm the stair connects them | proposed |

## Not in the network yet

* **Elevator** (`elevator-1`, room labeled ELEV. M.): is it an elevator, where is its entrance,
  and which floors does it serve?
* **Wellness Center, Kitchen, Cafeteria, Admin Offices:** where are their doors?
* **Ramp** (see `reference/proposals/ramp-proposal.jpg`): approach, turn, end point, which
  level it reaches, and whether it is step-free and open to students.
* **Building 1 Floor 2 and Floor 3 hallways and doors:** not recorded yet, so upstairs rooms
  have no routes.
* **Building entrances** from Third Street and Harvard Road.
