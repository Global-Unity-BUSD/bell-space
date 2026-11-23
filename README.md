# Bell Space

Student app for Burbank High School: indoor campus maps and directions, school
Updates, a staff-supervised support Chat, and Q&A. Staff manage Updates and
Chat on a website. Everything runs on one school-managed server.

* Scope and status: [docs/project.md](docs/project.md) and [TODO.md](TODO.md)
* How the parts fit together: [docs/architecture.md](docs/architecture.md)
* All documentation: [docs/README.md](docs/README.md)
* Rules for AI agents working here: [AGENTS.md](AGENTS.md)

## Folders

| Folder | What it is |
| --- | --- |
| [`apps/`](apps) | The phone app (Expo SDK 58 / React Native 0.88) |
| [`server/`](server) | Backend: `/v1/` API, live updates, PostgreSQL migrations with the access rules |
| [`web/`](web) | Staff website (React + Vite), served by the server |
| [`shared/`](shared) | API types and labels used by the app, server and website |
| [`maps/`](maps) | Floor-plan SVGs, the source of truth for the campus map |
| [`tools/`](tools) | `campus-trace` (generates `maps/`), `route-review` (generates `docs/route-review.md`) |
| [`reference/`](reference) | Traced overlays and review images |
| [`docs/`](docs) | Documentation |

## Run it

Each part has its own dependencies: run `npm install` once inside `apps/`,
`server/` and `web/`.

**Server and staff website** (details: [server/README.md](server/README.md)):

```bash
cd server
npm run seed:test        # test accounts, one shared password (stop the server first)
npm run dev              # http://127.0.0.1:8787
cd ../web && npm run build   # the server then serves the website at /
```

**Phone app** (Expo Go, same Wi-Fi as this computer):

```bash
cd apps
npx expo start --clear
```

Scan the QR code with the phone camera. `apps/.env.local` chooses the backend
(see `apps/.env.example`). For a phone, start the server with `HOST=0.0.0.0` and
set `EXPO_PUBLIC_SERVER_URL` to this computer's Wi-Fi address. Use `--clear`
after changing `.env.local`, `svg-transformer.cjs` or the map adapters.

## Checks

```bash
cd apps   && npm test && npx expo lint && npx tsc --noEmit
cd server && npm test && npx tsc --noEmit
cd web    && npx tsc --noEmit && npm run build
```
