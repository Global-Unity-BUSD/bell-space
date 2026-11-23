import { BUILDING1_NETWORK } from './data/building1.ts';
import type { RouteNetwork } from './routing';

// The campus route network: one data file per building, merged here. Only
// Building 1 has data so far, and none of it is checked on site yet, so
// student directions stay unavailable until elements are marked `checked`
// after the school walk-through (see ROUTE_REVIEW.md). Proposed routes can
// be previewed with Settings → Map review.
const parts: RouteNetwork[] = [BUILDING1_NETWORK];

export const CAMPUS_NETWORK: RouteNetwork = {
  nodes: parts.flatMap((p) => p.nodes),
  edges: parts.flatMap((p) => p.edges),
};
