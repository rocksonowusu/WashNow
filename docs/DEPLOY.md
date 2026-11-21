# Putting WashNow online

Two parts, in two places:

| Part | Where | Address (example) |
|---|---|---|
| API + database (`/api`) | cPanel | `https://api.<your-domain>` |
| The app itself (`/web`) | Cloudflare Pages | `https://app.<your-domain>` |

Replace `<your-domain>` everywhere with your real domain (for example `washnow.com.gh`),
and `<cpuser>` with your cPanel username.

**No domain of your own?** You can still go live for free:

- **API:** create a subdomain of a domain the cPanel account already has, for example
  `washnow-api.<account-domain>`. Use that wherever this guide says `api.<your-domain>`.
  If the cPanel server is also the DNS server for that domain, the subdomain works as soon
  as you create it. Otherwise whoever runs the domain's DNS must add an A record for it.
- **App:** use the free `https://<project>.pages.dev` address from step 8, and skip step 9.
  **Pick the project name carefully.** Phones keep their offline data under the app's exact
  address. If you move to another address later, every phone starts empty and has to sign
  in again, and anything not yet synced is stranded on the old address. The API's address,
  by contrast, can change at any time: update `VITE_API_URL` and redeploy.

Do the steps in order. The API goes first because the app needs its address.

---

## 0. Before you start

Check that your cPanel has:

- [ ] **PHP 8.3 or newer** (cPanel → *MultiPHP Manager* lists the versions)
- [ ] **Terminal** (cPanel → *Advanced → Terminal*) or SSH
- [ ] **MySQL 8** (or MariaDB 10.6+)
- [ ] **AutoSSL** (cPanel → *SSL/TLS Status*)

If one is missing, ask the host to turn it on before going further.

**Sharing a cPanel account with another app is fine.** WashNow lives in its own
folder, with its own domain, database and PHP version, and never touches the
other app's files. Only do it on an account you own or have written permission to use.

Commit and push everything to GitHub first. Both the server and Cloudflare take the code from there.

---

## 1. Create the API address

cPanel → **Domains** → **Create A New Domain**. On older cPanel this is *Subdomains*;
for a domain the account doesn't already have, it's *Addon Domains*.

- Domain: `api.<your-domain>`
- **Untick** "Share document root"
- Document root: `washnow/api/public`

That makes the address serve `/home/<cpuser>/washnow/api/public`, the only public
folder in Laravel. Everything else, including `.env`, stays out of reach of the web.

> **If `/public_html/` is fixed in front of the Document Root box**, the host only allows
> document roots inside `public_html`. Type `washnow-api` instead, which gives
> `public_html/washnow-api`. In step 4c you will swap that folder for a link to
> `~/washnow/api/public`, so the code itself still stays outside `public_html`.

> If your domain's DNS is somewhere else (for example the registrar or Cloudflare), add an
> **A record** there: `api` → your cPanel server's IP address. The IP is on the right
> of the cPanel home page as "Shared IP Address". If the DNS is on Cloudflare,
> set this record to **DNS only** (grey cloud), not proxied.

## 2. Choose PHP 8.3 for that address

1. cPanel → **MultiPHP Manager**: tick **only** `api.<your-domain>`, choose **PHP 8.3** (or newer), then **Apply**.
   Other domains on the account keep their own version. Don't change the account's default
   ("System PHP Version") if another app depends on it.
2. If cPanel has **Select PHP Version** (CloudLinux), make sure these extensions are ticked:
   `pdo_mysql, mbstring, openssl, tokenizer, xml, dom, ctype, fileinfo, curl, gd, zip, intl, bcmath`.

## 3. Create the database

cPanel → **MySQL Database Wizard**:

1. Database name: `washnow`. cPanel makes it `<cpuser>_washnow`.
2. User: `washnow` (becomes `<cpuser>_washnow`) with a long generated password. **Copy the password somewhere safe.**
3. Privileges: **ALL PRIVILEGES** → *Next Step*.

## 4. Put the code on the server

Open cPanel → **Terminal**.

**a. Check the command-line PHP.** It can differ from the one picked in step 2:

```bash
php -v
```

If it says lower than 8.3, list the versions the server has:

```bash
for p in /opt/cpanel/ea-php8*/root/usr/bin/php /opt/alt/php8*/usr/bin/php; do [ -x "$p" ] && echo "$p -> $($p -r 'echo PHP_VERSION;')"; done
```

Then add a `php83` command that uses the 8.3 (or newer) one. Don't redefine plain `php`,
because other apps on the account may depend on it. Use the path the list printed:

```bash
cat >> ~/.bashrc <<'EOF'

# WashNow: PHP 8.3 and Composer, without changing the account's default php
alias php83='/opt/cpanel/ea-php83/root/usr/bin/php'
alias composer83='/opt/cpanel/ea-php83/root/usr/bin/php -d allow_url_fopen=On -d memory_limit=-1 ~/bin/composer.phar'
EOF
source ~/.bashrc
```

