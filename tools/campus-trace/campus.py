# Generates the CLEAR 2.0 campus level SVGs and review overlays.
# All source coordinates are pixels of the 6000 px render of BHSCampusMap.pdf,
# straightened by 1.005 deg about the page centre ("page px").
# Campus units = (ground page px - (120, 1900)) / 10.
import sys, os, json, re
out_dir, overlay_dir = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
B1 = {}
exec(open(os.path.join(here, 'b1data.py')).read(), B1)
PLANAR = {}
exec(open(os.path.join(here, 'planar.py')).read(), PLANAR)

ORIGIN = (120, 1900)
def campus(p):
    return (round((p[0] - ORIGIN[0]) / 10, 1), round((p[1] - ORIGIN[1]) / 10, 1))
def fmt(v): return '%g' % v

class Drawing:
    """A source drawing: crop offset (crop -> page) and placement (page -> ground page).

    With to_campus, the placement maps the drawing's own coordinates straight to
    campus units (used for a source SVG that is already in export coordinates).
    """
    def __init__(self, key, offset, place, scale, note, to_campus=False, fit=None):
        self.key, self.offset, self.place_fn, self.scale, self.note = key, offset, place, scale, note
        self.to_campus = to_campus
        # Optional correction in campus units, applied after the placement.
        self.fit = fit or (lambda q: q)
    def page(self, p): return (p[0] + self.offset[0], p[1] + self.offset[1])
    def ground(self, p): return self.place_fn(self.page(p))
    def map(self, p, space):
        if self.to_campus: return self.fit(self.place_fn(p))
        return self.fit(campus(self.ground(p))) if space == 'campus' else self.page(p)
    def unit(self, space):  # campus units per crop px, or 1 for page space
        if self.to_campus: return self.scale
        return self.scale / 10 if space == 'campus' else 1

def sim(scale, src, dst):
    return lambda p: (dst[0] + scale * (p[0] - src[0]), dst[1] + scale * (p[1] - src[1]))

IDENT = lambda p: p
# Building 1 Floor 2 (12xx) inset -> ground: scale 1.44 from the library's semicircular
# bump (inset (5760,1510) -> ground (5654,3300)) and the south row's SW corner.
U12_TO_GROUND = sim(1.44, (5760, 1510), (5654, 3300))
# Building 1 Floor 3 (13xx) inset -> 12xx inset by the STEAM Lab outline, then as above.
U13_TO_U12 = sim(0.99, (3962, 562), (5076, 551))
# Building 1 Floor 2: the clean single-line plan 2026-10-04_floor-2.svg is the
# same drawing as the labeled export minus (7.5, 9.5), so it uses the export's
# already-documented placement over the ground plan (see CAMPUS_MAP.md).
U12_EXPORT = sim(0.81439, (0, 0), (406.387, -5.887))
U12D_TO_CAMPUS = lambda p: U12_EXPORT((p[0] + 7.5, p[1] + 9.5))
# Building 1 Floor 2 fitted onto the Floor 1 Building 1 trace, in campus units.
# Its lower part sits directly above Floor 1: the 1213-1219 row over 1155-1162
# (top wall 94.8 -> 97.5, bottom 112.3 -> 114.8), the 1202-1209 row over
# 1138-Book Room (167.5 -> 169, 184.4 -> 186.1), and the west end and east wall
# (x 447.6 -> 447.3, 563.6 -> 562.9). Least squares: x - 0.3, and y scaled
# by 0.987 about the north row's top wall. Every match is then within 0.3 units.
def FIT_U12(q): return (round(q[0] - 0.3, 3), round(97.5 + 0.987 * (q[1] - 94.8), 3))
# Building 1 Floor 3 fitted onto the fitted Floor 2 north wing it repeats: 18
# matching outline corners (STEAM Lab, the 1245-1248 and 1237-1242 wings, the
# south wall), least squares per axis about the STEAM Lab's NW corner. Every
# corner is then within 0.7 units; the STEAM Lab's east step differs between
# the two plans and is not matched.
def FIT_U13(q): return (round(454.7 + 0.9966 * (q[0] - 455), 3), round(5.66 + 0.9806 * (q[1] - 1.9), 3))

# The clean plan is one absolute M/L/H/V/C/Z path (the C curves are the
# library's semicircular bump). planar.py splits it into footprint, walls and
# dividers like Floor 1.
U12D_SVG = os.path.join(here, '..', '..', '2026-10-04_floor-2.svg')
U12D_SEGMENTS = PLANAR['parse_plan'](re.search(r'<path\b[^>]*\bd="([^"]+)"', open(U12D_SVG).read()).group(1))
# Unlabeled spaces smaller than this (plan units squared; a classroom is about
# 150) are closets or stair boxes: their lines are left out like Floor 1.
U12_MIN_ROOM = 100
DRAWINGS = {
    'b2': Drawing('b2', (2400, 2800), IDENT, 1, 'Ground plan, Building 2'),
    'b3': Drawing('b3', (0, 0), IDENT, 1, 'Ground plan, Building 3 (coordinates already page px)'),
    'site': Drawing('site', (0, 0), IDENT, 1, 'Ground plan site features'),
    'u2': Drawing('u2', (2500, 1820), lambda p: (p[0] - 23, p[1] + 1049), 1,
                  'Building 2 Floor 2 (22xx): scale 1; auditorium walls matched to the ground auditorium'),
    'u3': Drawing('u3', (800, 2300), lambda p: (p[0] + 2, p[1] + 628), 1,
                  'Building 3 Floor 2 (3-2xx): scale 1; east wall and north wall matched; west extent and vertical position uncertain'),
    'u13': Drawing('u13', (3700, 520), lambda p: U12_TO_GROUND(U13_TO_U12(p)), 1.44 * 0.99,
                   'Building 1 Floor 3 (13xx): via STEAM Lab outline onto the 12xx inset, then the 12xx placement',
                   fit=FIT_U13),
    'u12d': Drawing('u12d', (0, 0), U12D_TO_CAMPUS, 0.81439,
                    'Building 1 Floor 2 (12xx), traced from 2026-10-04_floor-2.svg', to_campus=True, fit=FIT_U12),
}

def path(d, pts, space, close=False):
    m = [d.map(p, space) for p in pts]
    s = 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in m)
    return s + (' Z' if close else '')
def rect(d, x0, y0, x1, y1, space): return path(d, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], space, True)
def crossed(d, x0, y0, x1, y1, space):
    return rect(d, x0, y0, x1, y1, space) + ' ' + path(d, [(x0, y0), (x1, y1)], space) + ' ' + path(d, [(x1, y0), (x0, y1)], space)
def stair(d, x0, y0, x1, y1, space):
    out = rect(d, x0, y0, x1, y1, space)
    vertical = (y1 - y0) > (x1 - x0)
    for i in range(1, 4):
        if vertical:
            y = y0 + (y1 - y0) * i / 4; out += ' ' + path(d, [(x0, y), (x1, y)], space)
        else:
            x = x0 + (x1 - x0) * i / 4; out += ' ' + path(d, [(x, y0), (x, y1)], space)
    return out
def triangle(d, x0, y0, x1, y1, space):
    return path(d, [((x0 + x1) / 2, y0), (x1, y1), (x0, y1)], space, True)
SYMBOL = {'crossed': crossed, 'stair': stair, 'ladder': stair, 'triangle': triangle, 'box': rect}

