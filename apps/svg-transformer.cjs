const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const upstream = require('@expo/metro-config/babel-transformer');
const { prepareLabeledSvg } = require('./src/map/prepareLabeledSvg.cjs');
const { prepareFloorPlanSvg } = require('./src/map/prepareFloorPlanSvg.cjs');

// Each supported map file has its own adapter. Any other SVG is rejected so a
// stray asset can't silently become a map.
const adapters = {
  '2026-10-04_floor2-labeled.svg': prepareLabeledSvg,
  '2026-10-21_campus-floor1.svg': prepareFloorPlanSvg,
  '2026-10-21_campus-floor2.svg': prepareFloorPlanSvg,
  '2026-10-21_campus-floor3.svg': prepareFloorPlanSvg,
};

// Metro otherwise reuses the previous transformed SVG when only the adapter
// changes (the SVG file itself is unchanged). That produces stale exports such
// as `map.layers` instead of `map.labels`, crashing at `map.labels.areas`.
module.exports.getCacheKey = (options) => createHash('sha256')
  .update(upstream.getCacheKey(options))
  .update(readFileSync(__filename))
  .update(readFileSync(require.resolve('./src/map/prepareLabeledSvg.cjs')))
  .update(readFileSync(require.resolve('./src/map/sourceAnnotations.cjs')))
  .update(readFileSync(require.resolve('./src/map/prepareFloorPlanSvg.cjs')))
  .digest('hex');

module.exports.transform = (args) => {
  if (!args.filename.endsWith('.svg')) return upstream.transform(args);
  // Geometry is extracted at bundle time, not parsed/rebuilt on every zoom
  // frame or copied into another map.
  const name = Object.keys(adapters).find((file) => args.filename.endsWith(file));
  if (!name) throw new Error(`Unsupported map SVG: ${args.filename}`);
  return upstream.transform({
    ...args,
    src: `module.exports = ${JSON.stringify(adapters[name](args.src))};`,
  });
};
