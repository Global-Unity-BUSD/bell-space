// Generates the route-review checklist (ROUTE_REVIEW.md) and overlays of the
// proposed Building 1 network and the room entrances on the campus PDF,
// straight from the route data.
// Usage: node tools/route-review/generate.cjs <path to page_d.png> <out dir for the overlay SVG>
// (Node 22.18+ for TypeScript type stripping.) Render each SVG with
// `qlmanage -t -s 2000 -o <dir> <svg>` and save them as reference/proposals/building1-network.jpg
// and reference/review/entrances.jpg.
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { BUILDING1_NETWORK } = require('../../apps/src/navigation/data/building1.ts');
const WALK = require('../../apps/src/navigation/data/building1Walkable.ts');

const [pageImage, outDir] = process.argv.slice(2);
const root = resolve(__dirname, '../..');
const { nodes, edges } = BUILDING1_NETWORK;
const byId = new Map(nodes.map((n) => [n.id, n]));
const page = (n) => ({ x: n.x * 10 + 120, y: n.y * 10 + 1900 });
const short = (id) => id.replace(/^b1-/, '');
const placeName = (id) => (id ? id.replace(/^g-b1-room-/, 'Room ').replace(/^g-b1-/, '').replace(/-/g, ' ') : '');

// ---- checklist ----
const doors = nodes.filter((n) => n.kind === 'door');
const walks = edges.filter((e) => e.kind === 'walk' && !e.from.includes('door') && !e.to.includes('door'));
const stairs = edges.filter((e) => e.kind !== 'walk');
const rows = (list, f) => list.map(f).join('\n');
const md = `# Route Review: Building 1

Generated from \`src/navigation/data/building1.ts\` by \`tools/route-review/generate.cjs\`.
Overlay: \`reference/proposals/building1-network.jpg\` (IDs match this list).

At school, confirm or correct each item, then set its \`status\` to \`'checked'\` in the data
file (move a door or point by editing its coordinates). Student directions use only
checked items; a route appears only when every door, walkway and stair on it is checked.

## Open areas: routed now

These use the walkable-space data in \`src/navigation/data/building1Walkable.ts\`
(source: ${WALK.B1_GROUND_SPACE.source}). Routes stay inside it, keep clear of walls,
and go around stairs.

| Destination | Status | Note |
| --- | --- | --- |
${rows(WALK.B1_AREA_DESTINATIONS, (d) => `| ${d.name} | ${d.status} | ${d.note} |`)}

Stairs treated as obstacles (not flat walking space): ${WALK.B1_GROUND_OBSTACLES.map((o) => `\`${o.id}\``).join(', ')}.

Please confirm at school:
* the open space has no fences, planters, steps or locked gates that block the drawn routes;
* the Lunch Shelter is open on its south and west sides (and whether the north side is open);
* where Senior Hill's edge is (the current circle is a draft).

## Ramp (proposal, not used in routes)

${WALK.B1_RAMP_PROPOSAL.note}. Review image: \`reference/review/ramp.jpg\`.
Confirm the Floor 2 landing, that it is step-free, and that students may use it.

## Room entrances: routed now (${WALK.B1_ENTRANCES.length})

The side of each room's entrance is confirmed; **where along that wall the door is, is not
measured** (every door point is \`approximate\`). Routes go to the approach point just outside
the door (in walkable space), then to the door. Overlay: \`reference/review/entrances.jpg\`.
At school, note for each room whether the real door is left of, right of or at the drawn point,
and roughly how far (in steps); then move \`door\` in \`building1Walkable.ts\` and set
\`positionStatus: 'checked'\`.

| Place | Side | Faces | Door point | Note |
| --- | --- | --- | --- | --- |
${rows(WALK.B1_ENTRANCES, (e) => `| ${e.name} | ${e.sideStatus} | ${e.facing} | ${e.positionStatus} (${e.door.x.toFixed(1)}, ${e.door.y.toFixed(1)}) | ${e.note} |`)}

Still not routed (no confirmed entrance): Cafeteria, Kitchen, Wellness Center, Admin Offices,
the "1-159" room (label partly illegible), restrooms (T) and the other unlabeled rooms.

## Door graph for enclosed rooms (${doors.length}, review mode only)

Proposed doors sit at the centre of the wall facing the walkway. Confirm **which wall the
door is on and roughly where**, and whether students may use it.

| ID | Place | Proposed position | Status |
| --- | --- | --- | --- |
${rows(doors, (n) => `| \`${short(n.id)}\` | ${placeName(n.placeId) || 'restroom (T)'} | ${n.note ?? ''} | ${n.status} |`)}

## Walkway links (${walks.length})

Confirm each link is a walkable path students can use (no fence, planter, locked gate or steps
unless noted), and that it runs where drawn.

| ID | Walkway | Note | Status |
| --- | --- | --- | --- |
${rows(walks, (e) => `| \`${short(e.from)}\` → \`${short(e.to)}\` | ${e.name ?? ''} | ${e.note ?? ''} | ${e.status} |`)}

## Stairs and floor links (${stairs.length})

The stair symbols line up across the Floor 1, 2 and 3 plans. Confirm each stair exists, which
floors it reaches, and where its landing is on each floor.

| ID | Kind | Note | Status |
| --- | --- | --- | --- |
${rows(stairs, (e) => `| \`${short(e.from)}\` → \`${short(e.to)}\` | ${e.kind} | ${e.note ?? ''} | ${e.status} |`)}

