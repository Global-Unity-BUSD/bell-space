# Campus trace tools

Scripts that produced `2026-10-21_campus-floor{1,2,3}.svg` from `BHSCampusMap.pdf`.
They use only the Python standard library and macOS `sips`/`qlmanage`.
Run Python with `-I`.

1. Render the PDF at 6000 px wide: `sips -s format png -Z 6000 BHSCampusMap.pdf --out big.png`,
   then convert it to BMP: `sips -s format bmp big.png --out page.bmp`.
2. Straighten it: `python3 -I deskew.py page.bmp page_d.bmp 1.005`
   (then `sips -s format png page_d.bmp --out page_d.png` for overlays).
3. Measure walls: `python3 -I region.py page_d.bmp x0 y0 x1 y1 minrun` prints long
   horizontal/vertical dark runs in page px. `grid.py` draws a 100 px grid on a crop.
4. Edit the coordinate lists in `campus.py` (page px or per-drawing crop px). It
   reuses the earlier Building 1 trace through `b1data.py` (derived from `floor1.py`).
   Building 1 Floor 2's single-line plan is split into footprint, walls and dividers
   by `planar.py`.
5. Generate: `python3 -I campus.py <svg out dir> <dir containing page_d.png>`.
   This writes `campus-floor{1,2,3}.svg` plus overlay SVGs for review.
   Copy the SVGs into the project root under their dated names.

Placement transforms for the upper-floor drawings are at the top of
`campus.py`; their evidence and uncertainty are in `CAMPUS_MAP.md`.
