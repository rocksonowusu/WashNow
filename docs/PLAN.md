# Washing Bay Sales Record Book — Build Plan

Nov 9, 2026 · @Rockson Owusu

## Overview

Build an offline-first web app (PWA) that replaces the washing bay's paper sales book: attendants log every wash on a phone or laptop, even without internet, and the owner sees daily sales, washer commissions, expenses and profit.

**Decisions made**

| Topic | Decision |
| --- | --- |
| Users | Owner + 1–3 attendants/cashiers |
| Devices | Android phones and laptops (one codebase) |
| Internet | Patchy — app must work fully offline and sync later |
| Pricing | Attendant types the amount; app enforces each category's min–max range |
| Washers | Paid a percentage of each sale they wash |
| Payments | Record Cash or MoMo only (no payment API) |
| Locations | One bay now; data model ready for more branches |
| Backend | Laravel + MySQL (Firebase ruled out) |

**Price ranges (GH₵)**

| Category | Min | Max | Price depends on |
| --- | --- | --- | --- |
| Sedan | 15 | 100 | Parts washed |
| SUV | 20 | 150 | Parts washed |
| Bus | 40 | 200 | Parts washed |
| Pickup truck | 40 | 200 | Parts washed |
| Tipper / container truck | 100 | 400 | Number of tyres |
| Heavy-duty machine | 40 | 400 | Machine type |

## Requirements

### Roles

| Role | Can do |
| --- | --- |
| Owner (admin) | Everything: manage users, washers, categories/ranges, commission %, view all reports, edit/void any record |
| Cashier/attendant | Log sales and expenses, add customers, view today's sales; cannot change prices, delete, or see profit reports |

### Functional

1. **Record a sale**: vehicle category, plate number (optional link to customer), service note (e.g. "body + engine", "10 tyres"), amount, washer(s), payment method (Cash/MoMo), timestamp, recorded-by. Amount must fall inside the category's min–max; out-of-range needs owner override with a reason.
2. **Washer commission**: each washer has a commission % (editable, history kept). Commission is snapshotted on the sale so later % changes don't rewrite past pay. If two washers share a car, split commission equally (configurable).
3. **Expenses**: category (soap, water, fuel, electricity, other), amount, payment method, note, date.
4. **Customers**: plate number (unique), name, phone; visit count and total spent; flag loyal customers (e.g. every 10th wash discount — rule set by owner).
5. **Daily close**: end-of-day summary — cars washed, total sales, Cash vs MoMo totals, expenses, commission owed per washer, net. Owner can mark day as closed (locks records).
6. **Reports**: daily/weekly/monthly sales, by category, by washer, cash vs MoMo, expenses vs income, top customers. Export to Excel/PDF.
7. **Void, not delete**: sales are voided with a reason and stay visible to the owner (anti-fraud).
8. **Audit log**: who created/edited/voided what and when.

### Non-functional

- Works 100% offline on phone and laptop; syncs automatically when online, with a visible "pending sync" count.
- Installable on Android home screen (PWA); usable on small screens with one hand.
- Logging a sale takes under 15 seconds.
- Every table carries `branch_id` so a second bay is a config change, not a rewrite.
- Currency GH₵, timezone Africa/Accra.
- Daily automatic database backup on the server.

## Tech stack

Laravel API + MySQL on the server, a React PWA on every device, and IndexedDB (via Dexie.js) as the on-device database that makes offline work possible.

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | Laravel 11/12 (PHP 8.3), REST API | You already know Laravel; cheap PHP hosting in Ghana |
| Auth | Laravel Sanctum (API tokens) | Token stays on device so the app opens offline |
| Database | MySQL 8 | Standard, supported by all shared hosts |
| Frontend | React 18 + Vite + TypeScript | One codebase for phone and laptop |
| Styling | Tailwind CSS | Fast mobile-first UI |
| Offline DB | Dexie.js (IndexedDB) + `dexie-react-hooks` | Local storage of all records; live queries |
| Offline shell | `vite-plugin-pwa` (Workbox) | Caches the app so it loads without internet; installable |
| IDs | UUID v7 generated on device | Records created offline never collide |
| Reports export | Laravel Excel (maatwebsite) + DomPDF | Excel/PDF downloads for the owner |
| Charts | Recharts | Dashboard graphs |
| Hosting | API + MySQL on your cPanel; PWA on Cloudflare Pages (free, HTTPS, custom domain); see Hosting setup below | Uses the cPanel you already pay for; static PWA hosting is free and fast |

