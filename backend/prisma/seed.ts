// Initial data: master data + the Chittagong layout drawn from the 15 Oct 2026 site visit.
// Safe to run again: it only adds what is missing and never overwrites edits made in the app.
// Sizes, areas and the Block A grid are ESTIMATES until measured — adjust them in Warehouse Setup.
//
//   npx prisma db seed

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { CellUse, PrismaClient } from '../src/generated/prisma/client.js';
import { autoLengthCells } from '../src/domain/geometry.js';
import { plateLabel } from '../src/domain/layout.js';
import { loadStructure, nextSequence, syncLayout } from '../src/setup/layout-sync.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const CATEGORIES = [
  { code: 'pump', name: 'Water Pumps', idRule: 'GENERATED' as const },
  { code: 'car', name: 'Cars', idRule: 'VIN' as const },
];

const PRODUCTS = [
  { sku: 'PDR-PQM60', name: 'Pedrollo PQm 60 Peripheral Pump 0.5HP', cat: 'pump', brand: 'Pedrollo', l: 30, w: 20, h: 25, kg: 6, reorder: 15 },
  { sku: 'PDR-PQM81', name: 'Pedrollo PQm 81 Peripheral Pump 1HP', cat: 'pump', brand: 'Pedrollo', l: 34, w: 22, h: 28, kg: 11, reorder: 10 },
  { sku: 'PDR-2CPM25', name: 'Pedrollo 2CPm 25/14B Twin-Impeller Pump 1.5HP', cat: 'pump', brand: 'Pedrollo', l: 50, w: 30, h: 40, kg: 27, reorder: 6 },
  { sku: 'PDR-HFM50', name: 'Pedrollo HFm 50B Centrifugal Pump 1HP', cat: 'pump', brand: 'Pedrollo', l: 45, w: 28, h: 38, kg: 22, reorder: 6 },
  { sku: 'PDR-4SR1', name: 'Pedrollo 4SR 1HP Submersible Pump', cat: 'pump', brand: 'Pedrollo', l: 20, w: 20, h: 115, kg: 38, reorder: 4 },
  { sku: 'HCP-JET05', name: 'HCP Self-Priming Jet Pump 0.5HP', cat: 'pump', brand: 'HCP', l: 40, w: 28, h: 32, kg: 12, reorder: 12 },
  { sku: 'HCP-DW10', name: 'HCP Deep-Well Submersible Pump 1HP', cat: 'pump', brand: 'HCP', l: 25, w: 25, h: 135, kg: 41, reorder: 4 },
  { sku: 'BGF-CP15', name: 'BgFLOW Centrifugal Pump 1.5HP', cat: 'pump', brand: 'BgFLOW', l: 48, w: 30, h: 40, kg: 24, reorder: 6 },
  { sku: 'SUB-FOR20', name: 'Subaru Forester 2.0i-L', cat: 'car', brand: 'Subaru', l: 464, w: 182, h: 173, kg: 1550, reorder: 4, vehicle: true },
  { sku: 'SUB-XV16', name: 'Subaru XV 1.6i-L EyeSight', cat: 'car', brand: 'Subaru', l: 448, w: 180, h: 160, kg: 1350, reorder: 4, vehicle: true },
  { sku: 'SUB-OUT25', name: 'Subaru Outback 2.5i', cat: 'car', brand: 'Subaru', l: 487, w: 184, h: 168, kg: 1650, reorder: 3, vehicle: true },
];

const RACK_TYPES = [
  { name: 'Type A', lengthCm: 300, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 400 },
  { name: 'Type B', lengthCm: 400, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 300 },
  { name: 'Type C', lengthCm: 500, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 250 },
];
const PLATE_TYPES = [
  { name: 'Floor pallet', lengthCm: 120, widthCm: 100, floorStackHeightCm: 150, capKg: 1000 },
  { name: 'Shelf plate', lengthCm: 60, widthCm: 50, floorStackHeightCm: 0, capKg: 120 },
];

const WAREHOUSES = [
  { code: 'CTG', name: 'Chittagong', address: 'PNL Service Centre, A K Khan Jute Mills Circle, Pahartali, Chattogram', landmark: 'Opposite Bandargaon Filling Station', areaSqft: 26386, status: 'ACTIVE' as const },
  { code: 'DHK', name: 'Dhaka', address: 'PNL Service Center, Holding 11/27/17, Banasree Housing Society, Meradia, Dhaka-1219', landmark: 'After Meradia Bazar, opposite Banasree Filling Station', areaSqft: 6000, status: 'PLANNED' as const },
];

/** Chittagong blocks. `storage` lists [row, fromCol, toCol] runs; every other cell gets `fill`. */
const CTG_BLOCKS = [
  { code: 'A', name: 'Block A', areaSqft: 1194, rows: 11, cols: 7, clearHeightCm: 400, note: 'Racks + floor pallets · water pumps', fill: 'PASSAGE' as CellUse,
    storage: [[1, 1, 4], [3, 2, 6], [4, 2, 5], [6, 1, 6], [7, 2, 6], [9, 2, 5], [11, 2, 5]] },
  { code: 'B', name: 'Block B', areaSqft: 2250, rows: 3, cols: 5, clearHeightCm: 300, note: 'Cars on left side · passage on right', fill: 'STORAGE' as CellUse,
    passage: [[1, 5, 5], [2, 5, 5], [3, 5, 5]] },
  { code: 'C', name: 'Block C', areaSqft: 3600, rows: 6, cols: 4, clearHeightCm: 300, note: 'Car parking · 4 cars per row (rows to verify)', fill: 'STORAGE' as CellUse },
  { code: 'D', name: 'Block D', areaSqft: 4200, rows: 7, cols: 4, clearHeightCm: 300, note: 'Car parking · 4 cars per row (~7 rows, to verify)', fill: 'STORAGE' as CellUse },
];