## Not in the network yet

* **Elevator** (\`elevator-1\`, room labeled ELEV. M.): is it an elevator, where is its entrance,
  and which floors does it serve?
* **Wellness Center, Kitchen, Cafeteria, Admin Offices:** where are their doors?
* **Ramp** (see \`reference/proposals/ramp-proposal.jpg\`): approach, turn, end point, which
  level it reaches, and whether it is step-free and open to students.
* **Building 1 Floor 2 and Floor 3 hallways and doors:** not recorded yet, so upstairs rooms
  have no routes.
* **Building entrances** from Third Street and Harvard Road.
`;
writeFileSync(resolve(root, 'ROUTE_REVIEW.md'), md);

// ---- overlay ----
const color = { checked: '#1769ff', proposed: '#ea580c', unknown: '#b91c1c' };
const svg = [`<svg width="1920" height="1100" viewBox="3880 2790 1920 1100" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" font-family="Helvetica, Arial, sans-serif">`,
  `<image href="${pageImage}" xlink:href="${pageImage}" x="0" y="0" width="6000" height="4636" opacity="0.5"/>`];
for (const e of edges) {
  const a = byId.get(e.from); const b = byId.get(e.to);
  if (a.level !== 1 || b.level !== 1) continue;
  const p = page(a); const q = page(b);
  svg.push(`<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${color[e.status]}" stroke-width="6" stroke-dasharray="14 8"/>`);
}
for (const n of nodes.filter((x) => x.level === 1)) {
  const p = page(n);
  if (n.kind === 'door') {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="11" fill="#ffffff" stroke="${color[n.status]}" stroke-width="5"/>`);
    svg.push(`<text x="${p.x}" y="${p.y - 18}" font-size="20" font-weight="700" text-anchor="middle" fill="#1e3a8a">${short(n.id).replace('door-', '')}</text>`);
  } else if (n.kind === 'stair' || n.kind === 'elevator') {
    svg.push(`<rect x="${p.x - 12}" y="${p.y - 12}" width="24" height="24" rx="4" fill="#0f766e" stroke="#ffffff" stroke-width="3"/>`);
    svg.push(`<text x="${p.x + 18}" y="${p.y + 7}" font-size="18" font-weight="700" fill="#0f766e">${short(n.id)}</text>`);
  } else {
    svg.push(`<circle cx="${p.x}" cy="${p.y}" r="6" fill="${color[n.status]}"/>`);
    svg.push(`<text x="${p.x + 8}" y="${p.y + 22}" font-size="14" fill="#374151">${short(n.id)}</text>`);
  }
}
svg.push('<rect x="3895" y="3800" width="1150" height="80" rx="10" fill="#ffffff" opacity="0.95"/>');
svg.push('<text x="3910" y="3832" font-size="24" font-weight="700" fill="#111827">Building 1 Floor 1 route proposal: confirm at school</text>');
svg.push('<text x="3910" y="3864" font-size="18" fill="#374151">Orange dashed: proposed walkway. Circles: proposed doors (red = unknown). Teal: stairs. IDs match ROUTE_REVIEW.md.</text>');
svg.push('</svg>');
if (outDir) writeFileSync(resolve(outDir, 'building1-network.svg'), svg.join('\n'));

// ---- entrances overlay ----
const ent = [`<svg width="2080" height="1400" viewBox="4560 2960 1040 700" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" font-family="Helvetica, Arial, sans-serif">`,
  `<image href="${pageImage}" xlink:href="${pageImage}" x="0" y="0" width="6000" height="4636" opacity="0.55"/>`];
for (const e of WALK.B1_ENTRANCES) {
  const d = page(e.door); const a = page(e.approach);
  const label = e.name.replace(/^Room /, '');
  // The label goes on the approach side, away from the room.
  const lx = a.x + (a.x - d.x) * 0.9; const ly = a.y + (a.y - d.y) * 0.9 + 4;
  ent.push(`<line x1="${d.x}" y1="${d.y}" x2="${a.x}" y2="${a.y}" stroke="#1769ff" stroke-width="2.5"/>`);
  ent.push(`<circle cx="${a.x}" cy="${a.y}" r="3.5" fill="#1769ff"/>`);
  ent.push(`<circle cx="${d.x}" cy="${d.y}" r="6" fill="#ffffff" stroke="#d97706" stroke-width="3" stroke-dasharray="4 2.5"/>`);
  ent.push(`<text x="${lx}" y="${ly}" font-size="11" font-weight="700" text-anchor="middle" fill="#1e3a8a">≈ ${label}</text>`);
}
ent.push('<rect x="4570" y="3600" width="760" height="52" rx="6" fill="#ffffff" opacity="0.95"/>');
ent.push('<text x="4580" y="3620" font-size="15" font-weight="700" fill="#111827">Building 1 entrances: side confirmed, door position approximate (≈)</text>');
ent.push('<text x="4580" y="3641" font-size="12" fill="#374151">Orange dashed circle: approximate door point. Blue dot: approach point routes go to first.</text>');
ent.push('</svg>');
if (outDir) writeFileSync(resolve(outDir, 'entrances.svg'), ent.join('\n'));
console.log(`entrances ${WALK.B1_ENTRANCES.length}, doors ${doors.length}, walkway links ${walks.length}, stair links ${stairs.length}`);
