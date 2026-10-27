// Bridges the database and the pure layout rules in src/domain:
// - loadStructure(): DB rows → StructureIn (what the rules understand)
// - syncLayout():    StructureIn → shelves, locations and bay boards in the DB (diffed, batched)
// Used by the setup service and by the seed script, always inside a transaction.

import { NotFoundException } from '@nestjs/common';
import { CellUse, Prisma } from '../generated/prisma/client.js';
import { UnitAt } from '../domain/change.js';
import { BlockIn, PlateIn, RackIn, StructureIn, planLayout } from '../domain/layout.js';

export type Tx = Prisma.TransactionClient;

export interface LoadedStructure {
  warehouse: { id: string; code: string; areaSqft: number };
  s: StructureIn;
  blockIds: Map<string, string>;
  rackIds: Map<string, string>;
  plateIds: Map<string, string>;
  /** block code → "row,col" → area name */
  areaNames: Map<string, Map<string, string>>;
}

export async function loadStructure(tx: Tx, code: string): Promise<LoadedStructure> {
  const wh = await tx.warehouse.findUnique({
    where: { code },
    include: {
      blocks: { include: { cells: true }, orderBy: { code: 'asc' } },
      racks: { include: { rackType: true, block: true }, orderBy: { createdAt: 'asc' } },
      plates: { include: { plateType: true, rack: true, block: true }, orderBy: { label: 'asc' } },
    },
  });
  if (!wh) throw new NotFoundException(`Warehouse ${code} not found`);

  const areaNames = new Map<string, Map<string, string>>();
  const blocks: BlockIn[] = wh.blocks.map((b) => {
    const cells = Array.from({ length: b.rows }, () => Array.from({ length: b.cols }, () => 'STORAGE' as CellUse));
    const names = new Map<string, string>();
    for (const c of b.cells) {
      if (c.row <= b.rows && c.col <= b.cols) cells[c.row - 1][c.col - 1] = c.use;
      if (c.areaName) names.set(`${c.row},${c.col}`, c.areaName);
    }
    areaNames.set(b.code, names);
    return { code: b.code, areaSqft: b.areaSqft, rows: b.rows, cols: b.cols, clearHeightCm: b.clearHeightCm, cells };
  });

  const racks: RackIn[] = wh.racks.map((r) => ({
    code: r.code, blockCode: r.block.code,
    type: { name: r.rackType.name, lengthCm: r.rackType.lengthCm, depthCm: r.rackType.depthCm, shelfCount: r.rackType.shelfCount, shelfHeightCm: r.rackType.shelfHeightCm, shelfCapKg: r.rackType.shelfCapKg },
    startRow: r.startRow, startCol: r.startCol, lengthCells: r.lengthCells, direction: r.direction, bays: r.bays, mergedShelves: r.mergedShelves,
  }));

  const plates: PlateIn[] = wh.plates.map((p) => ({
    label: p.label,
    type: { name: p.plateType.name, lengthCm: p.plateType.lengthCm, widthCm: p.plateType.widthCm, floorStackHeightCm: p.plateType.floorStackHeightCm, capKg: p.plateType.capKg },
    parent: p.rack
      ? { kind: 'POSITION', rackCode: p.rack.code, shelfLevel: p.shelfLevel ?? 0, bay: p.bay ?? 0 }
      : { kind: 'CELL', blockCode: p.block?.code ?? '', row: p.cellRow ?? 0, col: p.cellCol ?? 0 },
  }));

  return {
    warehouse: { id: wh.id, code: wh.code, areaSqft: wh.areaSqft },
    s: { blocks, racks, plates },
    blockIds: new Map(wh.blocks.map((b) => [b.code, b.id])),
    rackIds: new Map(wh.racks.map((r) => [r.code, r.id])),
    plateIds: new Map(wh.plates.map((p) => [p.label, p.id])),
    areaNames,
  };
}

/** Units currently placed (not dispatched) in the warehouse, with their location code and size. */
export async function loadUnitsAt(tx: Tx, warehouseId: string): Promise<UnitAt[]> {
  const units = await tx.unit.findMany({
    where: { warehouseId, status: { not: 'DISPATCHED' }, locationId: { not: null } },
    select: { uid: true, location: { select: { code: true } }, product: { select: { lengthCm: true, widthCm: true, heightCm: true, weightKg: true, stackable: true } } },
  });
  return units.map((u) => ({ uid: u.uid, locationCode: u.location!.code, product: u.product }));
}