# ---------------------------------------------------------------- Ground: Building 2
B2 = dict(
    walls=[
        [(428, 116), (963, 116)], [(428, 116), (428, 240)], [(921, 110), (921, 214)],
        [(457, 236), (457, 545)],
        [(1006, 127), (1455, 127)], [(1455, 108), (1455, 280)], [(1265, 276), (1455, 276)], [(1290, 276), (1290, 300)],
        [(1290, 677), (1290, 941)], [(1041, 940), (1290, 940)], [(1020, 822), (1020, 924)], [(777, 924), (1020, 924)],
        [(780, 793), (780, 926)], [(742, 796), (1138, 796)], [(266, 800), (665, 800)],
        [(270, 800), (270, 940)], [(270, 940), (650, 940)], [(650, 800), (650, 940)],
        [(109, 692), (109, 953)], [(109, 948), (268, 948)],
        [(111, 247), (111, 618)], [(111, 324), (218, 324)], [(223, 244), (223, 502)],
        [(111, 247), (150, 247), (150, 218), (180, 218), (180, 247), (223, 247)],
        [(270, 254), (270, 463)], [(297, 279), (459, 279)], [(268, 518), (446, 518)],
    ],
    arcs=[((428, 165), (370, 165), 35, (370, 235), (428, 235))],
    dividers=[
        [(428, 237), (920, 237)], [(555, 120), (555, 237)], [(457, 545), (457, 630)],
        [(457, 630), (920, 630)], [(920, 237), (920, 630)],
        [(400, 520), (400, 630)], [(270, 630), (457, 630)],
        [(111, 630), (270, 630)], [(111, 690), (270, 690)], [(223, 630), (223, 948)],
        [(270, 690), (665, 690)], [(745, 690), (1290, 690)],
        [(378, 690), (378, 800)], [(520, 690), (520, 800)], [(893, 690), (893, 796)], [(1040, 690), (1040, 796)],
        [(1180, 690), (1180, 940)], [(1180, 805), (1290, 805)],
        [(920, 320), (1135, 320)], [(1135, 320), (1135, 510)], [(920, 510), (1135, 510)],
        [(985, 510), (985, 628)], [(1060, 510), (1060, 628)], [(1135, 510), (1135, 628)],
        [(1180, 510), (1180, 628)], [(1225, 510), (1225, 628)], [(920, 628), (1285, 628)],
        [(1285, 300), (1285, 630)],
        [(1006, 127), (1006, 276)], [(1240, 127), (1240, 276)], [(1240, 200), (1320, 200)],
        [(1320, 127), (1320, 276)], [(1006, 270), (1265, 270)],
    ],
    uncertain=[
        ('Small unlabeled box west of the auditorium', [(334, 278), (388, 278), (388, 370), (334, 370), (334, 278)]),
        ('Small room left of 2107; label reads 2-108 or 2-109', [(960, 135), (1006, 135), (1006, 276), (960, 276), (960, 135)]),
    ],
    symbols=[
        ('stair', (400, 520, 457, 630), 'PDF label STR (west of auditorium)'),
        ('stair', (920, 515, 985, 625), 'PDF label STR (east of auditorium)'),
        ('stair', (275, 890, 340, 915), 'PDF label STR (south side)'),
        ('stair', (1065, 880, 1130, 910), 'PDF label STR (south-east)'),
        ('stair', (655, 870, 745, 910), 'Hatched stair at the south entrance'),
        ('stair', (590, 995, 900, 1015), 'Hatched band south of Building 2 (steps?)'),
        ('box', (110, 955, 185, 1020), 'Exit pictogram'),
        ('box', (700, 1045, 770, 1100), 'Exit pictogram'),
    ],
)
B2_ROOMS = [  # id, label, kind, status, rect(x0,y0,x1,y1), label pos, rotate, lines, title, note
    ('wr', 'WR', 'room', 'uncertain', (428, 116, 555, 237), (505, 182), 0, 1, None, 'Meaning of WR is not stated'),
    ('stage', 'Stage 2-110', 'area', 'documented', (555, 116, 921, 237), (715, 180), 0, 2, 'Stage (2-110)', ''),
    ('auditorium', 'Auditorium', 'area', 'documented', (457, 237, 920, 630), (690, 440), 0, 1, 'Auditorium', ''),
    ('room-2134', '2134 Dance', 'room', 'documented', (111, 324, 223, 630), (170, 475), -90, 2, 'Room 2134 · Dance', ''),
    ('room-2135', '2135', 'room', 'documented', (109, 690, 223, 948), (168, 810), -90, 1, None, ''),
    ('room-2132', '2132', 'room', 'documented', (270, 518, 400, 630), (330, 573), 0, 1, None, ''),
    ('room-2133', '2133', 'room', 'documented', (270, 690, 378, 800), (325, 737), 0, 1, None, ''),
    ('room-2131', '2131', 'room', 'documented', (378, 690, 520, 800), (447, 737), 0, 1, None, ''),
    ('room-2129', '2129', 'room', 'documented', (520, 690, 665, 800), (590, 737), 0, 1, None, ''),
    ('room-2125', '2125', 'room', 'documented', (745, 690, 893, 796), (818, 735), 0, 1, None, ''),
    ('room-2123', '2123', 'room', 'documented', (893, 690, 1040, 796), (967, 735), 0, 1, None, ''),
    ('room-2117', '2117', 'room', 'documented', (1180, 690, 1290, 805), (1235, 730), 0, 1, None, ''),
    ('room-2118', '2118', 'room', 'documented', (1180, 805, 1290, 940), (1235, 878), 0, 1, None, ''),
    ('room-2113', '2113 Band', 'room', 'documented', (920, 320, 1135, 510), (1030, 415), 0, 2, 'Room 2113 · Band', ''),
    ('room-2107', '2107 Choir', 'room', 'documented', (1006, 127, 1240, 270), (1117, 205), 0, 2, 'Room 2107 · Choir', ''),
    ('room-2101', '2101 Drama', 'room', 'documented', (1320, 127, 1455, 276), (1388, 205), 0, 2, 'Room 2101 · Drama', ''),
    ('off-1', 'OFF', 'room', 'uncertain', (1240, 127, 1320, 200), (1280, 162), 0, 1, None, 'Office? (label OFF)'),
    ('off-2', 'OFF', 'room', 'uncertain', (1240, 200, 1320, 276), (1280, 238), 0, 1, None, 'Office? (label OFF)'),
    ('room-2-108', '2-108', 'room', 'uncertain', (960, 135, 1006, 276), (982, 205), -90, 1, None, 'Label reads 2-108 or 2-109'),
    ('t-1', 'T', 'room', 'uncertain', (985, 510, 1060, 628), (1022, 567), 0, 1, None, 'Label T, presumed restroom'),
    ('t-2', 'T', 'room', 'uncertain', (1060, 510, 1135, 628), (1097, 567), 0, 1, None, 'Label T, presumed restroom'),
    ('room-2-116', '2-116', 'room', 'uncertain', (1135, 510, 1180, 628), (1158, 570), -90, 1, None, 'Small vertical label 2-116'),
    ('elec', 'ELEC', 'room', 'uncertain', (1180, 510, 1225, 628), (1202, 570), -90, 1, None, 'ELEC (electrical?)'),
    ('off-3', 'OFF', 'room', 'uncertain', (1135, 330, 1180, 420), (1158, 375), -90, 1, None, 'Office? (label OFF)'),
    ('entrance-quad', 'Entrance from Quad', 'context', 'documented', (1340, 550, 1430, 740), (1385, 640), -90, 2, None,
     'Printed label east of Building 2'),
]
# ---------------------------------------------------------------- Ground: Building 3 (page px)
B3 = dict(
    walls=[
        [(1061, 3045), (2083, 3045)], [(2083, 3045), (2083, 3192)], [(1981, 3192), (2089, 3192)], [(1990, 3192), (1990, 3262)],
        [(1061, 3218), (1886, 3216)], [(1061, 3268), (2057, 3266)], [(1061, 3045), (1061, 3834)], [(1887, 3261), (1887, 3762)],
        [(1061, 3794), (1777, 3794)], [(1061, 3730), (1887, 3730)],
        [(2057, 3262), (2410, 3260)], [(2381, 3465), (2381, 3720)], [(1887, 3714), (2385, 3714)],
        [(722, 3291), (722, 3853)], [(752, 3467), (752, 3765)], [(797, 3356), (797, 3648)], [(958, 3572), (958, 3740)],
        [(960, 3379), (960, 3500)], [(712, 3355), (802, 3355), (802, 3475), (712, 3475), (712, 3355)],
    ],
    arcs=[],
    dividers=[[(x, 3045), (x, 3218)] for x in (1126, 1193, 1228, 1312, 1444, 1545, 1662, 1807, 1886)] + [
        [(1444, 3150), (1662, 3150)], [(1061, 3135), (1126, 3135)],
    ] + [[(x, 3730), (x, 3794)] for x in (1100, 1170, 1590, 1775, 1840)],
    uncertain=[
        ('Fence-like line marked with X (north edge of tennis courts?)', [(230, 3270), (605, 3270)]),
        ('Fence-like line marked with X', [(170, 3400), (690, 3400)]),
    ],
    symbols=[
        ('stair', (1015, 3090, 1060, 3200), 'Hatched stair west of the Building 3 locker row'),
        ('stair', (1540, 3145, 1570, 3215), 'PDF label STR (locker row)'),
        ('crossed', (2040, 3040, 2080, 3080), 'PDF label ELEV. with leader (north-east corner)'),
        ('stair', (2120, 3035, 2240, 3085), 'PDF label STR (exterior, north-east)'),
        ('stair', (720, 3365, 765, 3410), 'PDF label STR (basement side)'),
        ('crossed', (768, 3415, 795, 3460), 'PDF label ELEV. with leader (basement side)'),
        ('ladder', (722, 3470, 752, 3835), 'Ladder-like column; stairs or ramp?'),
        ('stair', (760, 3770, 960, 3815), 'PDF label STR (south of basement area)'),
        ('box', (800, 3635, 960, 3740), 'Two pictograms (exit or stair symbols?)'),
        ('box', (1890, 3735, 1980, 3835), 'Exit pictogram'),
        ('stair', (1285, 3855, 1340, 3895), 'PDF label STR (south of lobby)'),
        ('stair', (1610, 3845, 1660, 3885), 'PDF label STR (south of lobby)'),
        ('triangle', (910, 2925, 1000, 3005), 'Triangle symbol with a mark inside; meaning unknown'),
        ('triangle', (480, 3675, 570, 3755), 'Triangle symbol with a mark inside; meaning unknown'),
        ('triangle', (2430, 3780, 2510, 3860), 'Triangle symbol with a mark inside; meaning unknown'),
    ],
)
B3_ROOMS = [
    ('fl', 'FL', 'room', 'uncertain', (1061, 3045, 1126, 3135), (1093, 3092), 0, 1, None, 'Label FL or EL; a 3-107 leader points to this corner'),
    ('st', 'ST', 'room', 'uncertain', (1061, 3135, 1126, 3218), (1093, 3176), 0, 1, None, 'Label ST (storage?)'),
    ('eq', 'EQ', 'room', 'uncertain', (1126, 3045, 1193, 3218), (1158, 3118), 0, 1, None, 'Leader 3-108 appears to point here'),
    ('t-a', 'T', 'room', 'uncertain', (1193, 3045, 1228, 3218), (1210, 3092), 0, 1, None, 'Label T, presumed restroom'),
    ('off-a', 'OFF', 'room', 'uncertain', (1228, 3045, 1312, 3218), (1268, 3133), 0, 1, None, 'Leader 3-109 points below this room'),
    ('room-3-110a', '3-110A Boys Locker', 'room', 'documented', (1312, 3045, 1444, 3218), (1378, 3130), 0, 2,
     'Boys Locker Room (3-110A)', ''),
    ('t-b', 'T', 'room', 'uncertain', (1444, 3045, 1545, 3150), (1492, 3092), 0, 1, None, 'Leader 3-112 appears to point here'),
    ('t-c', 'T', 'room', 'uncertain', (1545, 3045, 1662, 3150), (1608, 3092), 0, 1, None, 'Label T, presumed restroom'),
    ('trn-1', 'TRN', 'room', 'uncertain', (1444, 3150, 1540, 3216), (1494, 3182), 0, 1, None, 'Label TRN (training?)'),
    ('trn-2', 'TRN', 'room', 'uncertain', (1570, 3150, 1662, 3216), (1614, 3182), 0, 1, None, 'Label TRN (training?)'),
    ('girls-locker', '3-313 Girls Locker', 'room', 'documented', (1662, 3045, 1807, 3216), (1735, 3130), 0, 2,
     'Girls Locker Room', 'Number printed as 3-313 (possibly 3-113)'),
    ('off-b', 'OFF', 'room', 'uncertain', (1807, 3045, 1886, 3180), (1846, 3115), 0, 1, None, 'Leader 3-115 points here'),
    ('garage', 'Serv. Car Garage', 'room', 'documented', (1886, 3045, 2083, 3192), (1988, 3135), 0, 2, 'Serv. Car Garage', ''),
    ('building-3', 'Building 3', 'building', 'documented', (722, 3045, 2410, 3794), (1566, 3445), 0, 1, 'Building 3',
     'Printed in the PDF at page px (1490, 3445); centred on the building for the zoomed-out name'),
    ('gym-3-101', 'Gymnasium 3-101', 'area', 'documented', (1061, 3500, 1488, 3730), (1285, 3595), 0, 2, 'Gymnasium (3-101)', ''),
    ('gym-3-102', 'Gymnasium 3-102', 'area', 'documented', (1488, 3500, 1887, 3730), (1692, 3590), 0, 2, 'Gymnasium (3-102)', ''),
    ('lobby', 'Lobby', 'area', 'documented', (1170, 3730, 1590, 3794), (1385, 3762), 0, 1, 'Building 3 Lobby', ''),
    ('t-d', 'T', 'room', 'uncertain', (1590, 3730, 1775, 3794), (1683, 3762), 0, 1, None, 'Label T, presumed restroom'),
    ('pool', 'Outdoor Swimming Pool', 'area', 'documented', (1887, 3266, 2381, 3714), (2140, 3490), 0, 2, 'Outdoor Swimming Pool', ''),
    ('room-3-122', '3-122', 'room', 'uncertain', (2381, 3420, 2425, 3500), (2403, 3460), -90, 1, None,
     'Leader labels 3-122 and 3-123 point to the pool east side'),
    ('room-3-124', '3-124', 'room', 'uncertain', (2381, 3560, 2425, 3630), (2403, 3595), -90, 1, None, 'Leader label'),
    ('room-3-125', '3-125', 'room', 'uncertain', (2381, 3635, 2425, 3705), (2403, 3670), -90, 1, None, 'Leader label'),
    ('basement', 'Basement Area', 'area', 'uncertain', (797, 3380, 958, 3640), (877, 3535), 0, 2, None,
     'Labeled (BASEMENT AREA); may not be at ground level'),
    ('tennis', 'Tennis Courts', 'area', 'documented', (200, 3500, 560, 3625), (370, 3565), 0, 2, 'Tennis Courts',
     'Label only; the courts are not outlined'),
    ('garage-below', 'Parking Garage Below', 'area', 'documented', (200, 3630, 560, 3750), (370, 3690), 0, 2,
     'Parking garage (below the tennis courts)', 'Printed label; garage outline not drawn'),
]
SITE = dict(site=[])
BUILDING_LABELS = {  # level -> (drawing key, id, label, rect, pos, note)
    1: [('site', 'building-1', 'Building 1', (4160, 2875, 5850, 3900), (5000, 3350), 'Name from the user; not printed in the PDF'),
        ('site', 'building-2', 'Building 2', (2509, 2916, 3887, 3753), (3198, 3300), 'Name from the user; not printed in the PDF')],
    2: [('site', 'building-1', 'Building 1', (4400, 1920, 5850, 3850), (5125, 3000), 'Name from the user'),
        ('site', 'building-2', 'Building 2', (2520, 2916, 3680, 3740), (3100, 3240), 'Name from the user'),
        ('site', 'building-3', 'Building 3', (840, 3045, 2085, 3365), (1460, 3220), 'Name from the user')],
    3: [('site', 'building-1', 'Building 1', (4400, 1920, 5850, 3300), (5125, 2600), 'Name from the user')],
}
SITE_ROOMS = []  # Teacher parking north of Building 1 is left off the student map.
# ---------------------------------------------------------------- Floor 2: Building 2 (22xx)
U2 = dict(
    outline=[(360, 47), (838, 47), (838, 444), (1197, 444), (1197, 864), (1091, 864), (1091, 852), (979, 852), (979, 798),
             (1012, 798), (1012, 725), (202, 725), (202, 800), (271, 800), (271, 854), (157, 854), (157, 869), (46, 869),
             (46, 558), (202, 558), (202, 444), (385, 444), (385, 177), (360, 177)],
    dividers=[[(385, 555), (838, 555)], [(320, 444), (320, 555)], [(900, 444), (900, 550)], [(1020, 444), (1020, 550)],
              [(202, 610), (1050, 610)], [(1050, 610), (1050, 725)], [(1090, 550), (1090, 852)],
              [(160, 558), (160, 800)], [(46, 700), (160, 700)]] + [[(x, 610), (x, 725)] for x in (360, 520, 722, 890)],
    symbols=[('stair', (320, 444, 385, 555), 'PDF label STR'), ('stair', (838, 444, 900, 555), 'PDF label STR'),
             ('stair', (190, 800, 275, 854), 'PDF label STR'), ('stair', (975, 798, 1060, 852), 'PDF label STR')],
)
U2_ROOMS = [
    ('auditorium', 'Auditorium', 'area', 'documented', (385, 47, 838, 555), (615, 305), 0, 1, 'Auditorium (upper level)',
     'The 22xx plan includes the auditorium; it spans both levels'),
    ('room-2218', '2218', 'room', 'documented', (202, 444, 320, 555), (262, 500), 0, 1, None, ''),
    ('room-2206', '2206', 'room', 'documented', (900, 444, 1020, 555), (960, 500), 0, 1, None, ''),
    ('room-2215', '2215', 'room', 'uncertain', (202, 610, 360, 725), (283, 665), 0, 1, None,
     '2215 is printed twice on this plan; one may be a misprint'),
    ('room-2213', '2213', 'room', 'documented', (360, 610, 520, 725), (440, 665), 0, 1, None, ''),
    ('room-2209', '2209', 'room', 'documented', (520, 610, 722, 725), (600, 660), 0, 1, None, ''),
    ('room-2207', '2207', 'room', 'documented', (722, 610, 890, 725), (805, 660), 0, 1, None, ''),
    ('room-2205', '2205', 'room', 'documented', (890, 610, 1050, 725), (970, 658), 0, 1, None, ''),
    ('room-2202', '2202', 'room', 'documented', (1090, 444, 1197, 864), (1145, 700), -90, 1, None, ''),
    ('room-2215-west', '2215', 'room', 'uncertain', (46, 558, 160, 700), (100, 630), -90, 1, None,
     '2215 is printed twice on this plan; one may be a misprint'),
    ('room-2217', '2217', 'room', 'documented', (46, 700, 160, 869), (103, 800), -90, 1, None, ''),
]
# ---------------------------------------------------------------- Floor 2: Building 3 (3-2xx)
U3 = dict(
    outline=[(43, 117), (1209, 117), (1209, 241), (1281, 241), (1281, 433), (43, 433)],
    walls=[[(50, 212), (1200, 212)], [(50, 250), (1281, 250)]],
    dividers=[[(x, 117), (x, 212)] for x in (268, 488, 585, 754, 988, 1102)] + [[(628, 117), (628, 433)]] +
             [[(x, 250), (x, 433)] for x in (177, 313, 450, 586, 778, 959, 1114)] +
             [[(778, 311), (959, 311)], [(838, 250), (838, 311)], [(898, 250), (898, 311)], [(868, 311), (868, 433)],
              [(1114, 338), (1196, 338)], [(1196, 250), (1196, 338)]],
    symbols=[('stair', (586, 250, 628, 365), 'PDF label STR'),
             ('crossed', (1160, 145, 1200, 180), 'Elevator? The 3-204 and ELEV. leaders point here')],
)
U3_ROOMS = [(f'st-{i}', 'ST', 'room', 'uncertain', r, ((r[0] + r[2]) / 2, 165), 0, 1, None, 'Label ST (storage?)')
            for i, r in enumerate([(50, 117, 268, 212), (268, 117, 488, 212), (488, 117, 585, 212),
                                   (628, 117, 754, 212), (754, 117, 988, 212), (988, 117, 1102, 212)])] + [
    ('room-3-217', '3-217 CR', 'room', 'documented', (43, 250, 177, 433), (110, 340), 0, 2, 'Room 3-217 (CR)', ''),
    ('room-3-215', '3-215 CR', 'room', 'documented', (177, 250, 313, 433), (245, 340), 0, 2, 'Room 3-215 (CR)', ''),
    ('wt-room-1', 'Wt. Room', 'room', 'documented', (313, 250, 450, 433), (382, 350), 0, 2, 'Wt. Room (west)', ''),
    ('wt-room-2', 'Wt. Room', 'room', 'documented', (450, 250, 586, 433), (518, 350), 0, 2, 'Wt. Room (east)', ''),
    ('room-3-209', '3-209 Boys Team Room', 'room', 'documented', (628, 250, 778, 433), (703, 340), 0, 2,
     'Boys Team Room (3-209)', ''),
    ('t-e', 'T', 'room', 'uncertain', (778, 250, 838, 311), (808, 280), 0, 1, None, 'Label T'),
    ('t-f', 'T', 'room', 'uncertain', (838, 250, 898, 311), (868, 280), 0, 1, None, 'Label T'),
    ('st-7', 'ST', 'room', 'uncertain', (898, 250, 959, 311), (928, 280), 0, 1, None, 'Label ST'),
    ('t-g', 'T', 'room', 'uncertain', (778, 311, 868, 433), (823, 372), 0, 1, None, 'Label T'),
    ('t-h', 'T', 'room', 'uncertain', (868, 311, 959, 433), (913, 372), 0, 1, None, 'Label T'),
    ('girls-team-room', 'Girls Team Room', 'room', 'documented', (959, 250, 1114, 433), (1036, 340), 0, 2, 'Girls Team Room', ''),
    ('off-c', 'OFF', 'room', 'uncertain', (1114, 250, 1196, 338), (1155, 295), 0, 1, None, 'Office? 3-202 leader nearby'),
    ('room-3-201', '3-201', 'room', 'documented', (1114, 338, 1281, 433), (1198, 385), 0, 1, None, ''),
]
# ---------------------------------------------------------------- Floor 3: Building 1 (13xx)
U13 = dict(
    outline=[(262, 42), (665, 42), (665, 139), (801, 139), (801, 211), (785, 211), (785, 565), (840, 565), (840, 695),
             (916, 695), (916, 856), (160, 856), (160, 945), (108, 945), (108, 858), (38, 858), (38, 584), (116, 584),
             (116, 554), (256, 554), (256, 482), (360, 482), (360, 216), (262, 216)],
    symbols=[('stair', (255, 485, 300, 540), 'Hatched stair'), ('stair', (108, 860, 160, 940), 'Hatched stair'),
             ('stair', (718, 875, 800, 930), 'Hatched stair'), ('stair', (540, 245, 590, 315), 'Hatched stair in Small Quad'),
             ('stair', (612, 190, 660, 215), 'PDF label STR'), ('crossed', (40, 820, 60, 845), 'Crossed-box symbol'),
             ('crossed', (890, 820, 910, 845), 'Crossed-box symbol')],
)
def r13(i, num, rect, at, rot=0): return (f'room-{num}', str(num), 'room', 'documented', rect, at, rot, 1, None, '')
U13_ROOMS = [
    ('steam-lab', 'STEAM Lab', 'area', 'documented', (262, 42, 610, 216), (440, 127), 0, 1, 'STEAM Lab (upper level)', ''),
    ('room-1-332', '1-332', 'room', 'uncertain', (610, 50, 665, 185), (640, 118), -90, 1, None, 'Small vertical label, partly legible'),
    ('small-quad', 'Small Quad', 'area', 'documented', (461, 245, 658, 482), (560, 400), 0, 2, 'Small Quad', 'Open courtyard'),
    r13(0, 1331, (692, 139, 801, 211), (742, 178)), r13(0, 1330, (692, 211, 785, 285), (735, 248)),
    r13(0, 1329, (692, 285, 785, 355), (735, 322)), r13(0, 1328, (692, 355, 785, 430), (735, 395)),
    r13(0, 1327, (692, 430, 785, 495), (735, 463)), r13(0, 1326, (692, 495, 785, 565), (738, 533)),
    r13(0, 1333, (360, 216, 432, 282), (395, 249)), r13(0, 1334, (360, 282, 432, 350), (395, 316)),
    r13(0, 1335, (360, 350, 432, 415), (395, 386)), r13(0, 1336, (360, 415, 432, 482), (395, 455)),
    r13(0, 1320, (335, 512, 410, 660), (373, 575), -90), r13(0, 1321, (410, 512, 535, 635), (473, 565), -90),
    r13(0, 1322, (535, 512, 660, 640), (597, 565), -90), r13(0, 1323, (410, 640, 635, 695), (470, 668)),
    r13(0, 1325, (715, 565, 840, 640), (770, 603)), r13(0, 1324, (715, 640, 840, 690), (770, 665)),
    r13(0, 1316, (38, 584, 110, 715), (75, 650), -90), r13(0, 1315, (38, 715, 110, 825), (75, 770), -90),
    r13(0, 1317, (155, 584, 210, 700), (183, 642), -90), r13(0, 1318, (210, 580, 275, 700), (243, 640), -90),
    r13(0, 1319, (275, 580, 335, 700), (305, 640), -90), r13(0, 1307, (275, 700, 335, 825), (305, 762), -90),
    r13(0, 1306, (335, 660, 410, 825), (372, 770), -90), r13(0, 1305, (410, 695, 535, 825), (472, 762), -90),
    r13(0, 1304, (535, 695, 660, 825), (597, 762), -90), r13(0, 1303, (685, 695, 750, 825), (718, 762), -90),
    r13(0, 1302, (750, 695, 805, 825), (778, 762), -90), r13(0, 1301, (805, 695, 916, 825), (860, 762), -90),
]
U13_ROOM_OUTLINES = [r[4] for r in U13_ROOMS if r[0].startswith('room-1') and r[0] != 'room-1-332']

