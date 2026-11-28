# NkapBook

**Clear njangi records. No palaver.**

NkapBook is an installable web app (PWA) that helps njangi (tontine) groups in Cameroon keep clear, shared records:
contributions, turns, fines, loans, events and meetings. It **never collects, holds or moves group money**. Members
keep paying cash at meetings or by MTN MoMo / Orange Money / bank to the treasurer; NkapBook records who paid, how
much, how, when, and who recorded it.

- **Officials** (president, secretary, treasurer) sign in with their phone number (SMS code) and run the group, even
  with no network during the meeting.
- **Members** install nothing and have no account: each gets a private link on WhatsApp showing their own record.
- **English, French and Cameroon Pidgin**, switchable on every page.
- **Members and officials abroad** can be added with their own number: Cameroon numbers are typed as usual
  (`6 70 12 34 56`), numbers from other countries start with `+` and the country code (`+44 7911 123456`).

---

## What's in version 1

| Area | What officials can do |
|---|---|
| Group | Create a group (you become president), invite secretary/treasurer by phone, settings |
| Members | Add one by one or paste a list from WhatsApp/notebook/Excel; hands (shares); left the group |
| Turn order | Set by hand, or a **recorded draw** anyone can verify from its check code |
| Meeting mode | Attendance and payments in one list, one tap for a full payment, partial amounts, MoMo/Orange references, corrections with a reason, payout to today's collector, minutes. **Works offline** and syncs later without duplicates |
| Member link | "My NkapBook": paid, owing, fines, loans, turn date, full history; member confirms receipt of their payout |
| Fines | Manual fines; automatic rules (late payment, absence, lateness); pay or waive with a reason |
| Loans | From the savings fund, with guarantors; interest "% per month" (or flat) shown before saving; repayments; overdue |
| Events | One-off collections (cry die, birth, wedding) with an amount per member; hand-over to the family |
| Dashboard | Who owes what, fund balance, overdue loans, next turns |
| Reminders | Personalised WhatsApp messages, sent with one tap through `wa.me` (free). Automatic sending is built but off |
| Exports | CSV of everything; printable meeting summary and member statement (Save as PDF) |
| Platform admin | `/admin`: all groups with counts, plan (trial / paid / pilot / free) and subscription; record payments. No member names or phone numbers |

**Trust:** money records can't be edited or deleted by anyone; a correction is a new line with a reason, visible to
the member. Every other change goes to an audit log automatically.

---

## Run it on your computer

Requirements: Node.js 22+, and for the security tests a local PostgreSQL.

