import type { ReferencePoint } from './positionGate.ts';

// GPS ↔ campus-map reference points measured at school with the live test
// mode ("Add reference point", then Share log). Empty until measured: the
// alignment is never guessed. Paste measured points here after a walk test
// so they load on every launch. Until then, points captured in a session
// are used only for that session.
export const MEASURED_REFERENCES: ReferencePoint[] = [];