# Route-network candidates (page px, ground placement already applied where noted).
CANDIDATES = [
    # level, building, type, drawing key, point, note
    (1, '1', 'stair', 'b1', (582, 536), 'Hatched stair symbol near the Cafeteria'),
    (1, '1', 'stair', 'b1', (1474, 547), 'Hatched stair symbol north of the Career Center'),
    (1, '1', 'stair', 'b1', (902, 882), 'Hatched stair symbol on the south side of the Quad'),
    (1, '1', 'elevator', 'b1', (1432, 654), 'Room labeled ELEV. M. (elevator or machine room)'),
    (1, '2', 'stair', 'b2', (428, 575), 'STR west of the auditorium'), (1, '2', 'stair', 'b2', (952, 570), 'STR east of the auditorium'),
    (1, '2', 'stair', 'b2', (307, 902), 'STR south side'), (1, '2', 'stair', 'b2', (1097, 895), 'STR south-east'),
    (1, '2', 'stair', 'b2', (700, 890), 'Hatched stair at south entrance'),
    (1, '2', 'entrance', 'b2', (1290, 650), 'Printed "Entrance from Quad"'),
    (1, '2', 'exit', 'b2', (147, 987), 'Exit pictogram'), (1, '2', 'exit', 'b2', (735, 1072), 'Exit pictogram'),
    (1, '3', 'stair', 'b3', (1037, 3145), 'Hatched stair west of the locker row'),
    (1, '3', 'stair', 'b3', (1555, 3180), 'STR in the locker row'), (1, '3', 'stair', 'b3', (2180, 3060), 'Exterior STR, north-east'),
    (1, '3', 'elevator', 'b3', (2060, 3060), 'ELEV. leader, north-east corner'),
    (1, '3', 'elevator', 'b3', (781, 3437), 'ELEV. leader, basement side'), (1, '3', 'stair', 'b3', (742, 3387), 'STR, basement side'),
    (1, '3', 'stair', 'b3', (860, 3792), 'STR south of basement area'),
    (1, '3', 'stair', 'b3', (1312, 3875), 'STR south of lobby'), (1, '3', 'stair', 'b3', (1635, 3865), 'STR south of lobby'),
    (1, '3', 'exit', 'b3', (1935, 3785), 'Exit pictogram'),
    (2, '1', 'stair', 'u12', (770, 282), 'Hatched stair in the Small Quad'),
    (2, '1', 'stair', 'u12', (492, 515), 'Hatched stair west of 1229'),
    (2, '1', 'stair', 'u12', (345, 895), 'Hatched stair, south-west wing'),
    (2, '1', 'stair', 'u12', (962, 906), 'Hatched stair north of the Teacher Workroom'),
    (2, '1', 'stair', 'u12', (552, 1141), 'Hatched stair north of 1203'),
    (2, '1', 'stair', 'u12', (845, 205), 'STR beside the STEAM Lab'),
    (2, '2', 'stair', 'u2', (352, 500), 'STR'), (2, '2', 'stair', 'u2', (869, 500), 'STR'),
    (2, '2', 'stair', 'u2', (232, 827), 'STR'), (2, '2', 'stair', 'u2', (1017, 825), 'STR'),
    (2, '3', 'stair', 'u3', (607, 307), 'STR'), (2, '3', 'elevator', 'u3', (1180, 162), '3-204 / ELEV. leaders'),
    (3, '1', 'stair', 'u13', (277, 512), 'Hatched stair'), (3, '1', 'stair', 'u13', (134, 900), 'Hatched stair'),
    (3, '1', 'stair', 'u13', (759, 902), 'Hatched stair'), (3, '1', 'stair', 'u13', (636, 202), 'STR'),
]
B1_DRAW = Drawing('b1', (3897.8, 2617.6), IDENT, 1, 'Ground plan, Building 1 (earlier partial trace, shifted)')
# Open space of the Quad, the Student Area, the widened gap by the Lunch Shelter
# and the covered walkways along the rooms, in the earlier trace's crop px.
# Buildings, the Career Center and the corner structures are outside it.
B1_OPEN = [(-42, 80), (52, 80), (52, 134), (246, 134), (246, 478), (487, 478), (487, 430), (1655, 430), (1655, 480),
           (1699, 480), (1699, 770), (1640, 770), (1640, 623), (1319, 623), (1319, 784), (1355, 784), (1355, 860),
           (1483, 860), (1483, 972), (837, 972), (837, 927), (-10, 927), (-10, 478), (-42, 478)]
