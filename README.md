# NkapBook

**Clear njangi records. No palaver.**

NkapBook is an installable web app (PWA) that helps njangi (tontine) groups keep clear, shared records:
contributions, turns, fines, loans and meetings. It **never collects, holds or moves money**. It only records
who paid, how much, how, when, and who recorded it.

- Officials (president, secretary, treasurer) sign in with their phone number (SMS code).
- Members have no account: each gets a private link on WhatsApp showing their own record.
- English, French and Cameroon Pidgin.

## Stack

Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Auth, Row Level Security) · plain CSS with design
tokens · hand-written service worker.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase > Project settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | the **publishable** key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | the **secret** key. Never prefix with `NEXT_PUBLIC_`. Used for rate limits and member links |
| `NEXT_PUBLIC_SITE_URL` | both | e.g. `https://nkapbook.com`; used to build member links |

## Supabase setup

The project `nkapbook` (ref `qtjvgbllqzhqlwgvguyf`, region Paris) already exists, and the migrations in
`supabase/migrations/` have been applied. To set up a fresh project, run them in order (Supabase CLI:
`supabase db push`, or paste each file into the SQL editor).

### Phone sign-in without paying for SMS (development)

1. Dashboard > **Authentication > Sign In / Providers > Phone**: turn **Enable phone provider** on.
2. Pick an SMS provider (e.g. Twilio). For development only, placeholder credentials are enough.
3. In **Test phone numbers and OTPs**, add numbers with fixed codes, for example
   `237670000001=123456, 237670000002=123456`, and set an expiry date.
4. Sign in on the app with `6 70 00 00 01` and code `123456`. No SMS is sent and nothing is charged.

Before launch you'll need a real SMS provider that delivers to Cameroon (paid per SMS). Remove the test numbers
then.

### Make yourself platform admin

After you've signed in once, run this in the SQL editor with your number:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where phone = '2376XXXXXXXX';
```

## Tests

```bash
npm run typecheck
npm test            # unit tests (phone numbers, money, dictionaries)
npm run test:db     # security tests: Row Level Security, audit trail, roles
npm run test:e2e    # 360px browser checks (needs `npm run build` first)
```

`test:db` needs a local Postgres superuser (default `postgres://postgres:postgres@localhost:5432/postgres`,
override with `TEST_PG_ADMIN_URL`). It creates a throwaway database `nkapbook_test`, loads a small stand-in for
Supabase's `auth` schema (`tests/db/supabase-shim.sql`), applies every migration and runs the checks.

## Languages

Dictionaries live in `src/i18n/` (`en.ts` is the source; `fr.ts` and `pcm.ts` must have the same keys, and a test
checks this). Pidgin strings need review by a native speaker: run `npm run pidgin:review` to regenerate
`docs/pidgin-review.md`, and add approved keys to `reviewed` in `src/i18n/pcm.ts`.

## Meeting mode and offline

- Officials open a meeting while they have network (one call). That records what each member owes
  (hands × contribution) and today's collector(s) from the turn order.
- Everything recorded after that (attendance, payments, corrections, payout, minutes, closing) is saved first in
  the phone's IndexedDB with an id made on the phone, then sent in batches to `sync_ops()`. Sending a batch twice
  records nothing twice. The screen always shows the last server copy plus what's still waiting.
- The meeting page is kept in the service worker cache, so it reloads without network.
- The turn-order draw stores a random seed. The order is the hands sorted by `sha256(seed:member_id:hand_no)`, so
  anyone can recompute it and confirm nobody changed it. Redraws are kept, and the order locks once started.

## How the records stay trustworthy

- Every amount owed or paid is a row in `ledger_entries`. Rows can never be edited or deleted. A database trigger
  blocks it for everyone, including the database owner.
- A correction is a **reversing entry** (same amount, linked to the original, with a reason) plus a new entry.
- Changes to groups, members, attendance and other settings go to `audit_log` automatically.
- Officials only see their own groups (RLS). The anonymous browser role has no table access at all; member
  links are served by the server through narrow database functions.
