# WashNow

Offline-first sales record app for a car washing bay. Two apps live in this repo:

| Folder | What it is | Local address |
|---|---|---|
| `api/` | Laravel API (PHP, MySQL, Sanctum, Pest tests) | http://localhost:8000 |
| `web/` | React PWA (Vite, TypeScript, Tailwind, Dexie) | http://localhost:5173 |

Project rules are in `CLAUDE.md`, design rules in `DESIGN.md`, and the build plan in `docs/PLAN.md`.

## What you need

- PHP 8.3 or newer, with Composer
- Node 20 or newer, with npm
- MySQL 8, running

## First-time setup

### 1. Database

Create a database and a user that only WashNow uses. In a MySQL client, signed in as an admin:

```sql
CREATE DATABASE washnow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'washnow'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL PRIVILEGES ON washnow.* TO 'washnow'@'localhost';
```

### 2. API

```bash
cd api
composer install
cp .env.example .env
php artisan key:generate
```

Open `api/.env` and set `DB_PASSWORD` to the password you chose. Also set `SEED_OWNER_PHONE` and `SEED_OWNER_PIN`: they become the first owner's login. Then:

```bash
php artisan migrate --seed
```

This creates the tables, one branch, the owner and the six vehicle categories. To wipe the local database and start again, run `php artisan migrate:fresh --seed`.

On Windows, `scripts\setup-db.ps1` does step 1 and fills in `DB_PASSWORD` for you.

### 3. Web

```bash
cd web
npm install
cp .env.example .env
```

## Run it

Use two terminals.

```bash
cd api
php artisan serve
```

```bash
cd web
npm run dev
```

Open http://localhost:5173. The Setup check page should show the server as **ok**.

The API only accepts browser requests from `FRONTEND_URL` in `api/.env`, so the web app must stay on port 5173 unless you change both.

## Tests and checks

```bash
cd api
php artisan test
```

```bash
cd web
npm run build
npm run lint
```
