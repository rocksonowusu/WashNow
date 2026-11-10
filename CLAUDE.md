# WashNow — project instructions for Claude Code

You are building **WashNow**, an offline-first sales record app for a car washing bay in Ghana.
Full plan: `docs/PLAN.md`. Design rules: `DESIGN.md`. Read both before starting any stage.

## Stack
- `/api` — Laravel 13, PHP 8.3+ (8.4 locally), MySQL 8, Sanctum (bearer tokens), Pest tests
- `/web` — React 19 + Vite 8 + TypeScript + Tailwind 4 + Dexie.js + vite-plugin-pwa
- Tailwind 4 has no `tailwind.config`: the design tokens live in `web/src/index.css` under `@theme`.
- Local MySQL: database `washnow`, user `washnow` (created by `scripts/setup-db.ps1`). Never use or change the root account; other apps depend on it.

## Rules
- All synced tables use UUID v7 primary keys generated on the client, plus `branch_id`, `version`, `created_at`, `updated_at`, `deleted_at`.
- Money is stored as integer pesewas; display as GH₵ with 2 decimals. Timezone Africa/Accra.
- Roles: owner (full access) and cashier (record sales/expenses/customers only).
- Sales are never deleted, only voided with a reason. Washer commission % is snapshotted on each sale.
- Every price must be inside its vehicle category's min–max range unless an owner override reason is given.
- The app must work fully offline; the server is synced through `/api/sync/push` and `/api/sync/pull`.
- Hosting: API on cPanel at `api.<domain>` (Sanctum bearer tokens, CORS limited to the frontend origin); PWA on Cloudflare Pages at a different domain.
- Design: follow `DESIGN.md` exactly. Never use purple/indigo, gradients, gradient text, glassmorphism, glow, Inter/Roboto, emoji icons, or a centred hero with three icon cards.

## How to work
- Work one stage at a time (stages are in `docs/PLAN.md`). Show a short plan first, then build.
- Write complete, runnable files — no placeholders or "rest of code".
- Run the tests / dev servers yourself and fix failures before saying a stage is done.
- At the end of a stage: list what was built, how to verify it, and suggest a commit message.
- Ask before installing anything globally or changing anything outside this folder.
