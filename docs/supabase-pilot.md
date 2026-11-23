# Chat and Updates pilot: setup and two-phone test

Backend: **Supabase** (login, Postgres with row-level security, realtime,
photo storage). It works in Expo Go with no native build. All access rules
live in `apps/supabase/migrations/20261025000000_pilot.sql` and are tested against
real Postgres in `apps/tests/pilot-rules.test.mjs`. Without a backend the app still
runs; Chat and Updates then say they aren't available yet.

## Connect the backend (about 10 minutes)

1. Create a free project at supabase.com (pick a US West region).
2. **SQL Editor → New query**: paste all of
   `apps/supabase/migrations/20261025000000_pilot.sql` and run it.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to
   sign up", so only pilot accounts exist.
4. **Project Settings → API keys**: copy the Project URL, the
   publishable (anon) key, and the secret (service-role) key.
5. In `apps/`:
   ```bash
   cp .env.example .env.local
   ```
   Put the URL and the **publishable** key in `.env.local`. Never put the
   secret key there.
6. Create the test accounts (fictional: Sam and Riley are students, Gina is a
   guide covering every topic in English and Spanish, Ed is the editor/admin).
   Run `npm run pilot:accounts`. It asks, at hidden prompts, for the secret key
   (copy it with the copy button after **Reveal**; it is about 41 characters)
   and for a shared password. It creates or repairs all four accounts and signs
   in as each to verify. Re-run it any time to reset the password.
   Or skip copying the key: run `npx supabase login` once, then
   `npm run pilot:accounts -- --from-cli`, which gets the key from the CLI.
   Check a password later, changing nothing: `npm run pilot:check-signin`.
   Accounts: `student1@bellspace-pilot.test`, `student2@bellspace-pilot.test`,
   `guide1@bellspace-pilot.test`, `editor@bellspace-pilot.test`.
7. Start the app: `npx expo start --clear`, and scan the QR code on both
   iPhones (Expo Go, same Wi-Fi; otherwise `npx expo start --tunnel`).

## Two-phone test

| Step | Phone A | Phone B |
| --- | --- | --- |
| 1 | Chat → sign in as `student1` | Chat → sign in as `guide1`, turn on **Available for questions** |
| 2 | "1 guide is available for Navigation" appears. Ask as **Anonymous to guide**, then Send question. The status is **Pending**. | The question appears under "Waiting for a guide" as "Anonymous student", without a refresh |
| 3 | The status changes to **Active** with "Gina (guide)" | **Accept** |
| 4 | The reply arrives without a refresh; send one back | Reply; the student's message arrives |
| 5 | **Report**, with a reason | |
| 6 | | Settings → Sign out, then sign in as `editor`. Chat → Reported conversations shows the chat, with the asking account (Sam). |
| 7 | Open Updates | Updates → **New update**: title, date `2026-11-06`, time `12:15`, location, text and a photo, then **Publish** |
| 8 | The update appears in the feed | **Edit → Unpublish** |
| 9 | Switch to another tab and back: the update is gone | |

Also check:
* As `guide1` with availability off, Phone A says no guide is available and
  the question waits as Pending.
* As `student2`, Phone A cannot see Sam's chat.
* End conversation from either side makes it **Closed**, and no more
  messages can be sent.

## What the database enforces (not just the UI)

* Signed-out users can read only published updates. Map browsing needs no login.
* Roles are set only by staff (seed script or SQL editor). The app cannot
  change a role, approve a guide or write chat tables directly. Every chat
  action goes through checked functions.
* A pending question is visible only to approved guides who are available
  and match its topic and language. Only one guide can accept it.
* Messages are readable only by the two participants. Messages carry no
  account id. The asking account is stored apart and is never visible to
  guides, even in named mode, where only a first name is shown.
* Reviewers (admins) can read a conversation only after it is reported, and
  then see which account asked.
* Only admins create, publish, unpublish or edit updates and upload photos.
  Photos of drafts are private.
* Each student can have at most 2 open questions. Messages are at most 1000 characters.

## Needs school approval before real students use Chat

1. **Student data and privacy:** using Supabase (a third-party processor)
   for student accounts and messages, a data agreement, and FERPA / California
   (SOPIPA) review. Accounts should come from school sign-in (Google or
   Microsoft SSO), not shared passwords.
2. **Guides:** who selects and trains them, their topics and languages, the
   hours they may be available, and adult supervision.
3. **Reviewers:** which staff may read reported conversations, response
   times, and what happens after a report (including mandatory-reporter
   duties). Whether staff may read unreported chats (the database does not
   allow it now).
4. **Anonymity:** whether "Anonymous to guide" is allowed, and the wording
   that the account stays linked for safety reports.
5. **Retention:** how long messages and reports are kept, and how they are
   deleted. Nothing is deleted automatically yet.
6. **Age and consent:** parent notice or consent, and an age policy for any
   students under 13.
7. **Acceptable-use rules** shown before a first question, and a guide code of conduct.
8. **Updates:** who may post, and photo permissions (team-owned photos and
   releases for students in photos).
9. **Accessibility and languages** offered (currently English, Spanish and Armenian).

Not built yet: SSO, push notifications for new questions and replies, an
admin screen for approving guides (use the seed script or SQL editor),
automatic message filtering, rate limits beyond 2 open questions, and
moderation tools beyond reading, ending and resolving reports.
