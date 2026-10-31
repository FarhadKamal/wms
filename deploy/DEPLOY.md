# Live server: Azneo WMS

This brief is for the Claude session running on the live server. The user is Azneo's IT lead; ask them when this brief doesn't cover something.

The WMS has been live since 31 Oct 2026 on port **8101** of this server.

## How it is set up

| Part | Setup |
|---|---|
| Server | Windows Server 2022, Tencent Cloud. IIS also hosts other company apps |
| Code | `E:\wms`: a git clone of https://github.com/FarhadKamal/wms, branch `main` |
| Database | `azneo_wms` on the local PostgreSQL 18 (`localhost:5432`). Connects as `hris` for now; the plan is to switch to a `wms_app` role that owns only `azneo_wms` |
| Settings | `E:\wms\backend\.env`: `DATABASE_URL` (localhost), `PORT=8102`, `HOST=127.0.0.1`, `JWT_SECRET`. Git-ignored |
| API | Windows service **`azneo-wms-api`**: `node dist\main.js` in `E:\wms\backend`, on `127.0.0.1:8102`. Log: `E:\wms\backend\logs\api.log` |
| Web app | IIS site **`azneo_wms`** on port **8101**, serving `E:\wms\frontend\dist`. `dist\web.config` (from `frontend\public\web.config`) forwards `/api` to 8102 via URL Rewrite and ARR. ARR proxy is enabled server-wide; the IIS config was backed up first as `before-azneo-wms-20261031` |
| Firewall | Only 8101 is open. 8102 is internal |

## Rules

1. **Touch only WMS things:**
   - `azneo_wms`, and later `wms_app`;
   - `E:\wms`;
   - the site `azneo_wms`;
   - the service `azneo-wms-api`;
   - the 8101 firewall rule.

   **Never open, change or query any other database** (especially `hris_pedrollo`; `azneo_wms_dev` and `azneo_wms_test` belong to the development PC), site, app pool or service.
2. **Never expose 8102.**
3. **Secrets stay in `backend\.env`.** Never commit them or write them anywhere else.
4. **No code edits on the server.** Code comes only from GitHub `main`, pushed from the development PC. If something needs a code change, tell the user. Local edits make `git pull` fail.
5. **Ask the user before** installing software, changing server-wide IIS settings, or anything in the Tencent console.
6. **Don't run `npm run test:e2e` here.** It wipes and re-seeds `azneo_wms_test`, which belongs to the development PC.

## Updating to the latest code

```powershell
powershell -ExecutionPolicy Bypass -File E:\wms\deploy\update.ps1
```

The script:
1. `git pull --ff-only`;
2. builds the web app;
3. stops `azneo-wms-api`;
4. runs `npm ci`, `prisma generate`, the build and `prisma migrate deploy` (only adds to the database, never removes stock or history);
5. starts the service;
6. waits for `/api/health` = ok.

The API is down for about 1–2 minutes, so update outside working hours.

If the pull fails because of local changes, show the user `git status` and `git diff`. Don't discard anything without asking.

## Still open

- Create `wms_app` and switch `DATABASE_URL` to it. Needs the `postgres` password from the user.
- Daily `pg_dump` backup of `azneo_wms`, kept 30 days and copied off the server.
- Update Node.js to the latest 22 LTS (22.20.0 is installed; some packages want 22.22.3 or newer).
- HTTPS with a domain.
- Close PostgreSQL 5432 to the internet once nothing outside the server needs it.
