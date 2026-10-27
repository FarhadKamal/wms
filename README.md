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

Pages: Dashboard `#/overview` · Layout & Racks `#/layout` · Warehouse Setup `#/setup/<step>` (warehouse, blocks, grid, types, racks, plates).

## Notes

- npm 10.9 on this machine hits an install bug; use `npx npm@11 install` if `npm install` fails with "edgesOut".
- `multer` is pinned to ≥ 2.5.0 via `overrides` (fixes a denial-of-service bug in older versions).