```bash
npm install
cp .env.example .env.local   # then fill in SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Where it's used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase → Project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | the **publishable** key (`sb_publishable_…`). Safe in the browser: Row Level Security protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | the **secret** key (`sb_secret_…`). Used for member links and rate limits. Never prefix with `NEXT_PUBLIC_`, never commit it |
| `NEXT_PUBLIC_SITE_URL` | both | `https://nkapbook.com` in production; builds member links and reminder messages |
| `FEATURE_WA_CLOUD`, `WA_CLOUD_*` | server | automatic WhatsApp reminders, off by default (see below) |
| `CRON_SECRET` | server, secret | protects the scheduled jobs (admin emails, automatic reminders) |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_HOST`, `ADMIN_NOTIFY_EMAIL` | server, `SMTP_PASS` secret | admin email notifications (see below) |

---

## 1. Supabase

The production project is **nkapbook** (ref `qtjvgbllqzhqlwgvguyf`, region Paris), separate from WazaBolt. All
migrations in `supabase/migrations/` have been applied to it.

To set up a **new** project from scratch:

1. Create a project at supabase.com (region **Paris** or **Frankfurt** is closest to Cameroon).
2. Run every file in `supabase/migrations/` **in order** in the SQL editor (or `supabase db push` with the CLI).
3. **Phone sign-in:** Authentication → Sign In / Providers → **Phone** → enable.
   - Choose an SMS provider. For development, placeholder Twilio values are fine.
   - **Test phone numbers and OTPs:** e.g. `237670000001=123456`. These sign in with a fixed code and no SMS.
   - **SMS OTP expiry:** 300 seconds (cheap phones and slow networks need time). **OTP length:** 6 (the app expects 6).
4. **URL configuration:** Site URL `https://nkapbook.com`; Redirect URLs `https://nkapbook.com/**`.
5. **API keys:** copy the publishable key and the secret key into Vercel (step 2 below).
6. **Make yourself platform admin** (after signing in once with your real number):
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where phone = '2376XXXXXXXX';
   ```
7. **Demo group (optional):** open `supabase/seed/demo_unity_njangi.sql`, put the president's sign-in number at the
   top, and run it in the SQL editor. It creates "Unity Njangi": 15 members (2 with double hands), a recorded draw, 3
   past meetings with partial and MoMo payments, fines, payouts (2 confirmed), one loan with guarantors, a birth
   collection, savings, and a private link for everyone. Demo members have no phone numbers, so nobody real can be
   messaged by accident. Running it twice does nothing.

## 2. Vercel

1. vercel.com → **Add New → Project** → import `TaniformSylvester/nkapbook` (framework: Next.js, root `./`).
   If the repo is missing, click *Adjust GitHub App Permissions* and allow it.
2. **Environment variables** (Production and Preview): the four in the table above. Don't add the Supabase
   integration; this project uses its own Supabase project.
3. **Deploy.** Every merge to `main` deploys automatically.

## 3. Domain nkapbook.com (bought on Vercel)

1. Vercel project → **Settings → Domains → Add** `nkapbook.com`, connected to **Production**.
   Untick "redirect apex to www": the short address is better for member links on WhatsApp.
2. Add `www.nkapbook.com` → **Redirect to Another Domain** → `nkapbook.com` (308 permanent).
3. Because the domain was bought on Vercel, DNS and HTTPS are automatic.
4. Make sure `NEXT_PUBLIC_SITE_URL=https://nkapbook.com` and the Supabase Site URL match.

## 4. Before inviting real groups (launch checklist)

- [ ] **Real SMS provider** for login codes (Twilio, Vonage, MessageBird or Textlocal) that delivers to MTN and
      Orange Cameroon. It's paid per SMS: check current prices and send a test to both networks. If officials sign in
      from abroad, also allow those countries in the provider (e.g. Twilio → Messaging → Geo permissions).
- [ ] Remove or expire the **test phone numbers** in Supabase.
- [ ] Make yourself **platform admin** (step 1.6).
- [ ] Set your **subscription payment numbers** in Vercel (see Subscriptions below), New groups start on a 2-month free trial automatically.
- [ ] Review the Pidgin wording: `npm run pidgin:review` writes `docs/pidgin-review.md`.
- [ ] **Backups:** the Supabase free plan keeps limited backups. For real money records, consider the Pro plan
      (daily backups) or export CSVs regularly (Settings → Export and print).
- [ ] Free projects pause after a period of inactivity; a group using it weekly keeps it awake, but check before a
      quiet period.
- [ ] Tell groups plainly: NkapBook keeps records; it never holds their money.

---

## How it works

### Meeting mode and offline

- Officials open a meeting while they have network (one call). That records what each member owes
  (hands × contribution) and today's collector(s) from the turn order.
- Everything after that (attendance, payments, corrections, payout, minutes, closing) is saved first in the phone's
  IndexedDB with an id made on the phone, then sent in batches to `sync_ops()`. Sending a batch twice records nothing
  twice, and one rejected action never blocks the rest. The screen shows the last server copy plus what's waiting.
- The meeting page is kept by the service worker, so it reloads without network.
- The draw stores a random seed; the order is the hands sorted by `sha256(seed:member_id:hand_no)`, so anyone can
  recompute it. Redraws are kept; the order locks once started.

### Money

- One append-only `ledger_entries` table holds every amount owed or paid, in three buckets: **njangi** (contributions,
  payouts), **fund** (savings, loans, repayments, fines if the group says so), **social** (events).
- Balances are views (`member_balances`, `loan_balances`, `fine_balances`, `event_balances`, `group_accounts`) that
  run with the viewer's own permissions. The fund balance counts cash only; interest and dues are promises.
