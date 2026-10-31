# Azneo WMS

Warehouse Management System for the group's warehouses (Chittagong live, Dhaka planned), operated by Azneo Limited.
The clickable prototype in `../wms-prototype.html` is the reference for screens, flows and rules.

| Folder      | What                                                                 |
|-------------|----------------------------------------------------------------------|
| `backend/`  | API — NestJS 12, TypeScript, Prisma 7, PostgreSQL                    |
| `frontend/` | Web app — React 19, Vite, TypeScript                                 |

## Backend

```bash
cd backend
cp .env.example .env            # then fill in DATABASE_URL (never commit .env)
npm install
npx prisma generate             # build the typed DB client into src/generated/prisma
npx prisma migrate deploy       # create/update tables on the database in .env
npm run start:dev               # API on http://localhost:3000/api
```

Check the connection: `GET http://localhost:3000/api/health` → `"database": "ok"`.

First-time data: `npx prisma db seed` — products, rack/plate types, Chittagong layout (blocks A–D, 5 racks, 19 plates) and Dhaka (planned, no layout). Safe to re-run; it never overwrites edits.

Tests: `npm test` (business rules, no DB) · `npm run test:e2e` (API — **wipes and re-seeds the `_test` database** named in `TEST_DATABASE_URL`; refuses any other name).

### Setup API (module 1)

| Step | Endpoints |
|---|---|
| 1 Warehouse | `GET/POST /api/warehouses`, `PATCH /api/warehouses/:wh`, `GET /api/warehouses/:wh/structure` |
| 2–3 Blocks & grid | `POST /api/warehouses/:wh/blocks`, `PATCH …/blocks/:block`, `PUT …/blocks/:block/cells` |
| 4 Types | `GET/POST /api/rack-types`, `GET/POST /api/plate-types` |
| 5 Racks | `GET …/racks/suggest`, `POST …/racks`, `PATCH/DELETE …/racks/:rack` |
| 6 Plates | `GET …/plates/suggest-floor`, `POST …/plates`, `DELETE …/plates/:label` |

### Logins and roles (module 3)

Every request needs a login token (`POST /api/auth/login`), except `GET /api/health`. Roles — kept simple, no approval workflows:

| Role | Can do | Warehouses |
|---|---|---|
| Admin | everything, manages users | all |
| Warehouse Manager | stock movement + warehouse setup | assigned only |
| Store Keeper | receive, put-away, move, dispatch, bay boards | assigned only |
| Management | view dashboards, stock, challans (read-only) | all |

- The server enforces it (`src/auth/auth.guard.ts`): changes need an explicit `@Allow(...)` (deny by default), `:wh` routes check the
  user's warehouses, and the user is reloaded on every request so deactivation or a role change applies at once.
- "Received by / dispatched by" comes from the login (name + user id on every document and history entry), never from the client.
- Passwords: scrypt-hashed; 5 failed logins lock that username for 15 minutes; tokens last 12 hours (`JWT_SECRET` in `.env`).
- First Admin: `npx prisma db seed` creates `admin` when there are no users (password from `INITIAL_ADMIN_PASSWORD`, or generated and printed once). The Admin creates everyone else under **Users**.

### Products and Excel import (module 4)

- `GET /api/products?q=` searches SKU, name, brand **and alias codes 1–3**; `GET /api/products/:code` finds by SKU or alias.
  Scan & Lookup, the Stock page and the Receive product picker also match alias codes.
- Admin only (IT): `GET /api/products/export` (current catalogue as .xlsx; `?empty=1` = template), `POST /api/products/import/preview`
  (upload → row-by-row result, nothing saved), `POST /api/products/import` (all rows or none; refused while any row has an error),
  `POST /api/products`, `PATCH /api/products/:sku`.
- Rules (`src/domain/products.ts`): an existing SKU in the file **updates** that product; alias codes are optional, upper-cased,
  unique across all products (enforced by the `product_aliases` table's primary key) and never equal to another SKU; one upload may
  swap aliases between products; a new category name creates the category. Stock and history are never touched by an import.

### Stock movement API (module 2)

| Flow | Endpoints |
|---|---|
| Receive (IN) | `POST /api/warehouses/:wh/receipts` — one challan per delivery; unit IDs `SKU-0001…` or VINs |
| Put-away | `GET …/putaway` (waiting groups), `POST …/suggest` (best locations + best quantity), `POST …/putaway` |
| Move | `POST …/transfers` — Transfer Slip; unit IDs never change |
| Dispatch (OUT) | `POST …/dispatches` — one challan per receiver |
| Records | `GET …/dashboard`, `…/stock`, `…/stock/:sku`, `…/documents`, `/api/documents/:no`, `/api/units/:uid`, `…/positions/:code`, `…/scan?code=` |
| Bay boards | `GET …/boards`, `POST …/boards/:code/updated` (`*` = all) |

Every movement is one transaction: the units and the target location/shelf are locked (`FOR UPDATE`), space and the
shelf weight limit are re-checked against what is there at that moment, then the document, units, history and bay-board
flags are written together. Two people can't overload one shelf at the same time (covered by an e2e test).

Every structural change is checked against the stock already placed (`src/domain/change.ts`) and refused with a 409 and a plain message ("Stock is still in A-RK3-S3-B1 — move it first") if unsafe.

### Where things live

- `prisma/schema.prisma` — data model: warehouse → block → grid cells → rack (from a rack type) → shelf → bay → plate; units, challans, movement history.
- `prisma/migrations/` — every schema change as SQL. Never change tables by hand on the server.
- `src/domain/` — business rules, pure and unit-tested:
  - `geometry.ts` — cell size, rack length in cells, shelf merging, weight bands
  - `fit.ts` — can these units go here? (space **and** shelf weight limit)
  - `layout.ts` — structure → shelves, locations and bay boards; placement checks; numbering

### Database rules worth knowing

- A unit's location is a foreign key with `ON DELETE RESTRICT`: a location holding stock can't be removed by a layout change.
- Challan numbers, plate labels and unit serials come from the `sequences` table, incremented inside the same transaction — no duplicates when two people save at once.
- Movement history stores from/to addresses as text, so it stays readable after the layout changes.

## Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (calls the API through Vite's /api proxy)
```

Pages: Dashboard `#/overview` · Receive `#/receive` · Put-away `#/putaway` · Move `#/move` · Dispatch `#/dispatch` ·
Layout & Racks `#/layout` · Bay Boards `#/boards` · Warehouse Setup `#/setup/<step>` · Stock `#/stock` · Scan & Lookup `#/lookup` · Challans `#/challans`.

Scanning: the scan boxes accept a handheld scanner (it types the code and presses Enter) or typing. QR contents:
units `AZWMS|U|<unit id>`, locations `AZWMS|L|<wh>|<code>`, documents `AZWMS|D|<no>`.

## Live server

Live on the company server, port 8101 (`E:\wms`, IIS site `azneo_wms` on 8101, service `azneo-wms-api` on 127.0.0.1:8102, updates with `deploy\update.ps1`): see [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Notes

- npm 10.9 on this machine hits an install bug; use `npx npm@11 install` if `npm install` fails with "edgesOut".
- `multer` is pinned to ≥ 2.5.0 via `overrides` (fixes a denial-of-service bug in older versions).