SENIOR_HILL = (1215, 700, 80)  # centre and radius, crop px (draft)

def ramp_band(d, space):
    a0, ac, a1 = (d.map(p, space) for p in ((3900, 2600), (4060, 2550), (4215, 2540)))
    b0, bc, b1 = (d.map(p, space) for p in ((3900, 2710), (4100, 2660), (4270, 2645)))
    return (f'M{fmt(a0[0])} {fmt(a0[1])} Q{fmt(ac[0])} {fmt(ac[1])} {fmt(a1[0])} {fmt(a1[1])} '
            f'L{fmt(b1[0])} {fmt(b1[1])} Q{fmt(bc[0])} {fmt(bc[1])} {fmt(b0[0])} {fmt(b0[1])} Z')

def ramp_chevrons(d, space):
    out = []
    for x, y in ((3990, 2633), (4090, 2612), (4190, 2597)):
        pts = [d.map(p, space) for p in ((x - 14, y - 16), (x + 8, y), (x - 14, y + 16))]
        out.append('M' + ' L'.join(f'{fmt(px)} {fmt(py)}' for px, py in pts))
    return ' '.join(out)
# Hatched stair symbols on the Building 1 ground plan (earlier trace's crop px).
B1_STAIRS = [('stair', (543, 478, 622, 595), 'Hatched stair symbol near the Cafeteria'),
             ('stair', (1418, 510, 1530, 585), 'Hatched stair symbol north of the Career Center'),
             ('stair', (820, 860, 985, 905), 'Hatched stair symbol on the south side of the Quad')]