- Loans, "% per month": simple interest on the amount borrowed for each month of the agreed term, worked out once
  and shown before saving (100,000 at 5% for 3 months → repay 115,000). Late interest can be added with a reason.

### Security and privacy

- Row Level Security on every table. Officials see only their own groups. Members' names and phone numbers are visible
  to that group's officials only. The platform admin sees group-level counts and the plan, never member details.
- The browser's anonymous role has **no** table access. Member links are served by the server through
  `member_view()` / `confirm_payout()`, which only the server can call, are rate-limited per visitor and per link,
  and return one member's record plus group basics (name, meeting dates, who collects next by first name).
- Member pages: `noindex`, `Cache-Control: private, no-store`, `Referrer-Policy: same-origin` (the link is never sent to other sites). Tokens are 43 random
  characters; officials can reset a link and the old one stops working at once.
- Sign-in codes are rate-limited per phone number and per connection, on top of Supabase's own limits.
- Supabase's default `TRUNCATE` grant is revoked (it would bypass row security).

### Currencies

Each group keeps its records in one currency, chosen when the group is created: FCFA (XAF or XOF), naira, cedi,
Kenyan shilling, rand, baht, euro, pound, US or Canadian dollar. Amounts are whole numbers. Officials can change
the currency in Settings **only until the first money is recorded**; after that the database refuses, so old
records never change meaning. Reminders, member links, statements and exports all use the group's currency
(the ledger CSV has a `currency` column). NkapBook's own subscription is always priced in FCFA.

### Subscriptions (groups paying for NkapBook)

This is the group paying **you** for the service; NkapBook still never holds group money.

- **Every new group gets a 2-month free trial.** Then 2,000 FCFA a month for the whole group, 10,000 for 6 months,
  20,000 for 12 months (`SUBSCRIPTION_PRICE_XAF`, `SUBSCRIPTION_PRICE_6M`, `SUBSCRIPTION_PRICE_12M`).
- Card payments (diaspora members): create a Stripe Payment Link and set `SUBSCRIPTION_STRIPE_LINK`. Officials get a
  *Pay by card* button; the group reference is passed as `client_reference_id`, so you can match it in Stripe.
- Set your payment details in Vercel: `SUBSCRIPTION_MTN_NUMBER`, `SUBSCRIPTION_ORANGE_NUMBER`,
  `SUBSCRIPTION_PAYEE_NAME` and optionally `SUBSCRIPTION_WHATSAPP_NUMBER` (defaults to the MTN number). They're kept
  out of the code on purpose. Redeploy after changing them.
- Officials see *Settings → NkapBook subscription*: status, price, how to pay, the group's reference (e.g.
  `NKAP-9D5117`) to write in the MoMo message, and a button to tell you on WhatsApp.
- When a treasurer has paid, open **/admin** → the group → *Record payment* (1, 3, 6 or 12 months, amount, method,
  MoMo reference). The plan becomes *Paid* and the end date moves forward from today, or from the current end date if
  they paid early. Every payment is kept and can't be edited.
- 7 days before the end (trial or paid), officials see a notice on the Overview.
- After the end there are **14 days of grace**. After that, only **opening a new meeting** is paused (checked in the
  database, not just the screen). Everything else keeps working: records, exports, member links, reminders, and
  finishing a meeting that's already open, including offline sync. Paying unlocks it straight away.
- *Pilot* and *Free* groups are never paused and never see payment notices. Set them in /admin.

### Admin email notifications

You get an email at `support@nkapbook.com` (or `ADMIN_NOTIFY_EMAIL`) when:

