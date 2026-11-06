// Adapter for the hand-traced, structured campus floor plans
// (2026-10-21_campus-floor{1,2,3}.svg). Unlike the flat Floor 2 export, these
// files name their layers and rooms:
// <g id="footprint|site|walls|dividers|uncertain-lines|uncertain-symbols"> hold
// paths, <g id="labels"> holds one <rect> per label (data-label, data-kind,
// data-status, data-building, label position/rotation, optional title/note),
// and <g id="route-candidates"> holds unverified stairs/elevators/entrances.
// Coordinates are copied, never adjusted.
const LAYERS = ['footprint', 'site', 'walls', 'dividers', 'uncertain-lines', 'uncertain-symbols'];
// Artwork layers that only some levels have.
const OPTIONAL = ['site', 'open-areas', 'covered-areas', 'hills', 'ramp', 'ramp-marks'];
const KINDS = ['room', 'area', 'context', 'building'];
// Labels are SVG text at a reference size; the annotation layer rescales them
// to bounded screen sizes. Widths are deliberately generous for collisions.
const FONT_SIZE = 10;
const CAP_HEIGHT = 0.72 * FONT_SIZE;
const CHAR_WIDTH = 0.58 * FONT_SIZE;
const LINE_HEIGHT = 1.2 * FONT_SIZE;

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
  );
}

function group(xml, id, optional = false) {
  const match = xml.match(new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`));
  if (!match && !optional) throw new Error(`Floor plan SVG is missing the "${id}" layer.`);
  return match ? match[1] : '';
}

// Axis-aligned straight segments of M/L/H/V/Z paths, for label collision
// checks. Curves and arcs are skipped; they are not used as label walls.
function segments(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
  const result = [];
  let i = 0; let command; let x = 0; let y = 0; let startX = 0; let startY = 0;
  const number = () => Number(tokens[i++]);
  const line = (nx, ny) => {
    if ((nx === x || ny === y) && (nx !== x || ny !== y)) {
      result.push({ x1: Math.min(x, nx), y1: Math.min(y, ny), x2: Math.max(x, nx), y2: Math.max(y, ny) });
    }
    x = nx; y = ny;
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    switch (command) {
      case 'M': x = number(); y = number(); startX = x; startY = y; command = 'L'; break;
      case 'L': line(number(), number()); break;
      case 'H': line(number(), y); break;
      case 'V': line(x, number()); break;
      case 'Q': i += 2; x = number(); y = number(); break;
      case 'C': i += 4; x = number(); y = number(); break;
      case 'A': i += 5; x = number(); y = number(); break;
      case 'Z': line(startX, startY); command = undefined; break;
      default: throw new Error(`Unsupported floor plan path command: ${command}`);
    }
  }
  return result;
}

function label(attrs) {
  const text = attrs['data-label'];
  const kind = attrs['data-kind'];
  const status = attrs['data-status'];
  if (!text || !KINDS.includes(kind) || !['documented', 'uncertain'].includes(status)) {
    throw new Error(`Invalid floor plan label: ${attrs.id}`);
  }
  const room = { minX: Number(attrs.x), minY: Number(attrs.y),
    maxX: Number(attrs.x) + Number(attrs.width), maxY: Number(attrs.y) + Number(attrs.height) };
  const anchor = { x: Number(attrs['data-label-x']), y: Number(attrs['data-label-y']) };
  const rotate = Number(attrs['data-rotate'] || 0);
  // data-lines="2" breaks the label at its first space, as the source prints it.
  const lines = attrs['data-lines'] === '2' && text.includes(' ')
    ? [text.slice(0, text.indexOf(' ')), text.slice(text.indexOf(' ') + 1)] : [text];
  const length = Math.max(...lines.map((line) => line.length)) * CHAR_WIDTH;
  const depth = CAP_HEIGHT + (lines.length - 1) * LINE_HEIGHT;
  const halfW = (rotate ? depth : length) / 2;
  const halfH = (rotate ? length : depth) / 2;
  const maxLevel = attrs['data-max-level'] !== undefined ? Number(attrs['data-max-level'])
    : kind === 'building' ? 0 : undefined;
  return {
    id: attrs.id, kind, status, text, lines, lineHeight: LINE_HEIGHT, rotate, fontSize: FONT_SIZE,
    building: attrs['data-building'] || '',
    title: attrs['data-title'] || '',
    note: attrs['data-note'] || '',
    anchor,
    bounds: { minX: anchor.x - halfW, minY: anchor.y - halfH, maxX: anchor.x + halfW, maxY: anchor.y + halfH },
    glyphHeight: CAP_HEIGHT,
    roomBounds: room,
    screenSize: kind === 'room' ? undefined : kind === 'building' ? 10.5 : kind === 'context' ? 11 : 12,
    priority: kind === 'building' ? 300 : status === 'uncertain' ? 20 : kind === 'area' ? 150 : kind === 'room' ? 60 : 10,
    minLevel: kind === 'building' ? 0 : status === 'uncertain' ? 2 : kind === 'room' ? 1 : 0,
    ...(maxLevel !== undefined ? { maxLevel } : {}),
  };
}

function prepareFloorPlanSvg(xml) {
  const root = attributes(xml.match(/<svg\b[^>]*>/)?.[0] || '');
  if (!root.viewBox?.startsWith('0 0 ') || !root['data-floor']) {
    throw new Error('Floor plan SVG needs a 0-origin viewBox and data-floor.');
  }
  const layers = Object.fromEntries([...new Set([...LAYERS, ...OPTIONAL])].map((id) => {
    const paths = [...group(xml, id, OPTIONAL.includes(id)).matchAll(/<path\b[^>]*\/>/g)].map(([tag]) => attributes(tag).d);
    return [id, paths.join(' ')];
  }));
  const annotations = [...group(xml, 'labels').matchAll(/<rect\b[^>]*\/>/g)]
    .map(([tag]) => label(attributes(tag)));
  // One path per stair symbol in the source; never merged.
  const stairs = [...group(xml, 'stairs', true).matchAll(/<path\b[^>]*\/>/g)]
    .map(([tag]) => attributes(tag))
    .map((a) => ({ id: a.id, building: a['data-building'] || '', x: Number(a['data-cx']), y: Number(a['data-cy']),
      note: a['data-note'] || '', d: a.d }));
  layers.stairs = stairs.map((s) => s.d).join(' ');
  const routeCandidates = [...group(xml, 'route-candidates', true).matchAll(/<circle\b[^>]*\/>/g)]
    .map(([tag]) => attributes(tag))
    .map((a) => ({ type: a['data-type'], building: a['data-building'], x: Number(a.cx), y: Number(a.cy),
      status: a['data-status'], note: a['data-note'] || '' }));
  return {
    floor: Number(root['data-floor']),
    frame: root['data-frame'] || '',
    coverage: root['data-coverage'] || 'full',
    viewBox: root.viewBox,
    width: Number(root.width),
    height: Number(root.height),
    layers,
    annotations,
    walls: [...segments(layers.walls), ...segments(layers.dividers)],
    stairs: stairs.map(({ d, ...rest }) => rest),
    routeCandidates,
  };
}

module.exports = { prepareFloorPlanSvg, segments };
