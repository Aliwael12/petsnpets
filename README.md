# Elite Blue Veterinary Center — Store & Clinic

Two surfaces on one codebase:

- **The public website** (`/`) — an informative clinic site with online appointment booking.
- **The staff CRM** (`/staff` → `/dashboard`) — point of sale, sales, refunds, client
  discounts, pet medical records, supplier shipments, appointments and analytics.

A booking made on the website lands in the CRM calendar as a pending request, where staff
confirm or decline it. That is the only path between the two, and it runs over the API's
`public/*` routes — the only unauthenticated surface in the system.

```
.
├── src/
│   ├── site/            The public website (marketing + booking)
│   ├── pages/           The staff CRM screens
│   └── api/             TanStack Query hooks, one module per domain
├── server/              NestJS + Drizzle backend API
└── supabase/            Local Supabase stack config + SQL migrations
```

The frontend talks only to the Nest API (`server/`); the API is the sole owner of the
Postgres database. Supabase provides the managed Postgres instance, employee auth accounts,
and the private Storage bucket invoices are rendered into — see `server/src/app.module.ts`
for how the modules fit together.

## Prerequisites

- Node.js 20+
- Docker Desktop (for the local Supabase stack)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` works without a
  separate install)

## First-time setup

```bash
# 1. Start local Supabase (Postgres, Auth, Storage) — run from the repo root
npx supabase start

# 2. Install and configure the backend
cd server
npm install
cp .env.example .env        # defaults already match `supabase start`'s local output
npm run db:push-local       # applies supabase/migrations/ to the local database
npm run seed                # employees, products, clients, pets, ~30 days of sales history

# 3. Start the API
npm run start:dev           # http://localhost:3001/v1

# 4. In a second terminal, start the frontend
cd ..
npm install
cp .env.example .env
npm run dev                 # http://localhost:5173
```

The public website is at `http://localhost:5173/`. For the staff CRM go to
`http://localhost:5173/staff` and sign in with any seeded employee and PIN `1234` (or email
`<slug>@petsandpets.local` / password `Password123!` against Supabase Auth directly, e.g. in
Studio at `http://localhost:55323`).

## Everyday commands

| Command (from `server/`)  | Does |
|---|---|
| `npm run start:dev`       | API in watch mode |
| `npm run seed`            | Wipes and reseeds all application data (safe — local only) |
| `npm run verify:all`      | Reseeds, then runs all 100 integration tests against the running API |
| `npm run db:generate`     | Generates a Drizzle migration from schema changes |
| `npm run db:sync`         | Copies a generated migration into `supabase/migrations/` |
| `npm run db:migrate`      | `db:generate` + `db:sync` in one step |
| `npm run db:push-local`   | Applies pending migrations to the local database |
| `npm run db:studio`       | Drizzle Studio — browse/edit data visually |

`npm run verify:all` (from `server/`) is the fastest way to confirm a from-scratch checkout
actually works — it seeds fresh data and then runs the phase 3–7 test suites described in
`server/scripts/`. Phase 1 (schema/migrations) and phase 2 (auth) are exercised as part of
every other suite implicitly, since nothing else can run without them.

Phase 7 is the only suite whose window is time-sensitive: it deliberately trips the booking
rate limiter, so running `verify:phase7` twice inside 60 seconds can start with a partly
consumed bucket. A full `verify:all` pass takes long enough that this never bites.

## Architecture notes worth knowing before changing money-handling code

- **All money is stored as integer piastres**, never floats. `formatCurrency` in
  `src/components/ui.tsx` is the one place that divides by 100 for display.
- **Stock is an append-only ledger** (`stock_movements`), not just a counter on `products`.
  `server/src/inventory/inventory.service.ts` is the only code allowed to write to it —
  every other module (sales, refunds, purchasing) calls through it.
- **Every checkout and refund requires an `Idempotency-Key` header** (a client-generated
  UUID per attempt) so a double-tap or network retry can't double-charge or double-refund.
- **Discounts are claimed atomically** (`UPDATE ... WHERE used_in_transaction_id IS NULL`) —
  never "check then use", which has a race window.
- Times are bucketed in `Africa/Cairo` on the server (`server/src/analytics`,
  `server/src/appointments/clinic-hours.ts`) or via `src/lib/timezone.ts` on the client —
  never the viewer's browser timezone. Someone booking from London sees the clinic's
  6:30 pm, not their own.

See `server/scripts/test-phase4.mjs` for the concurrency tests (oversell races, discount
races, idempotency replay) that exercise these guarantees directly.

## The public booking path

`public/*` is the only part of the API reachable without a session, so it is the part worth
being paranoid about:

- **Double-booking is prevented in Postgres, not in app code.** `appointments` carries a
  partial unique index on `requested_at` filtered to `status in ('pending','confirmed')`, so
  two visitors submitting the same slot at the same instant cannot both win, and cancelling
  frees the slot again. The API turns the resulting `23505` into a friendly `SLOT_UNAVAILABLE`.
- **The booking DTO has no `status`, `handledBy` or `clientId` field at all**, so a crafted
  request cannot self-confirm a booking or staple it to someone else's client record. New
  bookings are always `pending`.
- **Opening hours are validated server-side**, not just greyed out in the UI — posting
  straight to the API at 3am is rejected the same way.
- **The booking POST is rate limited per IP** (`RateLimitGuard`, 10/minute). It is an
  in-process speed bump against one client hammering the form, not a defence against a
  distributed flood — anything internet-facing wants that at the edge instead.
- The public reads (`services`, `opening-hours`, `availability`) deliberately project only
  name/price/time — never stock levels, cost, SKUs or client data.
