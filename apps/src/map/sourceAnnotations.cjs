// Metadata for the flat labeled export. Indices identify existing glyph paths;
// there are no hand-positioned label coordinates or replacement floor shapes.
const roomGroups = [
  ['1242', 1], ['1241', 5], ['1240', 9], ['1239', 13], ['1238', 17], ['1237', 21],
  ['1245', 33], ['1246', 37], ['1247', 41], ['1248', 45],
  ['1223', 58], ['1225', 62], ['1227', 66], ['1229', 70],
  ['1230', 74], ['1231', 78], ['1219', 82], ['1218', 86], ['1236', 90],
  ['1217', 94], ['1216', 98], ['1234', 102], ['1233', 106],
  ['1215', 110], ['1214', 114], ['1213', 118],
  ['1202', 122], ['1203', 126], ['1204', 130], ['1205', 134],
  ['1206', 138], ['1207', 142], ['1208', 146], ['1209', 150],
  ['1210', 154], ['1211', 158],
];

// End rooms and useful identifiers spread through the floor. Lower-priority
// labels can be suppressed when space is tight, never shifted to another wing.
const overviewIds = ['1202', '1208', '1211', '1213', '1216', '1217', '1218',
  '1223', '1227', '1229', '1230', '1233', '1234', '1236', '1242', '1245', '1248'];

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function extrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  return [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)];
}

// Exact bounds, including cubic extrema, for the absolute M/L/H/V/C/Z commands
// in this export. Fail on other commands rather than guessing label positions.
function pathBounds(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  let index = 0;
  let command;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (px, py) => {
    bounds.minX = Math.min(bounds.minX, px);
    bounds.maxX = Math.max(bounds.maxX, px);
    bounds.minY = Math.min(bounds.minY, py);
    bounds.maxY = Math.max(bounds.maxY, py);
  };
  const number = () => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error('Invalid coordinate in labeled SVG.');
    return value;
  };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    switch (command) {
      case 'M':
        x = number(); y = number(); startX = x; startY = y; add(x, y);
        command = 'L';
        break;
      case 'L': x = number(); y = number(); add(x, y); break;
      case 'H': x = number(); add(x, y); break;
      case 'V': y = number(); add(x, y); break;
      case 'C': {
        const x1 = number(); const y1 = number();
        const x2 = number(); const y2 = number();
        const endX = number(); const endY = number();
        for (const t of [...extrema(x, x1, x2, endX), ...extrema(y, y1, y2, endY)]) {
          if (t > 0 && t < 1) add(cubic(x, x1, x2, endX, t), cubic(y, y1, y2, endY, t));
        }
        x = endX; y = endY; add(x, y);
        break;
      }
      case 'Z': x = startX; y = startY; command = undefined; break;
      default: throw new Error(`Unsupported labeled SVG command: ${command}`);
    }
  }
  if (!Number.isFinite(bounds.minX)) throw new Error('Empty labeled SVG path.');
  return bounds;
}

function wallSegments(parts) {
  return parts.flatMap((part) => {
    const b = pathBounds(part);
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    if (width <= 0.11 && height > 0.2) {
      const x = (b.minX + b.maxX) / 2;
      return [{ x1: x, y1: b.minY, x2: x, y2: b.maxY }];
    }
    if (height <= 0.11 && width > 0.2) {
      const y = (b.minY + b.maxY) / 2;
      return [{ x1: b.minX, y1: y, x2: b.maxX, y2: y }];
    }
    return [];
  });
}

function containingWalls(anchor, walls) {
  // Nearest source wall spans crossing the anchor axes constrain local offsets.
  // Door gaps may make this box conservative; all wall spans are also checked
  // against each candidate's full glyph rectangle by the placement code.
  const box = { minX: 0, minY: 0, maxX: 201, maxY: 258 };
  for (const wall of walls) {
    if (wall.x1 === wall.x2 && wall.y1 <= anchor.y && wall.y2 >= anchor.y) {
      if (wall.x1 < anchor.x) box.minX = Math.max(box.minX, wall.x1);
      if (wall.x1 > anchor.x) box.maxX = Math.min(box.maxX, wall.x1);
    }
    if (wall.y1 === wall.y2 && wall.x1 <= anchor.x && wall.x2 >= anchor.x) {
      if (wall.y1 < anchor.y) box.minY = Math.max(box.minY, wall.y1);
      if (wall.y1 > anchor.y) box.maxY = Math.min(box.maxY, wall.y1);
    }
  }
  return box;
}

function sourceAnnotations(visiblePaths, parts) {
  const walls = wallSegments(parts);
  const descriptors = roomGroups.map(([id, first]) => ({
    id, first, last: first + 3, kind: 'room',
    minLevel: overviewIds.includes(id) ? 0 : 1,
    priority: overviewIds.includes(id) ? 100 - overviewIds.indexOf(id) : 40,
  }));
  descriptors.push(
    { id: 'STEAM Lab', first: 25, last: 32, kind: 'area', minLevel: 0, priority: 200 },
    { id: 'Small Quad', first: 49, last: 57, kind: 'area', minLevel: 0, priority: 190 },
    { id: 'Teacher Workroom', first: 162, last: 176, kind: 'area', minLevel: 2, priority: 30 },
  );
  const annotations = descriptors.map(({ first, last, ...descriptor }) => {
    const glyphs = visiblePaths.slice(first, last + 1);
    if (glyphs.some((path) => path.fill !== 'black')) throw new Error('Unexpected SVG label fill.');
    const d = glyphs.map((path) => path.d).join('');
    const bounds = pathBounds(d);
    const anchor = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const lineGlyphs = descriptor.id === 'Small Quad' ? glyphs.slice(0, 5)
      : descriptor.id === 'Teacher Workroom' ? glyphs.slice(0, 7) : glyphs;
    const lineBounds = pathBounds(lineGlyphs.map((path) => path.d).join(''));
    const glyphHeight = descriptor.kind === 'room'
      ? Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
      : lineBounds.maxY - lineBounds.minY;
    return { ...descriptor, d, bounds, anchor, glyphHeight, roomBounds: containingWalls(anchor, walls) };
  });
  return { annotations, walls };
}

module.exports = { pathBounds, sourceAnnotations };