/** Racks in Block A (rows 2+3 and 4+5 stand back-to-back). Length comes from the rack type. */
const CTG_RACKS = [
  { type: 'Type A', row: 1, bays: 3, merged: [] as number[] },
  { type: 'Type B', row: 3, bays: 4, merged: [] },
  { type: 'Type B', row: 4, bays: 4, merged: [3] }, // S3+S4 merged for the tall submersible pumps
  { type: 'Type C', row: 6, bays: 5, merged: [] },
  { type: 'Type C', row: 7, bays: 0, merged: [] }, // shelf only
];

async function main() {
  for (const c of CATEGORIES) await prisma.category.upsert({ where: { code: c.code }, update: {}, create: c });
  const cats = new Map((await prisma.category.findMany()).map((c) => [c.code, c.id]));
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: p.sku }, update: {},
      create: { sku: p.sku, name: p.name, categoryId: cats.get(p.cat)!, brand: p.brand, lengthCm: p.l, widthCm: p.w, heightCm: p.h, weightKg: p.kg, reorderPoint: p.reorder, stackable: !p.vehicle },
    });
  }
  for (const t of RACK_TYPES) await prisma.rackType.upsert({ where: { name: t.name }, update: {}, create: t });
  for (const t of PLATE_TYPES) await prisma.plateType.upsert({ where: { name: t.name }, update: {}, create: t });
  const rackTypes = new Map((await prisma.rackType.findMany()).map((t) => [t.name, t]));
  const plateTypes = new Map((await prisma.plateType.findMany()).map((t) => [t.name, t]));

  for (const w of WAREHOUSES) {
    await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: w });
    await prisma.$transaction(async (tx) => syncLayout(tx, await loadStructure(tx, w.code)), { timeout: 60_000 });
  }

  const ctg = await prisma.warehouse.findUniqueOrThrow({ where: { code: 'CTG' }, include: { _count: { select: { blocks: true } } } });
  if (ctg._count.blocks > 0) {
    console.log('Chittagong already has blocks — layout left as it is.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    const blockIds = new Map<string, string>();
    for (const b of CTG_BLOCKS) {
      const block = await tx.block.create({
        data: { warehouseId: ctg.id, code: b.code, name: b.name, areaSqft: b.areaSqft, rows: b.rows, cols: b.cols, clearHeightCm: b.clearHeightCm, note: b.note },
      });
      blockIds.set(b.code, block.id);
      const use = (r: number, c: number): CellUse => {
        if (b.storage?.some(([row, c1, c2]) => row === r && c >= c1 && c <= c2)) return 'STORAGE';
        if (b.passage?.some(([row, c1, c2]) => row === r && c >= c1 && c <= c2)) return 'PASSAGE';
        return b.fill;
      };
      const cells = [];
      for (let r = 1; r <= b.rows; r++) for (let c = 1; c <= b.cols; c++) cells.push({ blockId: block.id, row: r, col: c, use: use(r, c) });
      await tx.gridCell.createMany({ data: cells });
    }

    const blockA = CTG_BLOCKS[0];
    const rackIds = new Map<string, string>();
    for (const [i, r] of CTG_RACKS.entries()) {
      const t = rackTypes.get(r.type)!;
      const code = `RK${i + 1}`;
      const rack = await tx.rack.create({
        data: {
          warehouseId: ctg.id, blockId: blockIds.get('A')!, code, name: `Rack ${i + 1}`, rackTypeId: t.id,
          startRow: r.row, startCol: 2, direction: 'ROW', lengthCells: autoLengthCells(t.lengthCm, blockA), bays: r.bays, mergedShelves: r.merged,
        },
      });
      rackIds.set(code, rack.id);
    }

    // Plates: beside racks (the old "side spaces"), on floor rows 9 and 11, and inside shelves.
    const pallet = plateTypes.get('Floor pallet')!, shelfPlate = plateTypes.get('Shelf plate')!;
    const plates: Array<{ type: string; rackCode?: string; shelfLevel?: number; bay?: number; row?: number; col?: number }> = [
      ...[[1, 1], [3, 6], [6, 1]].map(([row, col]) => ({ type: pallet.id, row, col })),
      ...[2, 3, 4, 5].flatMap((col) => [{ type: pallet.id, row: 9, col }, { type: pallet.id, row: 11, col }]),
      ...[1, 2].map((bay) => ({ type: shelfPlate.id, rackCode: 'RK2', shelfLevel: 1, bay })),
      ...[1, 2].flatMap((shelfLevel) => [0, 1, 2].map(() => ({ type: shelfPlate.id, rackCode: 'RK5', shelfLevel, bay: 0 }))),
    ];
    const last = await nextSequence(tx, 'PLATE:CTG', plates.length);
    await tx.plate.createMany({
      data: plates.map((p, i) => ({
        warehouseId: ctg.id, label: plateLabel('CTG', last - plates.length + 1 + i), plateTypeId: p.type,
        ...(p.rackCode
          ? { rackId: rackIds.get(p.rackCode)!, shelfLevel: p.shelfLevel!, bay: p.bay! }
          : { blockId: blockIds.get('A')!, cellRow: p.row!, cellCol: p.col! }),
      })),
    });

    await syncLayout(tx, await loadStructure(tx, 'CTG'));
  }, { timeout: 120_000 });

  const counts = await prisma.location.groupBy({ by: ['kind'], where: { warehouseId: ctg.id }, _count: true });
  console.log('Chittagong layout created. Locations:', Object.fromEntries(counts.map((c) => [c.kind, c._count])));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
