# Bell Space server and staff website

One Node service plus PostgreSQL: the `/v1/` API for the app and the staff
website, real-time hints (`/v1/live`), and the built staff website at `/`.
Design and order of work: `../BACKEND_PLAN.md`. Node 22.18+ (runs `.ts` directly).

## Run on your computer (no Docker needed)

Without `DATABASE_URL`, the server uses an embedded development database in
`server/data/dev-db` (PGlite, real Postgres). Photos go in `server/data/photos`.

```bash
cd server && npm install
npm run seed:test          # test accounts (asks for one shared password); stop the server first
npm run dev                # http://127.0.0.1:8787
```

Staff website, either:
* built and served by the server: `cd web && npm install && npm run build`, then open http://127.0.0.1:8787
* with live reload: `cd web && npm run dev`, then open http://localhost:5173 (API proxied to :8787)

Test accounts (`@bellspace.test`, fictional): `student1`, `student2`,
`guide1`, `guide2` (students who are also guides), `staff-chats` (Chats) and
`staff-admin` (Chats + Updates, which also manages accounts). Students and
guides use the app; the website is for staff.

## The app against this server

In the repo root `.env.local` (see `.env.example`):

```bash
EXPO_PUBLIC_BACKEND=server
EXPO_PUBLIC_SERVER_URL=http://<this computer's Wi-Fi address>:8787
```

Start the server so the phone can reach it, then restart Expo with `--clear`:

```powershell
$env:HOST = '0.0.0.0'; $env:CORS_ORIGINS = 'http://localhost:8081'; npm run dev
```

`CORS_ORIGINS` is only for the app's web build (bearer tokens; cookies are never
allowed cross-origin). `EXPO_PUBLIC_BACKEND=supabase` switches the app back to the
Supabase pilot.

## Checks

```bash
npm test          # access rules (rules.test.ts), HTTP API (api.test.ts), live hints (live.test.ts)
npm run typecheck
```

Tests run the real migration in PGlite. Access rules live in
`migrations/`, never only in route code.

## Deploy (BUSD server)

`../deploy/`: `docker-compose.yml` (PostgreSQL 17 + this server, which also
builds and serves the website), `.env.example`, `backup.sh` (nightly
`pg_dump` and photos). Put HTTPS in front (the district reverse proxy) and
forward to port 8787. First staff account:

```bash
docker compose exec server npm run create-staff -- --email you@school.org --name "Your Name" --all
```

Everyone else is created on the website (Accounts). `seed:test` refuses to run
when `BELL_ENV=production`. Migrations run on start (`MIGRATE_ON_START=false` to
turn that off and use `npm run migrate`).

Environment: `BELL_ENV`, `DATABASE_URL`, `HOST`, `PORT`, `DATA_DIR`, `WEB_DIR`,
`TRUST_PROXY`, `COOKIE_SECURE`, `APP_SESSION_DAYS` (60), `WEB_SESSION_DAYS` (1).

## API summary

| | |
| --- | --- |
| Sign-in | `POST /v1/auth/sign-in` (`client: app` → token; `web` → httpOnly cookie), `POST /v1/auth/sign-out`, `GET /v1/me` |
| Updates | `GET /v1/updates` (public), `POST`/`PATCH`/`DELETE /v1/updates[/:id]`, `POST /v1/updates/photos`, `GET /v1/updates/photos/:name` |
| Support | `GET /v1/support`, `POST /v1/support/requests`, `GET /v1/support/requests/:id?after=`, `POST …/:id/messages`, `…/assign`, `…/keep`, `…/decline`, `…/done`, `…/resolve`, `…/withdraw`, `…/report`, `POST /v1/support/reports/:id/resolve` |
| Accounts | `GET`/`POST /v1/admin/accounts`, `PATCH /v1/admin/accounts/:id`, `GET /v1/admin/audit`, `GET /v1/admin/settings`, `PUT /v1/admin/settings/supervision` |
| Live | `GET /v1/live` (WebSocket; the app sends `{"type":"auth","token":…}` first) |

Website requests that change something must send `X-Bell-Client: web`
(cross-site pages cannot). The app uses `Authorization: Bearer <token>`.
