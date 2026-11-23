// This adapter describes the supplied flat export, not a general SVG parser.
// All d strings, fills, mask dimensions and the viewBox come from the source.
const { sourceAnnotations } = require('./sourceAnnotations.cjs');
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
  );
}

function paths(xml) {
  return [...xml.matchAll(/<path\b[^>]*\/>/g)].map(([tag]) => attributes(tag));
}

// Subpath indices in the labeled export (NOT the unlabeled file). These are
// internal room separators and small subdivisions, not exterior/hallway walls.
// Keep the rest of the geometry at overview so rooms retain spatial context.
const roomDividers = new Set([
  95, 98, 167, 176, // east rooms above the quad
  275, 278, 283, // west rooms above the quad
  115, 119, 122, 128, 132, // lower row vertical room separators
  163, 244, 246, 263, // east and small interior room subdivisions
]);
const fineDetails = new Set([
  188, 189, 190, 191, 192, // quad's small subdivisions
  335, 340, 343, 348, // small stair/utility separators
  324, 325, 326, 362, 367, // central small partitions
]);

function prepareLabeledSvg(xml) {
  const root = attributes(xml.match(/<svg\b[^>]*>/)?.[0] || '');
  const maskXml = xml.match(/<mask\b[^>]*>[\s\S]*?<\/mask>/)?.[0];
  if (!maskXml || root.viewBox !== '0 0 201 258') {
    throw new Error('The labeled map export changed; review its LOD adapter.');
  }
  const visiblePaths = paths(xml.replace(maskXml, ''));
  const outline = visiblePaths.at(-1);
  const subpaths = outline?.d.match(/M[^M]*/g) || [];
  // The first 377 closed subpaths are the exported walls/partitions. The next
  // four are the base border; the remaining ~6875 are tiny outlined glyph
  // fragments which are mostly clipped by the supplied outside mask.
  // The export incorrectly applies the outside-background mask to the walls,
  // clipping them all away. Render the wall and border subpaths directly.
  // Splitting at existing closed M…Z boundaries preserves every coordinate.
  if (
    visiblePaths.length !== 178 || subpaths.length !== 7256 ||
    !subpaths[0].startsWith('M133.6 100.1H133.55') ||
    !subpaths[377].startsWith('M0.0999985 0.100006') ||
    !subpaths.every((part) => part.endsWith('Z'))
  ) {
    throw new Error('The labeled SVG path order changed; review its LOD adapter.');
  }

  const structure = { major: [], partitions: [], fine: [] };
  subpaths.slice(0, 377).forEach((part, index) => {
    const layer = fineDetails.has(index) ? 'fine' : roomDividers.has(index) ? 'partitions' : 'major';
    structure[layer].push(part);
  });
  const { annotations, walls } = sourceAnnotations(visiblePaths, subpaths.slice(0, 377));

  return {
    viewBox: root.viewBox,
    width: Number(root.width),
    height: Number(root.height),
    fill: root.fill,
    base: visiblePaths[0],
    // Joining source d values into one path per visual group greatly reduces
    // native SVG nodes; no coordinates or glyph contours are altered.
    structure: Object.fromEntries(Object.entries(structure).map(([key, parts]) =>
      [key, { d: parts.join(''), fill: outline.fill }])),
    border: { d: subpaths.slice(377, 381).join(''), fill: outline.fill },
    annotations,
    walls,
  };
}

module.exports = { prepareLabeledSvg };
