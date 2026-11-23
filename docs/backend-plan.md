# Bell Space backend, staff website and support chat

Plan for moving Updates and Chat off Supabase to a self-hosted server on a
BUSD-managed machine, and adding a staff website. Decided 2026-11-22.

## Decisions

* **One repository.** The Expo app stays at the root. Next to it:
  ```text
  server/   Node + TypeScript backend (Fastify, PostgreSQL), migrations, tests
  web/      staff website (React + Vite), built and served by the server
  shared/   types and validation used by the app, the server and the website
  deploy/   docker-compose (PostgreSQL + server), environment example, backups
  ```
  `server/` and `web/` each have their own `package.json`; `shared/` is plain
  TypeScript imported by relative path (no build step, no workspace tooling).
* **One service plus PostgreSQL.** No microservices until there is a measured need.
  The server runs `.ts` files directly with Node's type stripping (Node 22.18+).
* **Access rules stay in the database.** Row-level security and checked
  functions, as in the pilot. The server signs the caller in, then runs each
  request in a transaction as the `app_user` role with `app.account_id` set.
  Rules are tested against real Postgres (PGlite) in `server/tests/`.
* **Real-time updates are hints.** Triggers call `pg_notify` with ids only. The
  server forwards a hint over WebSocket to each connected account allowed to see
  the row; clients then fetch through the API. Message text never goes over the socket.
* **Sign-in:** email + password (scrypt, Node built-in) until BUSD chooses its
  identity system; `accounts.external_id` is reserved for district sign-on.
  Sessions are random tokens stored hashed in Postgres: a cookie for the website,
  a bearer token for the app.
* **API versioning:** everything is under `/v1/` and only grows, so older app
  versions keep working while students update.
* **Development without Docker:** with no `DATABASE_URL`, the server uses an
  embedded PGlite database in `server/data/`. Production uses PostgreSQL.

## Accounts and permissions

| Account | Who | Uses |
| --- | --- | --- |
| `student` | Any student | App |
| `student` + guide profile | A trained student guide (topics, languages, active) | App; can also ask questions |
| `staff` | Staff, with any mix of the permissions below | Website |

| Staff permission | Allows |
| --- | --- |
| `updates` | Create, edit, publish, unpublish and delete Updates; upload photos |
| `support` | Review requests, assign guides, keep sensitive requests, supervise, follow up, resolve, handle reports |
| `manage_accounts` | Create and disable accounts, set passwords, grant permissions, manage guide profiles, change the supervision setting |

Test accounts (`npm run seed:test` in `server/`, refused in production):
2 students, 2 guides, and staff with `updates` only, `support` only, and
`manage_accounts`.

## Support chat (CLEAR 2.0 flow)

```text
submitted ──(staff assigns)──→ with_guide ──(guide marks done)──→ follow_up ──→ resolved
    │  ↑                           │
    │  └────(guide declines)───────┘
    └──(staff keeps it: sensitive)──→ with_staff ──────────────────────→ resolved
```

* A student submits a question (topic, optional language). At most 2 open requests.
  A student may withdraw a request while it is still `submitted`.
* Support staff review it and either assign a guide (no automatic matching) or
  keep it with staff for counseling, safety and private matters.
* A guide sees only requests assigned to them, and may decline (back to
  `submitted`, staff notified). A guide is never assigned their own request.
* Names are visible on both sides. There is no anonymous mode.
* Messages are allowed only inside an assigned, open request, from the student,
  the assigned guide or support staff. No other messaging exists.
* Staff follow-up happens in the same thread; staff messages are labeled.
* Students and guides can report a request at any time.
* **Supervision setting** (`supervision_mode`, changed by `manage_accounts`, logged):
  * `all_requests` (default, matches the flow): support staff can read every thread.
  * `reported_only`: support staff read the question of every request (needed
    to assign it), but the messages only of reported requests and of requests
    staff are handling (`with_staff`, `follow_up`).
  * Every staff view of a thread is recorded in the request's history.

## Order of work

1. Server skeleton, schema, rules tests (PGlite).
2. Sign-in, sessions, test-account seed.
3. Updates API with photos (stored on the server's disk).
4. Support request API and WebSocket hints.
5. Staff website: sign-in, Updates editor, support queue and threads, accounts,
   supervision setting.
6. App: switch Updates and Chat to the server; new student and guide Chat screens.
   Done 2026-11-22. `EXPO_PUBLIC_BACKEND=server` is the default.
7. Supabase stays as a fallback (decided 2026-11-22): `EXPO_PUBLIC_BACKEND=supabase`
   brings back the pilot's sign-in, Chat and in-app Updates editor
   (`apps/src/backend/{client,auth,api}.ts`, `ChatScreen.tsx`, `apps/supabase/`). No data
   is moved between the two. Remove it only when it is no longer wanted.
8. Later: push notifications (needs a development build, an Apple Developer
   account and FCM credentials; see below).

## Open questions

For the client:
* Supervision: `all_requests` or `reported_only`.
* Retention: how long requests, messages and history are kept.
* Which staff get which permission; who trains and approves guides.

For BUSD IT:
* Server, network and HTTPS setup; whether students need access off campus.
* The district identity system for sign-in.
* Approved mobile distribution; backups and update procedure.
* Push notifications: Expo's push service, or direct to Apple (APNs) and Google
  (FCM). Remote push no longer works in Expo Go (SDK 53+), so it needs a
  development build.