From here on, wherever this guide says `php`, type `php83`, and type `composer83` for `composer`.

**b. Let the server read the GitHub repo.** Skip this if the repo is public.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/washnow_deploy -N "" -C "washnow server"
cat ~/.ssh/washnow_deploy.pub
```

Copy the line it prints. On GitHub, open the repo → **Settings → Deploy keys → Add deploy key**,
paste it, and leave "Allow write access" **unticked**. Then give the key its own name, `github-washnow`,
so it never gets mixed up with a key another app on the account uses for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-washnow
  HostName github.com
  User git
  IdentityFile ~/.ssh/washnow_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

**c. Download the code** into `~/washnow`, which is outside `public_html` and apart from any other app's folders.

If step 1 made cPanel create an empty `~/washnow/api/public` folder, remove it first, because
`git clone` refuses to download into a folder that isn't empty. `rmdir` only removes empty
folders, so it can't delete anything by mistake:

```bash
cd ~
find ~/washnow            # should list only washnow, washnow/api and washnow/api/public
rmdir ~/washnow/api/public ~/washnow/api ~/washnow
git clone github-washnow:rocksonowusu/WashNow.git washnow
# public repo instead: git clone https://github.com/rocksonowusu/WashNow.git washnow
```

**If the document root is `public_html/washnow-api`** (see the note in step 1), swap that empty
folder for a link to Laravel's public folder:

```bash
ls -A ~/public_html/washnow-api      # only cPanel's own bits: cgi-bin, .well-known, maybe .htaccess
mv ~/public_html/washnow-api ~/washnow-api-old      # moved aside, not deleted
ln -s ~/washnow/api/public ~/public_html/washnow-api
ls -l ~/public_html/washnow-api      # shows: washnow-api -> /home/<cpuser>/washnow/api/public
```

Then **open MultiPHP Manager again and re-apply PHP 8.3** to the API domain. The setting
lived in the folder you just moved aside, and without it the API would run on the account's
default PHP. MultiPHP writes a few lines into `api/public/.htaccess`. That's expected, so
leave them in place. Once the API works (step 7), you can delete `~/washnow-api-old`.

**d. Composer.** Check with `composer --version`. If it isn't there, install it just for your account.
`-d allow_url_fopen=On` turns on downloading for this one command, because many hosts switch it off:

```bash
mkdir -p ~/bin && cd ~/bin
curl -sS https://getcomposer.org/installer -o composer-setup.php
php83 -d allow_url_fopen=On composer-setup.php --filename=composer.phar && rm composer-setup.php
cd ~ && composer83 --version
```

## 5. Create the API's settings file (`.env`)

```bash
cd ~/washnow/api
cp .env.example .env
nano .env
```

Change these lines and leave the rest as they are:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.<your-domain>
APP_TIMEZONE=Africa/Accra

# The app's address on Cloudflare. No slash at the end. To list more than one, separate them with commas.
FRONTEND_URL=https://app.<your-domain>

# The real owner. Used once, by the seeder in step 6.
SEED_BRANCH_NAME="WashNow Main Bay"
SEED_OWNER_NAME="Your name"
SEED_OWNER_PHONE=02XXXXXXXX
SEED_OWNER_PIN=a 4-digit PIN that is not 1234

LOG_STACK=daily
LOG_LEVEL=warning

DB_HOST=localhost
DB_DATABASE=<cpuser>_washnow
DB_USERNAME=<cpuser>_washnow
DB_PASSWORD=the password from step 3
```

Save with **Ctrl+O**, **Enter**, **Ctrl+X**. Then lock the file so only your account can read it:

```bash
chmod 600 .env
```

## 6. Install

```bash
cd ~/washnow/api
composer install --no-dev --optimize-autoloader --no-interaction
php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --force
php artisan optimize
```

`db:seed` creates the branch, the owner, and the six vehicle types with their price ranges.
It's safe to run again, because it never overwrites what is already there.

**Now remove the PIN from `.env`.** Open it with `nano .env`, delete the `SEED_OWNER_PIN` line,
save, then run `php artisan optimize` again.

## 7. Turn on HTTPS

1. cPanel → **SSL/TLS Status** → tick `api.<your-domain>` → **Run AutoSSL**. It can take a few minutes.
2. cPanel → **Domains**: switch **Force HTTPS Redirect** on for `api.<your-domain>`.

**Check it:** open `https://api.<your-domain>/api/health` in a browser. You should see:

```json
{"status":"ok"}
```

If it shows an error page instead, see *When something goes wrong* at the bottom.

---

## 8. Put the app on Cloudflare Pages

1. Sign in at <https://dash.cloudflare.com>. A free account is enough.
2. **Workers & Pages → Create → Pages → Connect to Git.** Choose GitHub and allow access to the WashNow repo.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory (advanced) | `web` |

