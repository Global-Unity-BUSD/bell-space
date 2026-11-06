# Splits a traced single-line floor plan into the layers Floor 1 uses: a filled
# footprint, solid outer walls and dashed room dividers. Loaded by campus.py
# with exec (like b1data.py), standard library only.
#
# The plan's lines are turned into a planar graph (split where lines cross or
# meet), its faces are found, and each line is classified by the faces on its
# two sides:
#   * outer wall: one side is outside the building;
#   * room divider: both sides are inside, and the line borders a labeled room;
#   * dropped: a dangling stub, or a line inside unlabeled spaces such as
#     closets, stair boxes or between two corridor pieces.
# The footprint is the outline of every face that is not outside. Nothing is
# moved: kept lines are the source lines (collinear pieces merged).
import math, re

EPS = 0.06  # points closer than this (in plan units) are the same vertex

def parse_plan(d):
    """Segments of an absolute M/L/H/V/C/Z path: ('L', a, b) or ('C', a, c1, c2, b)."""
    tokens = re.findall(r'[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?', d)
    out, i, cmd = [], 0, None
    x = y = 0.0
    start = (0.0, 0.0)
    def num():
        nonlocal i
        i += 1
        return round(float(tokens[i - 1]), 3)
    while i < len(tokens):
        if re.fullmatch(r'[A-Za-z]', tokens[i]):
            cmd = tokens[i]; i += 1
            if cmd == 'Z':
                if (x, y) != start: out.append(('L', (x, y), start))
                x, y = start; cmd = None
            elif cmd == 'M':
                x, y = num(), num(); start = (x, y); cmd = 'L'
            continue
        if cmd == 'L': p = (num(), num())
        elif cmd == 'H': p = (num(), y)
        elif cmd == 'V': p = (x, num())
        elif cmd == 'C':
            c1, c2, p = (num(), num()), (num(), num()), (num(), num())
            out.append(('C', (x, y), c1, c2, p)); x, y = p
            continue
        else: raise SystemExit('Unsupported plan path command: %s' % cmd)
        if p != (x, y): out.append(('L', (x, y), p))
        x, y = p
    return out

def _bezier(a, c1, c2, b, t):
    u = 1 - t
    return (u**3 * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * b[0],
            u**3 * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * b[1])

def _area(poly):
    return sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly))) / 2

def _inside(pt, poly):
    x, y, hit = pt[0], pt[1], False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): hit = not hit
    return hit

