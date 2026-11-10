Paste this as your first message in the Claude Code session:

---
Read CLAUDE.md and DESIGN.md. This session is scaffolding only — no features yet.

1. Check prerequisites and report versions: php -v (need 8.2+), composer -V, node -v (need 20+), npm -v, git --version, and whether MySQL is running. Stop and tell me what's missing if anything fails.
2. Create the Laravel app in /api (composer create-project laravel/laravel api). Run php artisan install:api for Sanctum. Add Pest. Configure .env for a local MySQL database named washnow (ask me for the DB username/password), timezone Africa/Accra, FRONTEND_URL=http://localhost:5173, and set config/cors.php to allow only FRONTEND_URL.
3. Create the React app in /web (Vite, react-ts template). Add Tailwind with the DESIGN.md colour tokens and fonts, React Router, Dexie, dexie-react-hooks, vite-plugin-pwa, lucide-react. Copy brand/*.svg into web/public/brand/. Add VITE_API_URL=http://localhost:8000 to web/.env.
4. Root files: .gitignore (vendor, node_modules, .env, dist), README.md with how to run both apps.
5. Add GET /api/health returning {"status":"ok"} and a plain WashNow page in /web that calls it and shows the result, styled with the tokens.
6. Run php artisan migrate, php artisan serve and npm run dev, confirm the page shows "ok", then tell me the exact commands to run it myself and a commit message.
---

After this works: commit, start a NEW session, and paste Stage 1 from docs/PLAN.md.