const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(b).every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/** Make shelves, locations and bay boards in the DB match the structure. */
export async function syncLayout(tx: Tx, ctx: LoadedStructure): Promise<void> {
  const whId = ctx.warehouse.id;
  const plan = planLayout(ctx.s);

  // Shelves
  const oldShelves = await tx.shelf.findMany({ where: { rack: { warehouseId: whId } } });
  const shelfKey = (rackId: string, level: number) => `${rackId}|${level}`;
  const wantShelves = plan.shelves.map((s) => ({
    rackId: ctx.rackIds.get(s.rackCode)!, level: s.level, span: s.span, heightCm: s.heightCm, capKg: s.capKg,
  }));
  const oldShelfMap = new Map(oldShelves.map((s) => [shelfKey(s.rackId, s.level), s]));
  const newShelves = wantShelves.filter((s) => !oldShelfMap.has(shelfKey(s.rackId, s.level)));
  if (newShelves.length) await tx.shelf.createMany({ data: newShelves });
  for (const s of wantShelves) {
    const old = oldShelfMap.get(shelfKey(s.rackId, s.level));
    if (old && !same(old, s)) await tx.shelf.update({ where: { id: old.id }, data: s });
  }
  const shelfIds = new Map(
    (await tx.shelf.findMany({ where: { rack: { warehouseId: whId } }, select: { id: true, rackId: true, level: true } }))
      .map((s) => [shelfKey(s.rackId, s.level), s.id]),
  );

  // Locations
  const wantLocs = plan.locations.map((l) => {
    const rackId = l.rackCode ? ctx.rackIds.get(l.rackCode)! : null;
    return {
      warehouseId: whId, code: l.code, address: l.address, kind: l.kind,
      blockId: l.blockCode ? ctx.blockIds.get(l.blockCode)! : null,
      rackId,
      shelfId: rackId && l.shelfLevel != null ? shelfIds.get(shelfKey(rackId, l.shelfLevel))! : null,
      bay: l.bay, plateId: l.plateLabel ? ctx.plateIds.get(l.plateLabel)! : null,
      cellRow: l.cellRow, cellCol: l.cellCol,
      lengthCm: l.lengthCm, widthCm: l.widthCm, heightCm: l.heightCm, capKg: l.capKg, boardCode: l.boardCode,
    };
  });
  const oldLocs = await tx.location.findMany({ where: { warehouseId: whId } });
  const oldLocMap = new Map(oldLocs.map((l) => [l.code, l]));
  const wantCodes = new Set(wantLocs.map((l) => l.code));
  const stale = oldLocs.filter((l) => !wantCodes.has(l.code)).map((l) => l.id);
  // Remove stale first so a plate taking over a position's slot never clashes; units pin locations (RESTRICT).
  if (stale.length) await tx.location.deleteMany({ where: { id: { in: stale } } });
  const fresh = wantLocs.filter((l) => !oldLocMap.has(l.code));
  if (fresh.length) await tx.location.createMany({ data: fresh });
  for (const l of wantLocs) {
    const old = oldLocMap.get(l.code);
    if (old && !same(old, l)) await tx.location.update({ where: { id: old.id }, data: l });
  }

  // Shelves no longer used (after locations moved off them)
  const wantShelfKeys = new Set(wantShelves.map((s) => shelfKey(s.rackId, s.level)));
  const staleShelves = oldShelves.filter((s) => !wantShelfKeys.has(shelfKey(s.rackId, s.level))).map((s) => s.id);
  if (staleShelves.length) await tx.shelf.deleteMany({ where: { id: { in: staleShelves } } });

  // Bay boards
  const oldBoards = await tx.bayBoard.findMany({ where: { warehouseId: whId }, select: { id: true, code: true } });
  const wantBoards = new Set(plan.boards);
  const haveBoards = new Set(oldBoards.map((b) => b.code));
  const newBoards = plan.boards.filter((c) => !haveBoards.has(c)).map((code) => ({ warehouseId: whId, code }));
  if (newBoards.length) await tx.bayBoard.createMany({ data: newBoards });
  const staleBoards = oldBoards.filter((b) => !wantBoards.has(b.code)).map((b) => b.id);
  if (staleBoards.length) await tx.bayBoard.deleteMany({ where: { id: { in: staleBoards } } });
}

/** Atomically take the next n numbers of a counter; returns the last one. */
export async function nextSequence(tx: Tx, key: string, n = 1): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO sequences (key, last) VALUES (${key}, ${n})
    ON CONFLICT (key) DO UPDATE SET last = sequences.last + ${n}
    RETURNING last`;
  return rows[0].last;
}