**Repo layout**: a monorepo with `/api` (Laravel) and `/web` (React PWA), deployed to two different places.

### Hosting setup

| Part | Where | Address (example) |
| --- | --- | --- |
| Frontend (PWA) | Cloudflare Pages (alt: Netlify, Vercel), built from `/web` on every push to GitHub | `washnow.<your-domain>` or the root domain |
| Backend API | cPanel subdomain, document root set to `api/public` | `api.<your-domain>` |
| Database | cPanel MySQL | localhost from Laravel |
| Domain/DNS | Registrar or Cloudflare DNS: root/`washnow` → Cloudflare Pages, `api` A record → cPanel server IP | — |

**What this split needs**

- Auth uses Sanctum **bearer tokens**, not cookies, so the two domains don't need shared sessions.
- Laravel `config/cors.php` allows only the frontend origin; `VITE_API_URL` in `/web` points to `https://api.<your-domain>`.
- HTTPS on both: Cloudflare Pages gives it automatically; enable AutoSSL in cPanel for the `api` subdomain.
- cPanel must offer PHP 8.2+ (MultiPHP Manager), Terminal or SSH (for Composer and `artisan`), and Cron Jobs. Cron: `* * * * * php /home/<user>/api/artisan schedule:run` to run backups and queued jobs (database queue, no Supervisor needed).
- Keep `/api` outside `public_html`; only `api/public` is web-visible. `.env` holds DB credentials and `APP_DEBUG=false`.

## Branding & design

The app is **WashNow**: cool off-whites everywhere, one deep "rinse blue" accent for actions, and a plain, sturdy look that reads like a working tool, not an AI template.

**Why blue**: it says water and clean at a glance, stays readable in bright sunlight at the bay, and works for buttons and links without needing a second colour. Red is reserved for voids/errors, green for "synced"; neither is a brand colour.

### Colour tokens

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | #F4F6F7 | Page background (cool off-white, slight blue-grey) |
| `surface` | #FFFFFF | Cards, inputs, sheets |
| `surface-alt` | #EBEEF0 | Table stripes, inactive tabs, grouped areas |
| `border` | #DCE1E4 | Dividers, input borders |
| `text` | #15202B | Main text |
| `text-muted` | #5B6770 | Labels, helper text |
| `accent` | #155EA6 | Primary buttons, active states, links, logo |
| `accent-pressed` | #0F4C87 | Pressed/hover state |
| `accent-tint` | #E3EEF8 | Selected category, highlight rows |
| `success` | #2E7D4F | Synced, closed day |
| `danger` | #B93A32 | Void, out-of-range price, errors |
| `warning` | #B7791F | Pending sync, override needed |

### Type and shape

- Headings: **Archivo** (600–700); body and UI: **Source Sans 3** (400/600). Both free on Google Fonts. Money uses tabular figures so columns line up.
- Corner radius 6 px on buttons and inputs, 8 px on cards. No pill-shaped everything.
- Flat surfaces with 1 px borders; at most one soft shadow on the bottom sheet/modal.
- Icons: one line-icon set (Lucide or Phosphor), same stroke width everywhere. No emoji as icons.
- Touch targets at least 48 px tall; the New Sale button is the biggest thing on the cashier home screen.

### Logo concept

