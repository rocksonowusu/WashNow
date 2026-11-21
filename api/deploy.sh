#!/usr/bin/env bash
#
# Update the WashNow API on the cPanel server to the latest code on GitHub.
# Run it from cPanel Terminal (or SSH):
#
#   bash ~/washnow/api/deploy.sh
#
# It uses the server's PHP 8.3 or newer by itself, even when the plain `php`
# command is older (other apps on the account may need that). To choose one
# yourself:
#
#   PHP=/opt/cpanel/ea-php83/root/usr/bin/php bash ~/washnow/api/deploy.sh
#
# Phones keep working while this runs: anything they record waits on the
# device and syncs once the API is back.

set -euo pipefail

is_new_enough() {
    "$1" -r 'exit(version_compare(PHP_VERSION, "8.3.0", ">=") ? 0 : 1);' 2>/dev/null
}

if [ -z "${PHP:-}" ]; then
    PHP=php
    if ! is_new_enough php; then
        for candidate in /opt/cpanel/ea-php8{9,8,7,6,5,4,3}/root/usr/bin/php /opt/alt/php8{9,8,7,6,5,4,3}/usr/bin/php; do
            if [ -x "$candidate" ] && is_new_enough "$candidate"; then
                PHP="$candidate"
                break
            fi
        done
    fi
fi

COMPOSER="${COMPOSER_BIN:-$(command -v composer || echo "$HOME/bin/composer.phar")}"
API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$API_DIR"

if ! is_new_enough "$PHP"; then
    echo "WashNow needs PHP 8.3 or newer, but '$PHP' is $("$PHP" -r 'echo PHP_VERSION;')." >&2
    echo "Run again with PHP=/path/to/php83 (see the top of this file)." >&2
    exit 1
fi

if [ ! -f .env ]; then
    echo "api/.env is missing. Create it first (docs/DEPLOY.md, step 4)." >&2
    exit 1
fi

echo "==> Fetching the latest code"
git -C "$API_DIR/.." pull --ff-only

echo "==> Putting the API into maintenance mode"
"$PHP" artisan down --retry=30 || true
# Whatever happens below, bring the API back up at the end.
trap '"$PHP" artisan up' EXIT

echo "==> Installing PHP packages (with $("$PHP" -r 'echo PHP_VERSION;'))"
# Composer needs to download, which some hosts turn off for PHP in general;
# it is switched on for this one command only.
"$PHP" -d allow_url_fopen=On -d memory_limit=-1 "$COMPOSER" install --no-dev --optimize-autoloader --no-interaction --no-progress

echo "==> Updating the database"
"$PHP" artisan migrate --force

echo "==> Caching config and routes for speed"
"$PHP" artisan optimize:clear
"$PHP" artisan optimize

echo "==> Done. Check: $(grep -E '^APP_URL=' .env | cut -d= -f2- | tr -d '"')/api/health"