class Plan:
    def __init__(self, segments, labels, min_room_area):
        self.verts = []
        self._build(segments)
        self._prune_stubs()
        self._faces()
        self._classify(labels, min_room_area)

    def _vid(self, p):
        for i, q in enumerate(self.verts):
            if abs(p[0] - q[0]) < EPS and abs(p[1] - q[1]) < EPS: return i
        self.verts.append(p)
        return len(self.verts) - 1

    def _build(self, segments):
        lines = [s for s in segments if s[0] == 'L']
        cuts = [[0.0, 1.0] for _ in lines]
        for i, (_, a, b) in enumerate(lines):
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy)
            for other in segments:
                pts = [other[1], other[-1]]
                if other[0] == 'L':
                    # Proper crossings with other lines.
                    _, c, e = other
                    ex, ey = e[0] - c[0], e[1] - c[1]
                    den = dx * ey - dy * ex
                    if abs(den) > 1e-9:
                        t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den
                        u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den
                        if -1e-9 < t < 1 + 1e-9 and -EPS / max(1e-9, math.hypot(ex, ey)) < u < 1 + EPS / max(1e-9, math.hypot(ex, ey)):
                            cuts[i].append(min(1.0, max(0.0, t)))
                # Endpoints of any segment lying on this line (T-junctions, overlaps).
                for p in pts:
                    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length)
                    if 0 < t < 1:
                        q = (a[0] + t * dx, a[1] + t * dy)
                        if math.hypot(p[0] - q[0], p[1] - q[1]) < EPS: cuts[i].append(t)
        self.edges = {}  # (u, v) with u < v -> ('L',) or ('C', c1, c2) oriented from u to v
        for (_, a, b), ts in zip(lines, cuts):
            ts = sorted(set(round(t, 6) for t in ts))
            pts = [(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])) for t in ts]
            for p, q in zip(pts, pts[1:]):
                u, v = self._vid(p), self._vid(q)
                if u != v: self.edges.setdefault((min(u, v), max(u, v)), ('L',))
        for s in segments:
            if s[0] != 'C': continue
            _, a, c1, c2, b = s
            u, v = self._vid(a), self._vid(b)
            self.edges[(u, v) if u < v else (v, u)] = ('C', c1, c2) if u < v else ('C', c2, c1)

    def _prune_stubs(self):
        self.stubs = []
        while True:
            degree = {}
            for u, v in self.edges:
                degree[u] = degree.get(u, 0) + 1; degree[v] = degree.get(v, 0) + 1
            loose = [e for e in self.edges if degree[e[0]] == 1 or degree[e[1]] == 1]
            if not loose: return
            for e in loose: self.stubs.append(e); del self.edges[e]

    def half(self, u, v):
        """Points along the edge from u to v (curves sampled)."""
        e = self.edges[(min(u, v), max(u, v))]
        if e[0] == 'L': return [self.verts[u], self.verts[v]]
        a, b = self.verts[min(u, v)], self.verts[max(u, v)]
        pts = [_bezier(a, e[1], e[2], b, k / 12) for k in range(13)]
        return pts if u < v else pts[::-1]

    def _faces(self):
        out = {}
        for u, v in self.edges:
            for p, q in ((u, v), (v, u)):
                pts = self.half(p, q)
                ang = math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])
                out.setdefault(p, []).append((ang, q))
        for p in out: out[p].sort()
        self.face_of, self.faces = {}, []
        for u, v in self.edges:
            for start in ((u, v), (v, u)):
                if start in self.face_of: continue
                cycle, h = [], start
                while h not in self.face_of:
                    self.face_of[h] = len(self.faces); cycle.append(h)
                    p, q = h
                    ring = out[q]
                    k = next(i for i, (_, w) in enumerate(ring) if w == p)
                    h = (q, ring[k - 1][1])  # next edge clockwise from the way back
                poly = [pt for p, q in cycle for pt in self.half(p, q)[:-1]]
                self.faces.append({'cycle': cycle, 'poly': poly, 'area': _area(poly)})
        # With this turn rule every room has one sign and each component's outer
        # boundary the other; the largest face is the main outer boundary.
        sign = -math.copysign(1, max(self.faces, key=lambda f: abs(f['area']))['area'])
        for f in self.faces: f['bounded'] = f['area'] * sign > 0
        rooms = [f for f in self.faces if f['bounded']]
        for f in self.faces:
            if f['bounded']: f['outside'] = False; continue
            # An outer boundary drawn inside a room (a free-standing box) is
            # part of that room, not outside. Rooms of the same part share its
            # vertices, so only rooms of other parts are tested.
            own = {p for p, _ in f['cycle']}
            hosts = [r for r in rooms if not own & {p for p, _ in r['cycle']} and _inside(self.verts[f['cycle'][0][0]], r['poly'])]
            f['outside'] = not hosts
            if hosts: f['host'] = min(hosts, key=lambda r: abs(r['area']))

    def _classify(self, labels, min_room_area):
        rooms = [f for f in self.faces if f['bounded']]
        for f in rooms: f['labeled'] = False
        for p in labels:
            hits = [f for f in rooms if _inside(p, f['poly'])]
            if hits: min(hits, key=lambda f: abs(f['area']))['labeled'] = True
        def room(f): return f.get('host', f)
        def kept(f): return f['labeled'] or abs(f['area']) >= min_room_area
        self.walls, self.dividers = [], []
        for u, v in self.edges:
            a, b = self.faces[self.face_of[(u, v)]], self.faces[self.face_of[(v, u)]]
            if a['outside'] or b['outside']: self.walls.append((u, v))
            else:
                a, b = room(a), room(b)
                if a is not b and kept(a) and kept(b) and (a['labeled'] or b['labeled']): self.dividers.append((u, v))

    def footprint(self, fn):
        """Closed outline of each building part, mapped by fn, curves kept."""
        parts = []
        for f in self.faces:
            if not f['outside']: continue
            out = []
            for p, q in f['cycle']:
                e = self.edges[(min(p, q), max(p, q))]
                if not out: out.append('M' + _pt(fn(self.verts[p])))
                if e[0] == 'L': out.append('L' + _pt(fn(self.verts[q])))
                else:
                    c1, c2 = (e[1], e[2]) if p < q else (e[2], e[1])
                    out.append('C' + ' '.join(_pt(fn(c)) for c in (c1, c2, self.verts[q])))
            parts.append(' '.join(out) + ' Z')
        return ' '.join(parts)

    def lines(self, edges, fn):
        """Path data for edges, mapped by fn: straight runs merged, curves kept."""
        straight = [(fn(self.verts[u]), fn(self.verts[v])) for u, v in edges if self.edges[(u, v)][0] == 'L']
        curves = []
        for u, v in edges:
            e = self.edges[(u, v)]
            if e[0] == 'C':
                curves.append('M' + _pt(fn(self.verts[u])) + ' C' + ' '.join(_pt(fn(c)) for c in (e[1], e[2], self.verts[v])))
        return ' '.join(merge_lines(straight) + curves)

def _pt(p): return '%g %g' % (round(p[0], 3), round(p[1], 3))

def merge_lines(segments, minus=()):
    """Path pieces for line segments with collinear overlaps merged into one run.

    `minus` segments are removed from the result (e.g. dividers lying on a wall).
    """
    groups = {}
    def key(a, b):
        ang = math.atan2(b[1] - a[1], b[0] - a[0]) % math.pi
        if ang > math.pi - 0.01: ang -= math.pi
        n = (-math.sin(ang), math.cos(ang))
        return (round(ang, 2), round(a[0] * n[0] + a[1] * n[1], 1)), (math.cos(ang), math.sin(ang))
    def add(store, a, b):
        (k, d) = key(a, b)
        s, t = sorted((a[0] * d[0] + a[1] * d[1], b[0] * d[0] + b[1] * d[1]))
        store.setdefault(k, [d, a, []])[2].append((s, t))
    for a, b in segments: add(groups, a, b)
    cut = {}
    for a, b in minus: add(cut, a, b)
    out = []
    for k, (d, a, spans) in groups.items():
        spans.sort()
        runs = []
        for s, t in spans:
            if runs and s <= runs[-1][1] + 0.05: runs[-1][1] = max(runs[-1][1], t)
            else: runs.append([s, t])
        for s0, t0 in cut.get(k, [None, None, []])[2]:
            nxt = []
            for s, t in runs:
                if t0 <= s + 0.05 or s0 >= t - 0.05: nxt.append([s, t]); continue
                if s0 > s + 0.05: nxt.append([s, s0])
                if t0 < t - 0.05: nxt.append([t0, t])
            runs = nxt
        off = a[0] * d[0] + a[1] * d[1]
        base = (a[0] - off * d[0], a[1] - off * d[1])
        for s, t in runs:
            if t - s < 0.05: continue
            p, q = (base[0] + s * d[0], base[1] + s * d[1]), (base[0] + t * d[0], base[1] + t * d[1])
            out.append('M' + _pt(p) + ' L' + _pt(q))
    return out