# Stair symbols drawn on the Building 1 Floor 2 (12xx) plan, crop px of that inset.
DRAWINGS['u12'] = Drawing('u12', (4600, 500), U12_TO_GROUND, 1.44, 'Building 1 Floor 2 (12xx) inset', fit=FIT_U12)
U12_STAIRS = [('stair', (745, 245, 795, 320), 'Hatched stair in the Small Quad'),
              ('stair', (465, 485, 520, 545), 'Hatched stair west of 1229'),
              ('stair', (320, 855, 370, 935), 'Hatched stair, south-west wing'),
              ('stair', (925, 878, 1000, 935), 'Hatched stair north of the Teacher Workroom'),
              ('stair', (505, 1122, 600, 1160), 'Hatched stair north of 1203'),
              ('stair', (820, 195, 870, 215), 'PDF label STR beside the STEAM Lab')]
# Room boxes, label anchors, rotations and line breaks in the clean plan's
# coordinates (its walls are the source-wall cells shifted back by 7.5, 9.5).
U12_ROOMS = [
    ('1242', '1242', 'room', 'documented', (127.6, 17.1, 145.6, 29.1), (136.47, 24.39), 0, 1, None, ''),
    ('1241', '1241', 'room', 'documented', (126.1, 29.1, 143.1, 42.1), (133.84, 36.39), 0, 1, None, ''),
    ('1240', '1240', 'room', 'documented', (126.1, 42.1, 143.1, 54.1), (134.57, 48.42), 0, 1, None, ''),
    ('1239', '1239', 'room', 'documented', (126.1, 54.1, 143.1, 66.35), (134.58, 61.42), 0, 1, None, ''),
    ('1238', '1238', 'room', 'documented', (126.1, 66.35, 143.1, 78.6), (134.57, 72.42), 0, 1, None, ''),
    ('1237', '1237', 'room', 'documented', (126.1, 78.6, 143.1, 90.6), (134.45, 85.42), 0, 1, None, ''),
    ('1245', '1245', 'room', 'documented', (69.1, 30.1, 81.6, 41.85), (75.5, 36.42), 0, 1, None, ''),
    ('1246', '1246', 'room', 'documented', (69.1, 41.85, 81.6, 53.6), (75.55, 48.42), 0, 1, None, ''),
    ('1247', '1247', 'room', 'documented', (69.1, 53.6, 81.6, 65.1), (75.41, 60.39), 0, 1, None, ''),
    ('1248', '1248', 'room', 'documented', (69.1, 65.1, 81.6, 76.1), (75.54, 70.42), 0, 1, None, ''),
    ('1223', '1223', 'room', 'documented', (13.1, 98.6, 26.1, 135.6), (20.94, 116.2), -90, 1, None, ''),
    ('1225', '1225', 'room', 'documented', (33.1, 93.6, 43.1, 135.6), (38.47, 103.79), -90, 1, None, ''),
    ('1227', '1227', 'room', 'documented', (43.1, 93.6, 65.1, 135.6), (54.35, 102.39), -90, 1, None, ''),
    ('1229', '1229', 'room', 'documented', (65.1, 82.1, 78.1, 135.6), (71.45, 95.72), -90, 1, None, ''),
    ('1230', '1230', 'room', 'documented', (78.1, 82.1, 98.85, 103.1), (90.6, 93.42), 0, 1, None, ''),
    ('1231', '1231', 'room', 'documented', (98.85, 82.1, 119.6, 103.1), (109.9, 93.42), 0, 1, None, ''),
    ('1219', '1219', 'room', 'documented', (53.6, 93.6, 65.1, 135.6), (59.49, 124.16), -90, 1, None, ''),
    ('1218', '1218', 'room', 'documented', (65.1, 82.1, 119.6, 135.6), (71.45, 122.16), 0, 1, None, ''),
    ('1236', '1236', 'room', 'documented', (78.1, 103.1, 116.6, 114.1), (88.58, 110.42), 0, 1, None, ''),
    ('1217', '1217', 'room', 'documented', (65.1, 114.1, 119.6, 135.6), (90.93, 126.39), 0, 1, None, ''),
    ('1216', '1216', 'room', 'documented', (65.1, 114.1, 119.6, 135.6), (109.07, 124.42), 0, 1, None, ''),
    ('1234', '1234', 'room', 'documented', (135.6, 90.6, 153.6, 102.6), (143.66, 97.42), 0, 1, None, ''),
    ('1233', '1233', 'room', 'documented', (133.1, 102.6, 153.6, 114.1), (142.6, 108.42), 0, 1, None, ''),
    ('1215', '1215', 'room', 'documented', (126.1, 114.1, 137.1, 135.6), (131.44, 126.2), -90, 1, None, ''),
    ('1214', '1214', 'room', 'documented', (137.1, 114.1, 147.6, 135.6), (142.58, 126.15), -90, 1, None, ''),
    ('1213', '1213', 'room', 'documented', (147.6, 114.1, 166.1, 135.6), (157.09, 125.42), 0, 1, None, ''),
    ('1202', '1202', 'room', 'documented', (43.1, 203.23, 56.6, 224.1), (50.92, 214.23), -90, 1, None, ''),
    ('1203', '1203', 'room', 'documented', (56.6, 203.23, 70.6, 224.1), (63.92, 214.13), -90, 1, None, ''),
    ('1204', '1204', 'room', 'documented', (70.6, 203.23, 85.1, 224.1), (77.62, 214.42), -90, 1, None, ''),
    ('1205', '1205', 'room', 'documented', (85.1, 197.1, 98.1, 224.1), (91.5, 214.42), -90, 1, None, ''),
    ('1206', '1206', 'room', 'documented', (98.1, 197.1, 112.1, 224.1), (105.55, 214.42), -90, 1, None, ''),
    ('1207', '1207', 'room', 'documented', (112.1, 197.1, 139.6, 224.1), (119.35, 214.42), 0, 1, None, ''),
    ('1208', '1208', 'room', 'documented', (112.1, 197.1, 139.6, 224.1), (133.54, 214.42), 0, 1, None, ''),
    ('1209', '1209', 'room', 'documented', (139.6, 211.1, 158.1, 224.1), (149.55, 218.42), 0, 1, None, ''),
    ('1210', '1210', 'room', 'documented', (145.1, 195.1, 158.1, 211.1), (152.08, 203.42), 0, 1, None, ''),
    ('1211', '1211', 'room', 'documented', (145.1, 179.1, 158.1, 195.1), (151.38, 186.39), 0, 1, None, ''),
    ('STEAM Lab', 'STEAM Lab', 'area', 'documented', (52.6, 0.1, 113.6, 30.1), (83.5, 15.7), 0, 1,
     'STEAM Lab', ''),
    ('Small Quad', 'Small Quad', 'area', 'documented', (86.6, 47.1, 120.6, 76.1), (104.7, 58.42), 0, 2,
     'Small Quad', 'Open courtyard'),
    ('Teacher Workroom', 'Teacher Workroom', 'area', 'documented', (125.6, 159.6, 150.6, 179.1), (139.15, 167.67), 0, 2,
     'Teacher Workroom', ''),
]
DRAWINGS['b1'] = B1_DRAW