- **a new group signs up** (sent right after it's created; a failed email never blocks sign-up),
- **a trial or paid plan ends in 7 days** (daily check),
- **every Monday**: a summary of new groups, plans ending in the next 14 days, groups in grace, and paused groups.

Emails only contain group-level facts (name, town, plan, dates, reference), never members' names or numbers.

Setup:
1. In Zoho, create an **app-specific password** (Zoho Accounts → Security → App passwords).
2. In Vercel → Settings → Environment Variables add `SMTP_USER` (your Zoho login), `SMTP_PASS` (the app password)
   and `CRON_SECRET` (a long random string; Vercel Cron sends it automatically). `SMTP_HOST` defaults to
   `smtppro.zoho.com`. Redeploy.
3. Open **/admin → Send a test email**.

The daily job is `/api/cron/admin-digest`, scheduled in `vercel.json` at 06:00 UTC (07:00 in Douala). To send the
weekly summary right away: `curl -H "Authorization: Bearer $CRON_SECRET" "https://nkapbook.com/api/cron/admin-digest?weekly=1"`.

### WhatsApp reminders

**Now (free):** Meetings → *Send reminders*. Each member's message is written in the chosen language with what's
due, what they've paid, anything owed from before, their turn date and optionally their private link. *Send* opens
WhatsApp with the message ready (`wa.me`) and records that it was sent.

**Later (automatic, off by default):** `src/lib/reminders/channel.ts` defines a `ReminderChannel` interface with
`waLinkChannel` (used now) and `waCloudChannel` (WhatsApp Business Platform / Cloud API). `GET /api/cron/reminders`
sends a template the day before a meeting, **only to members with "agrees to receive automatic WhatsApp reminders"
ticked**, and logs each send. To switch it on:

1. Create a WhatsApp Business account and phone number in Meta Business, and get a permanent access token.
2. Submit a message template (e.g. `nkapbook_contribution_due`, body with 4 parameters: name, amount, group, day) in
   English and French. Meta has no Pidgin locale; register the Pidgin wording under English if you want it.
3. In Vercel set `FEATURE_WA_CLOUD=true`, `WA_CLOUD_PHONE_NUMBER_ID`, `WA_CLOUD_ACCESS_TOKEN`, `WA_CLOUD_TEMPLATE`
   and a long random `CRON_SECRET`.
4. Add `/api/cron/reminders` to the crons in `vercel.json` (Vercel sends `Authorization: Bearer $CRON_SECRET`).

Meta charges per business-initiated conversation; check their current Cameroon pricing first. Another provider can be
added as a new `ReminderChannel` without touching the rest of the app.

### Exports

Settings → *Export and print*: CSV files of all money records, members and balances, meetings, attendance, loans and
fines (UTF-8 with BOM so Excel shows accents; cells that look like formulas are neutralised). Each meeting has a
printable summary and each member a printable statement.

---

## Languages

Dictionaries live in `src/i18n/` (`en.ts` is the source; `fr.ts` and `pcm.ts` must have the same keys, and a test
checks this). The group picks the default language; anyone can switch with EN / FR / PID. Pidgin strings need review
by a native speaker: run `npm run pidgin:review` to regenerate `docs/pidgin-review.md`, then add approved keys to
`reviewed` in `src/i18n/pcm.ts`.

## Tests

```bash
npm run typecheck
npm test            # unit: phone numbers, money, dictionaries, list parser, loans, offline merge, reminders, CSV, member page
npm run test:db     # security: Row Level Security, audit trail, roles, invites, meetings, sync, member links, money, demo seed
npm run build
npm run test:e2e    # 360px browser checks (after npm run build), including an accessibility scan
```

`test:db` needs a local Postgres superuser (default `postgres://postgres:postgres@localhost:5432/postgres`, override
with `TEST_PG_ADMIN_URL`). It creates a throwaway database `nkapbook_test`, loads a small stand-in for Supabase's
`auth` schema (`tests/db/supabase-shim.sql`), applies every migration and runs the checks.

## Project layout

```
src/app/            pages (App Router): / login, /app (officials), /m/[token] (members), /admin, /api/cron
src/components/     small shared UI pieces
src/i18n/           en / fr / pcm dictionaries
src/lib/            money, phone, dates, loans, CSV, reminders, offline store and sync logic, Supabase clients
supabase/migrations SQL schema, RLS policies and functions (apply in order)
supabase/seed/      demo group
public/brand/       your logo files (used as-is); public/icons/ PWA icons generated from the app icon
tests/              unit, db (security) and e2e
```