A side-profile sedan in solid rinse blue, with a single arc of water spraying from a pressure-washer nozzle over the roof and a few drops on the far side. Wordmark "WashNow" in Archivo Bold, "Wash" in `text` and "Now" in `accent`. It must work in one colour and at 48 px as the app icon (icon version: car + spray arc only, on a #F4F6F7 square). No gradients, gloss, bubbles clusters or sparkle stars.

**Approved** on 9 Nov 2026: [WashNow Logo canvas](https://claude.ai/artifact/VMRuiGFKarjP4t5pAhDERm). It has the main lockup, the app icon (on #F4F6F7, 36 px corner radius at 168 px), a white-on-blue version, 48/32 px versions and a one-colour ink version for receipts. Export the marks as SVG into `web/public/brand/` and generate PWA icons (192, 512, maskable 512) from the app icon.

### AI-slop patterns banned in this project

| Don't | Do instead |
| --- | --- |
| Purple/indigo anything, purple-to-blue gradients | The tokens above only |
| Gradient text on headings or totals | Solid `text` colour; size and weight for emphasis |
| Inter, Roboto, Geist, system-default fonts | Archivo + Source Sans 3 |
| Glassmorphism, backdrop blur, neon glow | Flat surfaces, 1 px borders |
| Centred hero + three icon cards in a row | Screens built around the task: New Sale form, today's list, totals |
| Default shadcn/Tailwind look with huge radius | 6–8 px radius, custom tokens |
| Dark mode with glowing accents as the default | Light theme first (sunlight readability); dark mode later if asked |
| Warm cream + terracotta "less-AI" look | Cool whites + one blue |
| Emoji as icons, "01 / 02 / 03" markers on non-steps | One icon set; numbers only for real sequences |
| Decorative animations, scroll effects | Only feedback motion: save confirmation, sync spinner |

These tokens and rules go into a `DESIGN.md` at the repo root so every stage builds from the same values. Sources: [prg.sh](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website), [Capital and Compute](https://capitalandcompute.net/blog/fix-ai-slop-design/), [Noqta](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026).

## Data model

Every synced table has `id` (UUID), `branch_id`, `created_at`, `updated_at`, `deleted_at` (soft delete), and `version` (integer, increments on every change). Money is stored as integer pesewas to avoid rounding errors.

| Table | Key fields |
| --- | --- |
| branches | name, location, phone |
| users | name, phone, pin\_hash, role (owner/cashier), branch\_id, active |
| vehicle\_categories | name, min\_price, max\_price, pricing\_note, sort\_order, active |
| washers | name, phone, commission\_percent, active |
| customers | plate\_number (unique per branch), name, phone, visit\_count, total\_spent, notes |
| sales | category\_id, customer\_id?, plate\_number, service\_note, amount, payment\_method (cash/momo), recorded\_by, sold\_at, status (active/voided), void\_reason, override\_reason |
| sale\_washers | sale\_id, washer\_id, commission\_percent (snapshot), commission\_amount |
| expenses | category (soap/water/fuel/electricity/other), amount, payment\_method, note, spent\_at, recorded\_by |
| day\_closings | date, totals snapshot (JSON), closed\_by, closed\_at |
| audit\_logs | user\_id, action, table, record\_id, before (JSON), after (JSON), at |

Washers are not app users: attendants pick which washer(s) did the car. Washer commission % changes are recorded in `audit_logs`; pay is always read from `sale_washers` snapshots.

## Offline sync design

The device is always the first place a record is written; the server is caught up later through an outbox (push) and a change feed (pull).

1. **Write locally**: a new sale is saved to Dexie with a device-generated UUID and also added to an `outbox` table (`op`, `table`, `record`, `attempts`). The UI updates instantly.
2. **Push**: when `navigator.onLine` is true (and every 30 s while online), the app sends outbox items in batches of 50 to `POST /api/sync/push`. The server upserts by UUID inside a transaction and returns accepted IDs plus any rejected ones with reasons. Accepted items leave the outbox.
3. **Pull**: the app calls `GET /api/sync/pull?since=<cursor>`; the server returns all records with `updated_at` after the cursor (including soft-deleted ones) and a new cursor. The app writes them into Dexie.
4. **Idempotency**: pushing the same UUID twice is harmless (upsert), so a dropped connection mid-sync never duplicates a sale.

**Conflict rules**

| Record | Rule |
| --- | --- |
| Sales, expenses | Append-only; edits only by owner. Higher `version` wins; ties go to server. |
| Voids | A void always wins over an edit. |
| Customers | Field-level merge; `visit_count` and `total_spent` are recalculated on the server, never synced as raw values. |
| Settings (categories, washers, %) | Owner-only, server wins. |
| Closed days | Server rejects any new or edited record dated inside a closed day; the app shows it in a "needs owner review" list. |

**Login offline**: first login needs internet. After that, the Sanctum token and a hashed PIN are stored on the device so the attendant can unlock with a 4-digit PIN offline. Switching users on a shared laptop uses the PIN too.

**UI signals**: header badge shows Online/Offline and the number of unsynced records; a "Sync now" button forces a push/pull.

## Prompt stages for Claude Opus 5.5

Run these in order, one stage per conversation (or per Claude Code session). Paste Stage 0 into the Project instructions (or CLAUDE.md in Claude Code) so every stage shares the same context. Don't start a stage until the previous one passes its checks.

### Stage 0 — Project context (paste once)

```text
You are building "WashNow", an offline-first sales record app for a car washing bay in Ghana.
Stack: Laravel 12 API + MySQL + Sanctum in /api; React 18 + Vite + TypeScript + Tailwind + Dexie.js + vite-plugin-pwa in /web.
Rules:
- All synced tables use UUID v7 primary keys generated on the client, plus branch_id, version, created_at, updated_at, deleted_at.
- Money is stored as integer pesewas; display as GH₵ with 2 decimals. Timezone Africa/Accra.
- Roles: owner (full access) and cashier (record sales/expenses/customers only).
- Sales are never deleted, only voided with a reason. Washer commission % is snapshotted on each sale.
- Every price must be inside its vehicle category's min-max range unless an owner override reason is given.
- The app must work fully offline; the server is synced through /api/sync/push and /api/sync/pull.
Deliver complete, runnable files (no placeholders or "...rest of code"), with exact file paths and the commands to run. Write Pest tests for backend logic.
Hosting: API on cPanel at api.<domain> (Sanctum bearer tokens, CORS limited to the frontend origin); PWA on Cloudflare Pages at a different domain.
Design: follow DESIGN.md exactly (colour tokens, Archivo + Source Sans 3, 6-8px radius, flat surfaces). Never use purple/indigo, gradients, gradient text, glassmorphism, glow, Inter/Roboto, emoji icons, or a centred hero with three icon cards.
```

### Stage 1 — Backend foundation

```text
Stage 1: Create the Laravel project in /api.
- Migrations + Eloquent models for: branches, users, vehicle_categories, washers, customers, sales, sale_washers, expenses, day_closings, audit_logs (fields as in the data model I'll paste below).
- A HasUuidSync trait (UUID v7 keys, version increment on update, soft deletes).
- Seeders: one branch, one owner user, and these categories (min-max GH₵): Sedan 15-100, SUV 20-150, Bus 40-200, Pickup 40-200, Tipper/Container 100-400, Heavy-duty machine 40-400.
- Sanctum auth: login with phone + PIN, logout, me. Role middleware (owner, cashier).
- config/cors.php allowing only the frontend origin from .env (FRONTEND_URL).
- Also create DESIGN.md at the repo root from the Branding & design section I'll paste.
Give me the setup commands and how to verify with php artisan migrate:fresh --seed.
```

Check: migrations run, seed data present, login returns a token.

### Stage 2 — Business logic API

```text
Stage 2: Build the REST API and business rules.
- CRUD for categories, washers, customers (owner-only for settings).
- Sales: create with price-range validation, override reason (owner only), washer split with commission snapshot, void with reason. Recalculate customer visit_count/total_spent.
- Expenses CRUD. Day closing endpoint that snapshots totals and locks that date.
- Audit log observer on all models.
- Pest tests for: out-of-range price rejected, commission snapshot, split between 2 washers, void flow, closed-day lock, cashier blocked from owner routes.
```

Check: all tests pass.

### Stage 3 — Sync endpoints

```text
Stage 3: Implement POST /api/sync/push and GET /api/sync/pull exactly as in this design: [paste the Offline sync design section].
- Push: batch upsert by UUID in a transaction, apply conflict rules, return accepted and rejected (with reasons).
- Pull: return changed records per table since a cursor (include soft-deleted), plus the new cursor. Scope to the user's branch.
- Pest tests: duplicate push is idempotent, higher version wins, void beats edit, closed-day rejection, pull returns deletes.
```

### Stage 4 — PWA shell + offline data layer

```text
Stage 4: Create the React PWA in /web.
- Vite + TS + Tailwind + React Router + vite-plugin-pwa (installable, offline app shell, theme colour #155EA6, background #F4F6F7). Generate the 192/512/maskable icons from web/public/brand/washnow-icon.svg (I'll add the file).
- Dexie schema mirroring the server tables + an outbox table.
- A data layer (repositories) where every write goes to Dexie + outbox; a SyncService that pushes/pulls on reconnect, every 30 s, and on a "Sync now" button; exponential backoff on failures.
- Online/offline badge with unsynced count.
- Auth: first login online; then store token + hashed PIN for offline PIN unlock and user switching.
```

Check: in Chrome DevTools set Network → Offline; the app still loads, logs a sale, and syncs when back online.

### Stage 5 — Attendant screens (mobile-first)

```text
Stage 5: Build the cashier screens, optimised for one-handed Android use.
- New Sale: big category buttons showing the price range, plate number with customer autocomplete, service note, amount with live range check, washer multi-select, Cash/MoMo toggle, Save. Target under 15 seconds per sale.
- Today: list of today's sales with totals (cash, MoMo, count).
- Add Expense, Add Customer.
- Void request flow (cashier requests, owner approves).
```

### Stage 6 — Owner dashboard & reports

```text
Stage 6: Build the owner screens (laptop and phone).
- Dashboard: today vs yesterday, sales by category, cash vs MoMo, expenses, net, commission owed per washer (Recharts).
- Reports with date range: sales, by washer (commission pay sheet), by category, expenses vs income, top customers.
- Export to Excel and PDF (server-side, Laravel Excel + DomPDF).
- Settings: categories & ranges, washers & commission %, users & PINs, loyalty rule.
- Day close screen and "needs review" list for rejected sync items.
```

### Stage 7 — Hardening & deploy

```text
Stage 7: Prepare for production.
- Backend on cPanel: step-by-step guide to create the api subdomain with document root api/public, select PHP 8.2+ in MultiPHP, upload/clone /api outside public_html, run composer install --no-dev and php artisan migrate --force via Terminal, set .env (APP_DEBUG=false, FRONTEND_URL, DB credentials), enable AutoSSL, and add the schedule:run cron.
- Frontend on Cloudflare Pages: build settings for /web (npm run build, output dist), VITE_API_URL env var, custom domain, SPA fallback, and correct service-worker caching headers.
- Rate limiting, validation review, daily backups with spatie/laravel-backup to Google Drive, error logging.
- A GitHub Actions workflow that runs tests, and a short user manual for attendants and the owner.
```

**Tips for working with Opus**: paste the error output in full when something breaks; ask for "only the changed files" after Stage 1 to keep replies short; keep one conversation per stage so context stays clean.

## Testing, deployment and open questions

**Field test before launch**: run the app alongside the paper book for one week. Each evening, compare totals; any mismatch is a bug or a training gap.

- [ ] Two phones offline all morning, both log sales, reconnect — no duplicates, totals match
- [ ] Phone loses signal mid-sync — no lost or doubled records
- [ ] Cashier cannot see profit, change ranges, or delete
- [ ] Commission pay sheet matches a hand calculation for one week
- [ ] App installs on a low-end Android phone and stays fast with 5,000+ sales stored

**Deployment**: API and MySQL on cPanel (`api.<your-domain>`), PWA on Cloudflare Pages auto-deployed from GitHub, daily database backups to off-server storage (e.g. Google Drive via spatie/laravel-backup), plus cPanel's own backups.

### Open questions

- [ ] Should commission be split equally when 2+ washers work one car, or by a ratio the cashier picks?
- [ ] Loyalty rule: free/discounted wash after how many visits, or no loyalty yet?
- [ ] Do customers need receipts (SMS, WhatsApp share, or printed)?
- [ ] Should cashiers see their own day's commission totals for washers?
- [ ] Which domain name, and is DNS at the registrar or moved to Cloudflare?