4. **Environment variables** → add `VITE_API_URL` = `https://api.<your-domain>`. No slash at the end.
5. **Save and Deploy.** When it finishes, the app is live at `https://<project>.pages.dev`.

The Node version comes from `web/.node-version`. Caching and security headers come from
`web/public/_headers`. Page links work without extra setup: Pages serves the app for every address.

## 9. Give the app its own address

Pages project → **Custom domains → Set up a custom domain** → `app.<your-domain>`.

- **DNS on Cloudflare:** it adds the record for you.
- **DNS elsewhere**, for example cPanel → *Zone Editor* when the domain's nameservers point at your host:
  add a **CNAME** record `app` → `<project>.pages.dev`, then press *Check DNS* on Cloudflare.

HTTPS is automatic.

## 10. Let the app talk to the API

`FRONTEND_URL` in `api/.env` must match the app's address exactly. If you are testing on the
`pages.dev` address first, allow both:

```dotenv
FRONTEND_URL=https://app.<your-domain>,https://<project>.pages.dev
```

Every time you change `.env`, run:

```bash
cd ~/washnow/api && php artisan optimize
```

---

## 11. First-day check

On a phone, open `https://app.<your-domain>`:

- [ ] Sign in with the owner phone number and PIN.
- [ ] Install it: Chrome menu → **Add to Home screen** (or **Install app**).
- [ ] In **Settings**, check the vehicle price ranges. Add the cashier's account with their own PIN.
- [ ] In **Crew**, add the washers and their pay rates.
- [ ] Record a test sale. Then turn on **airplane mode**, record another, and turn airplane mode off.
      Both should sync, and the sync badge should go back to "all saved".
- [ ] Void the two test sales, with the reason "test".
- [ ] Sign in on the cashier's phone and check that it can't see profit or settings.

Then run it next to the paper book for a week, as planned in `docs/PLAN.md`.

---

## Updating later

1. Push to `main` on GitHub. GitHub runs the tests (`.github/workflows/ci.yml`).
2. **The app:** Cloudflare rebuilds it by itself. Phones get the new version the next time they open it online.
3. **The API:** in cPanel Terminal, run:

   ```bash
   bash ~/washnow/api/deploy.sh
   # if command-line php is older than 8.3:
   PHP=/opt/cpanel/ea-php83/root/usr/bin/php bash ~/washnow/api/deploy.sh
   ```

   It downloads the new code, installs packages, updates the database and caches the settings.
   Phones keep working while it runs, because sales wait on the device and sync afterwards.

---

## Running more than one washing bay

Each bay's people only ever see their own bay. The person who runs WashNow is the
**admin**. The admin belongs to no bay: they don't record sales, and the app opens
straight on the **Washing bays** area. From there they can:

- add a bay together with its owner, and see every bay's takings this month side by side
- open a bay for its full figures for any dates (with Excel and PDF), its people (add
  owners and cashiers, give someone a new PIN, turn someone off or on), its details,
  and suspend it or turn it back on

Make someone the admin (they leave their bay; the bay and its records stay, and can be
given a new owner from the admin area), or create a new admin account:

```bash
cd ~/washnow/api && php83 artisan washnow:admin 0XXXXXXXXX
cd ~/washnow/api && php83 artisan washnow:admin 0XXXXXXXXX --name="Their name" --pin=1234
```

---

## When something goes wrong

| What you see | What to do |
|---|---|
| "500 Server Error" on the API | Read the newest file in `~/washnow/api/storage/logs/`. It is usually a typo in `.env` or a wrong DB password. Fix it, then run `php artisan optimize`. |
| The app says it can't reach the server; the browser console shows "CORS" | `FRONTEND_URL` doesn't match the app's address exactly (check `https`, spelling, and no slash at the end). Fix it, then run `php artisan optimize`. |
| Sign-in works, then everything says "Unauthenticated" | The server is dropping the `Authorization` header. Check that `~/washnow/api/public/.htaccess` exists. It ships with the code, so download it again if it's missing. |
| A page lists files, or shows "Index of /" | The document root isn't `washnow/api/public`. Fix it in step 1. |
| `composer` or `artisan` complains about the PHP version | Command-line PHP is older than 8.3. See step 4a. |
| "Too many wrong attempts" | PIN login locks for 15 minutes after 5 wrong tries from one phone. Wait it out. |
| "Too Many Requests" on the API | One user made more than 120 requests in a minute. It clears after a minute. |
| The phone still shows the old app after an update | Close the app fully and open it again while online. |

## Not done yet

- **Off-server daily backups** of the database, for example to Google Drive. Until then, take a backup
  from cPanel → *Backup* → "Download a MySQL Database Backup" at least weekly. The owner's phone
  also holds a full copy of the sales history.
- A short user guide for cashiers and the owner.
