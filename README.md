# Bell Space

Student app for Burbank High School (Expo SDK 58 / React Native 0.88). See
`PROJECT.md` for scope, `TODO.md` for current work and `AGENTS.md` for rules.

## Run on an iPhone (Expo Go)

1. Install **Expo Go** from the App Store.
2. From this folder: `npm install` (first time only), then
   `npx expo start --clear`.
   Use `--clear` after any change to `svg-transformer.cjs` or the map adapters.
3. Scan the QR code with the iPhone Camera app. The phone and computer must
   be on the same Wi-Fi. If the network blocks that, use `npx expo start --tunnel`.

## Checks

```bash
npm test
npx expo lint
npx tsc --noEmit
```

Chat and Updates need a Supabase project: see `PILOT_SETUP.md`.

## Layout

* `App.js`: app shell (header, tabs).
* `src/screens/`: Navigation, Chat, Updates, Q&A and Settings.
* `src/content/qa.ts`: Q&A questions and answers (sample content until the school approves them).
* `assets/photos/`: provided event photos (see its README for permissions).
* `src/backend/`: Supabase client, sign-in, chat/update rules and API calls.
* `supabase/migrations/`: database schema and access rules; `tools/pilot/setup-accounts.mjs`: test accounts.
* `src/ui/`: tab bar, icons, theme, shared controls.
* `src/map/`: map rendering, gestures, labels, floor registry (`floors.tsx`).
* `src/navigation/`: route finder, Building 1 route data, route drawing.
* `src/positioning/`: GPS→map fit and accuracy gate for the sensor experiment.
* `ROUTE_REVIEW.md`, `reference/proposals/`: route and ramp proposals to confirm at school.
* `2026-10-21_campus-floor{1,2,3}.svg`: traced campus levels (uncertain items marked).
* `2026-10-04_floor2-labeled.svg`: archived Building 1 Floor 2 export (no longer imported).
* `reference/overlays/`: traces over the PDF, and the campus composite.
* `tools/campus-trace/`: scripts that generate the campus SVGs.
* `CAMPUS_MAP.md`, `POSITIONING_EXPERIMENT.md`: map sources/uncertainty and the sensor plan.