# ---------------------------------------------------------------- emit
def esc(s): return s.replace('&', '&amp;').replace('"', "'")
def label_rect(d, space, rid, label, kind, status, r, at, rot, lines, title, note, building, level, prefix):
    (x0, y0), (x1, y1) = d.map((r[0], r[1]), space), d.map((r[2], r[3]), space)
    ax, ay = d.map(at, space)
    a = (f'id="{prefix}{rid}" data-label="{esc(label)}" data-kind="{kind}" data-status="{status}" '
         f'data-building="{building}" data-level="{level}" '
         f'x="{fmt(x0)}" y="{fmt(y0)}" width="{fmt(round(x1 - x0, 1))}" height="{fmt(round(y1 - y0, 1))}" '
         f'data-label-x="{fmt(ax)}" data-label-y="{fmt(ay)}" data-rotate="{rot}"')
    if lines == 2: a += ' data-lines="2"'
    if title: a += f' data-title="{esc(title)}"'
    if note: a += f' data-note="{esc(note)}"'
    return f'  <rect {a}/>'

def uncertain_item(d, item, space):
    note = item[0]
    if item[1] == 'Q':
        p0, c, p1 = (d.map(p, space) for p in item[2:5])
        return note, f'M{fmt(p0[0])} {fmt(p0[1])} Q{fmt(c[0])} {fmt(c[1])} {fmt(p1[0])} {fmt(p1[1])}'
    return note, path(d, item[1], space)

def arc_path(d, a, space):
    start, p1, r, p2, end = a
    s, q1, q2, e = (d.map(p, space) for p in (start, p1, p2, end))
    rr = r * d.unit(space)
    return f'M{fmt(s[0])} {fmt(s[1])} L{fmt(q1[0])} {fmt(q1[1])} A{fmt(rr)} {fmt(rr)} 0 0 0 {fmt(q2[0])} {fmt(q2[1])} L{fmt(e[0])} {fmt(e[1])}'

def level_svg(level, space='campus'):
    layers = {k: [] for k in ('footprint', 'open-areas', 'covered-areas', 'hills', 'site', 'walls', 'dividers',
                              'uncertain-lines', 'uncertain-symbols', 'ramp', 'ramp-marks')}
    labels, cands, stairs = [], [], []
    def add_rooms(d, rooms, building, prefix):
        for r in rooms: labels.append(label_rect(d, space, *r, building, level, prefix))
    def add_symbols(d, syms, building=''):
        for kind, box, note in syms:
            if kind == 'stair':
                cx, cy = d.map(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), space)
                stairs.append((f'stair-{level}-{len(stairs) + 1}', building, note, SYMBOL[kind](d, *box, space), cx, cy))
            else:
                layers['uncertain-symbols'].append((note, SYMBOL[kind](d, *box, space)))
    if level == 1:
        # Building 1 from the earlier trace (already campus units via b1data X/Y).
        for dd in (B1['poly'](B1['north']), B1['poly'](B1['east']), B1['poly'](B1['career']), B1['south'], B1['library']):
            layers['footprint'].append(('Building 1', dd))
        layers['walls'] += [('Building 1', dd) for dd in B1['solid']]
        layers['dividers'] += [('Building 1', dd) for dd in B1['dividers']]
        layers['uncertain-lines'] += [(n, dd) for n, dd in B1['uncertain_lines']]
        layers['uncertain-symbols'] += [(n, dd) for n, dd in B1['symbols'] if 'stair' not in n.lower()]
        add_symbols(B1_DRAW, B1_STAIRS, '1')
        for rid, label, kind, status, x0, y0, x1, y1, rot, at, note in B1['rooms']:
            at = at or ((x0 + x1) / 2, (y0 + y1) / 2)
            title = None
            if rid == 'book-room': title = 'Book Room'
            lines = 2 if rid in ('career-center', 'wellness-center', 'admin-offices', 'lunch-shelter', 'student-area', 'senior-hill') else 1
            labels.append(label_rect(B1_DRAW, space, rid, label, kind, status, (x0, y0, x1, y1), at, rot, lines,
                                     title, note, '1' if kind != 'context' else '', level, 'g-b1-'))
        d = DRAWINGS['b2']
        b2_outline = [(111, 247), (428, 247), (428, 116), (963, 116), (963, 127), (1455, 127), (1455, 276), (1285, 276),
                      (1285, 677), (1290, 677), (1290, 940), (1020, 940), (1020, 924), (780, 924), (780, 940), (650, 940),
                      (650, 940), (270, 940), (270, 948), (109, 948), (109, 618), (111, 618)]
        layers['footprint'].append(('Building 2', path(d, b2_outline, space, True)))
        layers['walls'] += [('Building 2', path(d, w, space)) for w in B2['walls']]
        layers['walls'] += [('Building 2', arc_path(d, a, space)) for a in B2['arcs']]
        layers['dividers'] += [('Building 2', path(d, w, space)) for w in B2['dividers']]
        layers['uncertain-lines'] += [(n, path(d, pts, space)) for n, pts in B2['uncertain']]
        add_symbols(d, B2['symbols'], '2'); add_rooms(d, B2_ROOMS, '2', 'g-b2-')
        d = DRAWINGS['b3']
        b3_outline = [(1061, 3045), (2083, 3045), (2083, 3192), (1990, 3192), (1990, 3262), (2410, 3260), (2410, 3714),
                      (1887, 3714), (1887, 3794), (1061, 3794)]
        layers['footprint'].append(('Building 3', path(d, b3_outline, space, True)))
        layers['footprint'].append(('Building 3 basement side', path(d, [(722, 3291), (797, 3291), (797, 3356), (960, 3379),
                                                                          (960, 3740), (958, 3815), (722, 3853)], space, True)))
        layers['walls'] += [('Building 3', path(d, w, space)) for w in B3['walls']]
        layers['dividers'] += [('Building 3', path(d, w, space)) for w in B3['dividers']]
        layers['uncertain-lines'] += [uncertain_item(d, u, space) for u in B3['uncertain']]
        add_symbols(d, B3['symbols'], '3'); add_rooms(d, B3_ROOMS, '3', 'g-b3-')
        # Open student areas (artwork). Routing uses its own walkable data
        # (src/navigation/data/building1Walkable.ts), kept separate from this.
        layers['open-areas'].append(('Quad, Student Area and the open space between them, Building 1',
                                     path(B1_DRAW, B1_OPEN, space, True)))
        layers['covered-areas'].append(('Lunch Shelter: covered, open on its south and west sides',
                                        rect(B1_DRAW, 52, 134, 246, 478, space)))
        cx, cy = B1_DRAW.map(SENIOR_HILL[:2], space)
        r = SENIOR_HILL[2] * B1_DRAW.unit(space)
        layers['hills'].append(('Senior Hill (draft boundary, position from the user)',
                                f'M{fmt(cx - r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 0 {fmt(cx + r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 0 {fmt(cx - r)} {fmt(cy)} Z'))
        d = DRAWINGS['site']
        layers['ramp'].append(('Ramp between 2101 Drama and the Wellness Center block, rising toward Building 1 Floor 2 '
                               '(drawing confirmed by the user; the Floor 2 connection is proposed)', ramp_band(d, space)))
        layers['ramp-marks'].append(('Uphill chevrons along the ramp', ramp_chevrons(d, space)))
        labels.append(label_rect(d, space, 'ramp', 'Ramp', 'context', 'documented', (3940, 2560, 4240, 2650), (4090, 2615),
                                 0, 1, None, 'Ramp toward Building 1 Floor 2; connection proposed', '1', level, 'g-'))
        layers['site'] += [('Parking lot edge', path(d, s, space)) for s in SITE['site']]
        add_rooms(d, SITE_ROOMS, '', 'g-site-')
    if level == 2:
        # Building 1 Floor 2, traced from its clean single-line plan and drawn
        # like Floor 1: filled footprint, solid outer walls, dashed room dividers.
        plan = PLANAR['Plan'](U12D_SEGMENTS, [r[5] for r in U12_ROOMS], U12_MIN_ROOM)
        to_map = lambda p: DRAWINGS['u12d'].map(p, space)
        note = 'Building 1 Floor 2, traced from 2026-10-04_floor-2.svg'
        layers['footprint'].append((note, plan.footprint(to_map)))
        layers['walls'].append((note, plan.lines(plan.walls, to_map)))
        layers['dividers'].append((note + ' (room dividers)', plan.lines(plan.dividers, to_map)))
        add_symbols(DRAWINGS['u12'], U12_STAIRS, '1')
        add_rooms(DRAWINGS['u12d'], U12_ROOMS, '1', 'f2-b1-')
        d = DRAWINGS['u2']
        layers['footprint'].append(('Building 2 Floor 2', path(d, U2['outline'], space, True)))
        layers['walls'].append(('Building 2 Floor 2', path(d, U2['outline'], space, True)))
        layers['dividers'] += [('Building 2 Floor 2', path(d, w, space)) for w in U2['dividers']]
        add_symbols(d, U2['symbols'], '2'); add_rooms(d, U2_ROOMS, '2', 'f2-b2-')
        d = DRAWINGS['u3']
        layers['footprint'].append(('Building 3 Floor 2', path(d, U3['outline'], space, True)))
        layers['walls'].append(('Building 3 Floor 2', path(d, U3['outline'], space, True)))
        layers['walls'] += [('Building 3 Floor 2', path(d, w, space)) for w in U3['walls']]
        layers['dividers'] += [('Building 3 Floor 2', path(d, w, space)) for w in U3['dividers']]
        add_symbols(d, U3['symbols'], '3'); add_rooms(d, U3_ROOMS, '3', 'f2-b3-')
    if level == 3:
        d = DRAWINGS['u13']
        layers['footprint'].append(('Building 1 Floor 3', path(d, U13['outline'], space, True)))
        layers['walls'].append(('Building 1 Floor 3', path(d, U13['outline'], space, True)))
        # Room boxes share walls with their neighbours and the outline: draw each
        # shared line once, and none on the outer wall, like Floor 1.
        ring = lambda pts: list(zip(pts, pts[1:] + pts[:1]))
        boxes = U13_ROOM_OUTLINES + [(262, 42, 610, 216), (461, 245, 658, 482)]
        sides = [e for r in boxes for e in ring([d.map(c, space) for c in ((r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3]))])]
        outline = ring([d.map(c, space) for c in U13['outline']])
        layers['dividers'].append(('Building 1 Floor 3 room outlines', ' '.join(PLANAR['merge_lines'](sides, minus=outline))))
        add_symbols(d, U13['symbols'], '1'); add_rooms(d, U13_ROOMS, '1', 'f3-b1-')
    for key, rid, label, r, at, note in BUILDING_LABELS[level]:
        prefix = {1: 'g-', 2: 'f2-', 3: 'f3-'}[level]
        labels.append(label_rect(DRAWINGS[key], space, rid, label, 'building', 'documented', r, at, 0, 1, label, note,
                                 label[-1], level, prefix).replace('<rect ', '<rect data-max-level="0" '))
    for lv, building, typ, key, p, note in CANDIDATES:
        if lv != level: continue
        x, y = DRAWINGS[key].map(p, space)
        cands.append(f'  <circle cx="{fmt(x)}" cy="{fmt(y)}" r="1" data-type="{typ}" data-building="{building}" '
                     f'data-status="uncertain" data-note="{esc(note)}"/>')
    return layers, labels, cands, stairs

STYLE = {
    'footprint': 'fill="#ffffff"', 'site': 'stroke="#b8c2cb" stroke-width="0.3"',
    'walls': 'stroke="#788791" stroke-width="0.5" stroke-linejoin="round"',
    'dividers': 'stroke="#788791" stroke-width="0.3" stroke-dasharray="1.2 0.8"',
    'uncertain-lines': 'stroke="#a7b1b9" stroke-width="0.3" stroke-dasharray="0.8 1"',
    'uncertain-symbols': 'stroke="#a7b1b9" stroke-width="0.3"',
    'stairs': 'fill="#d7f0ea" stroke="#0f766e" stroke-width="0.3"',
    'open-areas': 'fill="#e8f3e3"', 'covered-areas': 'fill="#f1ead8"',
    'hills': 'fill="#d3e9c8" stroke="#6b9e5a" stroke-width="0.3" stroke-dasharray="1 0.8"',
    'ramp': 'fill="#ede3fb" stroke="#7c3aed" stroke-width="0.3"', 'ramp-marks': 'stroke="#7c3aed" stroke-width="0.3"',
}
HEADER = {
    1: 'Floor 1 (ground level): Buildings 1, 2 and 3 with site features, traced from the ground-level drawing.',
    2: 'Floor 2: Building 1 (12xx), Building 2 (22xx) and Building 3 (3-2xx) upper floors. '
       'Building 1 comes from the clean plan 2026-10-04_floor-2.svg; the other two from the PDF.',
    3: 'Floor 3: Building 1 (13xx) placed over Building 1.',
}
for level in (1, 2, 3):
    layers, labels, cands, stairs = level_svg(level)
    o = ['<svg width="580" height="210" viewBox="0 0 580 210" fill="none" xmlns="http://www.w3.org/2000/svg" '
         f'data-floor="{level}" data-coverage="partial" data-frame="campus">',
         f'<!-- CLEAR 2.0 campus map, {HEADER[level]}',
         '     Source: BHSCampusMap.pdf (2023 scan), 6000 px render straightened by 1.005 degrees.',
         '     Campus frame: 1 unit = 10 px of that render; origin at render px (120, 1900). No real-world scale.',
         '     data-status="documented": drawn and legible in the source. "uncertain": needs an in-person check.',
         '     Upper floors are placed by estimated transforms; see CAMPUS_MAP.md for alignment notes.',
         '     stairs: one path per stair symbol in the PDF (never merged). route-candidates are unverified',
         '     stairs, elevators and entrances. The ramp is not drawn until its proposal is reviewed. They are',
         '     not a route network. No doors or walkways are traced. -->']
    for name in ('footprint', 'open-areas', 'covered-areas', 'hills', 'site', 'walls', 'dividers', 'uncertain-lines',
                 'uncertain-symbols', 'ramp', 'ramp-marks'):
        status = 'uncertain' if name.startswith('uncertain') else 'documented'
        o.append(f'<g id="{name}" data-status="{status}" {STYLE[name]}>')
        for note, dd in layers[name]:
            o.append(f'  <path d="{dd}" data-note="{esc(note)}"/>')
        o.append('</g>')
    o.append(f'<g id="stairs" data-status="uncertain" {STYLE["stairs"]}>')
    for sid, building, note, dd, cx, cy in stairs:
        o.append(f'  <path id="{sid}" d="{dd}" data-building="{building}" data-cx="{fmt(cx)}" data-cy="{fmt(cy)}" '
                 f'data-note="{esc(note)}"/>')
    o.append('</g>')
    o.append('<g id="labels">'); o += labels; o.append('</g>')
    o.append('<g id="route-candidates">'); o += cands; o.append('</g>')
    o.append('</svg>')
    open(os.path.join(out_dir, f'campus-floor{level}.svg'), 'w').write('\n'.join(o) + '\n')

# ---------------------------------------------------------------- review overlays (page space, on the scan)
def overlay(name, viewbox, groups, image='page_d.png'):
    vx, vy, vw, vh = viewbox
    o = [f'<svg width="{vw}" height="{vh}" viewBox="{vx} {vy} {vw} {vh}" fill="none" xmlns="http://www.w3.org/2000/svg" '
         'xmlns:xlink="http://www.w3.org/1999/xlink">',
         f'<image href="{image}" xlink:href="{image}" x="0" y="0" width="6000" height="4636" opacity="0.5"/>']
    for color, width, dash, paths in groups:
        o.append(f'<g stroke="{color}" stroke-width="{width}"' + (f' stroke-dasharray="{dash}"' if dash else '') + '>')
        o += [f'  <path d="{p}"/>' for p in paths]
        o.append('</g>')
    o.append('</svg>')
    open(os.path.join(overlay_dir, name), 'w').write('\n'.join(o) + '\n')

def page_groups(d, spec, rooms):
    solid = [path(d, w, 'page') for w in spec.get('walls', [])] + [arc_path(d, a, 'page') for a in spec.get('arcs', [])]
    if 'outline' in spec: solid.append(path(d, spec['outline'], 'page', True))
    dashed = [path(d, w, 'page') for w in spec.get('dividers', [])]
    unc = [path(d, pts, 'page') if not isinstance(pts[0], str) else '' for _, pts in []]
    for u in spec.get('uncertain', []): unc.append(uncertain_item(d, u, 'page')[1])
    unc += [SYMBOL[k](d, *b, 'page') for k, b, _ in spec.get('symbols', [])]
    boxes = [rect(d, *r[4], 'page') for r in rooms]
    return [('#e11d48', 4, None, solid), ('#e11d48', 3, '12 8', dashed), ('#2563eb', 3, '8 10', unc),
            ('#16a34a', 2, '4 6', boxes)]
overlay('overlay-b2-ground.svg', (2400, 2800, 1550, 1150), page_groups(DRAWINGS['b2'], B2, B2_ROOMS))
overlay('overlay-b3-ground.svg', (100, 2850, 2450, 1100), page_groups(DRAWINGS['b3'], B3, B3_ROOMS + SITE_ROOMS))
overlay('overlay-b2-floor2.svg', (2500, 1820, 1250, 900), page_groups(DRAWINGS['u2'], U2, U2_ROOMS))
overlay('overlay-b3-floor2.svg', (800, 2300, 1350, 480), page_groups(DRAWINGS['u3'], U3, U3_ROOMS))
overlay('overlay-b1-floor3.svg', (3700, 520, 950, 1000),
        page_groups(DRAWINGS['u13'], dict(U13, dividers=[]), U13_ROOMS))
overlay('overlay-site-north.svg', (3800, 1850, 2100, 1000),
        [('#e11d48', 4, None, [path(DRAWINGS['site'], s, 'page') for s in SITE['site']]),
         ('#16a34a', 2, '4 6', [rect(DRAWINGS['site'], *r[4], 'page') for r in SITE_ROOMS])])
json.dump({k: {'offset': v.offset, 'scale': v.scale, 'note': v.note} for k, v in DRAWINGS.items()},
          open(os.path.join(overlay_dir, 'placements.json'), 'w'), indent=1)
print('ok')
