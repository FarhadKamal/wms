import { autoLengthCells, cellSideCm, rackCells, shelvesOf, weightBand } from './geometry.js';
import { fitCheck, LocationGeom, ProductDims } from './fit.js';
import {
  BlockIn, PlateTypeIn, RackIn, RackTypeIn, StructureIn,
  docNumber, firstRackSpot, floorPlateRoom, orphanPlates, planLayout, plateLabel,
  positionPlateRoom, rackPlacementProblem,
} from './layout.js';

// Chittagong Block A as built in the prototype: 11 × 7 grid, 1,194 sq ft (≈120 cm cells).
const typeA: RackTypeIn = { name: 'Type A', lengthCm: 300, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 400 };
const typeB: RackTypeIn = { name: 'Type B', lengthCm: 400, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 300 };
const typeC: RackTypeIn = { name: 'Type C', lengthCm: 500, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 250 };
const floorPallet: PlateTypeIn = { name: 'Floor pallet', lengthCm: 120, widthCm: 100, floorStackHeightCm: 150, capKg: 1000 };
const shelfPlate: PlateTypeIn = { name: 'Shelf plate', lengthCm: 60, widthCm: 50, floorStackHeightCm: 0, capKg: 120 };

function blockA(): BlockIn {
  const cells = Array.from({ length: 11 }, () => Array.from({ length: 7 }, () => 'PASSAGE' as const)) as BlockIn['cells'];
  const storage = (r: number, c1: number, c2: number) => { for (let c = c1; c <= c2; c++) cells[r - 1][c - 1] = 'STORAGE'; };
  storage(1, 1, 4); storage(3, 2, 6); storage(4, 2, 5); storage(6, 1, 6); storage(7, 2, 6); storage(9, 2, 5); storage(11, 2, 5);
  return { code: 'A', areaSqft: 1194, rows: 11, cols: 7, clearHeightCm: 400, cells };
}
const rack = (code: string, type: RackTypeIn, row: number, len: number, bays: number, merged: number[] = []): RackIn =>
  ({ code, blockCode: 'A', type, startRow: row, startCol: 2, lengthCells: len, direction: 'ROW', bays, mergedShelves: merged });

function chittagongA(): StructureIn {
  return {
    blocks: [blockA()],
    racks: [rack('RK1', typeA, 1, 3, 3), rack('RK2', typeB, 3, 4, 4), rack('RK3', typeB, 4, 4, 4, [3]), rack('RK4', typeC, 6, 5, 5), rack('RK5', typeC, 7, 5, 0)],
    plates: [
      { label: 'PL-CTG-0001', type: floorPallet, parent: { kind: 'CELL', blockCode: 'A', row: 1, col: 1 } },
      { label: 'PL-CTG-0002', type: shelfPlate, parent: { kind: 'POSITION', rackCode: 'RK2', shelfLevel: 1, bay: 1 } },
      { label: 'PL-CTG-0003', type: shelfPlate, parent: { kind: 'POSITION', rackCode: 'RK5', shelfLevel: 1, bay: 0 } },
      { label: 'PL-CTG-0004', type: shelfPlate, parent: { kind: 'POSITION', rackCode: 'RK5', shelfLevel: 1, bay: 0 } },
    ],
  };
}

const pump = (h: number, kg: number, l = 50, w = 30): ProductDims => ({ lengthCm: l, widthCm: w, heightCm: h, weightKg: kg, stackable: true });
const twinPump = pump(40, 27);           // Pedrollo 2CPm 25/14B
const submersible = pump(115, 38, 20, 20); // Pedrollo 4SR
const forester: ProductDims = { lengthCm: 464, widthCm: 182, heightCm: 173, weightKg: 1550, stackable: false };

describe('geometry', () => {
  it('rack length in cells follows the rack type and cell size (Type A/B/C = 3/4/5)', () => {
    const b = blockA();
    expect(Math.round(cellSideCm(b))).toBe(120);
    expect([typeA, typeB, typeC].map((t) => autoLengthCells(t.lengthCm, b))).toEqual([3, 4, 5]);
  });

  it('merging shelves', () => {
    expect(shelvesOf(4, [3])).toEqual([{ level: 1, span: 1 }, { level: 2, span: 1 }, { level: 3, span: 2 }]);
    expect(shelvesOf(4, [4])).toHaveLength(4); // top shelf has nothing above to merge with
  });

  it('racks cover cells along a row or down a column', () => {
    expect(rackCells({ startRow: 2, startCol: 3, lengthCells: 3, direction: 'ROW' })).toEqual([[2, 3], [2, 4], [2, 5]]);
    expect(rackCells({ startRow: 2, startCol: 3, lengthCells: 2, direction: 'COLUMN' })).toEqual([[2, 3], [3, 3]]);
  });

  it('weight bands', () => {
    expect(weightBand(0, 250)).toBe('empty');
    expect(weightBand(243, 250)).toBe('full');
    expect(weightBand(200, 250)).toBe('warn');
  });
});

describe('fitCheck', () => {
  const bay = (shelfUsedKg: number, shelfCapKg = 250, h = 60): LocationGeom =>
    ({ kind: 'BAY', lengthCm: 100, widthCm: 60, heightCm: h, capKg: null, shelf: { capKg: shelfCapKg, usedKg: shelfUsedKg } });

  it('blocks a shelf at its weight limit even when the bay has free space', () => {
    // Rack 4 Shelf 1 in the prototype: 243/250 kg, space only 30% used.
    const r = fitCheck([twinPump], bay(243), { products: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.weight).toBe(true);
  });

  it('accepts a load within space and weight', () => {
    const r = fitCheck([twinPump, twinPump], bay(100), { products: [] });
    expect(r).toMatchObject({ ok: true, shelfAfterKg: 154 });
  });

  it('needs a merged shelf for tall items', () => {
    expect(fitCheck([submersible], bay(0, 300, 60), { products: [] }).ok).toBe(false);
    expect(fitCheck([submersible], bay(0, 600, 120), { products: [] }).ok).toBe(true);
  });

  it('rejects when the volume is full', () => {
    const many = Array.from({ length: 7 }, () => twinPump); // 7 × 60,000 cm³ > 360,000 cm³
    expect(fitCheck(many, bay(0, 9999), { products: [] })).toMatchObject({ ok: false });
  });

  it('plates have their own weight limit', () => {
    const plate: LocationGeom = { kind: 'PLATE', lengthCm: 60, widthCm: 50, heightCm: 60, capKg: 120, shelf: { capKg: 300, usedKg: 0 } };
    expect(fitCheck([pump(30, 12, 40, 28)], plate, { products: Array.from({ length: 10 }, () => pump(30, 12, 40, 28)) }).ok).toBe(false);
  });

  it('vehicles park one per floor cell and never on shelves', () => {
    const cell: LocationGeom = { kind: 'FLOOR', lengthCm: 373, widthCm: 373, heightCm: 300, capKg: null, shelf: null };
    expect(fitCheck([forester], cell, { products: [] }).ok).toBe(true);
    expect(fitCheck([forester], cell, { products: [forester] }).ok).toBe(false);
    expect(fitCheck([forester], bay(0, 9999, 999), { products: [] }).ok).toBe(false);
  });
});

describe('planLayout', () => {
  const plan = planLayout(chittagongA());
  const codes = plan.locations.map((l) => l.code);

  it('creates bays, whole-shelf positions, plates and floor cells', () => {
    expect(codes).toContain('RCV');
    expect(codes).toContain('A-RK1-S1-B1');
    expect(codes).toContain('A-RK3-S3-B1'); // merged S3+S4
    expect(codes).not.toContain('A-RK3-S4-B1');
    expect(codes).toContain('A-R9C2'); // free floor cell
    expect(codes).not.toContain('A-R2C1'); // passage
    expect(codes).not.toContain('A-R1C2'); // under Rack 1
  });

  it('plates replace the position they sit in', () => {
    expect(codes).not.toContain('A-RK2-S1-B1');
    const p = plan.locations.find((l) => l.code === 'PL-CTG-0002');
    expect(p).toMatchObject({ kind: 'PLATE', address: 'A-RK2-S1-B1-P1', boardCode: 'A-RK2-S1-B1' });
    expect(plan.locations.find((l) => l.code === 'PL-CTG-0004')?.address).toBe('A-RK5-S1-P2');
    expect(plan.locations.find((l) => l.code === 'PL-CTG-0001')).toMatchObject({ address: 'A-R1C1-P1', heightCm: 150 });
  });

  it('merged shelves double height and weight limit', () => {
    const s = plan.shelves.find((x) => x.rackCode === 'RK3' && x.level === 3);
    expect(s).toMatchObject({ span: 2, heightCm: 120, capKg: 600 });
  });

  it('one bay board per rack position and free floor cell', () => {
    expect(plan.boards).toContain('A-RK2-S1-B1');
    expect(plan.boards).toContain('A-RK5-S1');
    expect(new Set(plan.boards).size).toBe(plan.boards.length);
  });
});

describe('placement checks', () => {
  it('validates rack placement', () => {
    const s = chittagongA();
    expect(rackPlacementProblem(s, rack('RK9', typeC, 9, 4, 4))).toMatch(/at least 5 cells/);
    expect(rackPlacementProblem(s, rack('RK9', typeA, 2, 3, 3))).toMatch(/Storage/);
    expect(rackPlacementProblem(s, rack('RK9', typeA, 6, 3, 3))).toMatch(/Another rack/);
    expect(rackPlacementProblem(s, rack('RK9', typeA, 9, 3, 3))).toBeNull();
  });

  it('finds the first free spot for a rack', () => {
    expect(firstRackSpot(chittagongA(), 'A', 'ROW', 3)).toEqual([9, 2]);
    expect(firstRackSpot(chittagongA(), 'A', 'ROW', 5)).toBeNull();
  });

  it('counts plate room on the floor and in a bay', () => {
    const s = chittagongA();
    expect(floorPlateRoom(s, 'A', 9, 2, floorPallet).room).toBe(1);
    expect(floorPlateRoom(s, 'A', 1, 1, floorPallet).room).toBe(0); // already has one
    expect(floorPlateRoom(s, 'A', 9, 2, shelfPlate).reason).toMatch(/shelves only/);
    expect(positionPlateRoom(s, 'RK5', 2, 0, shelfPlate).room).toBe(8); // 500 cm shelf, 60 cm plates
    expect(positionPlateRoom(s, 'RK2', 1, 1, shelfPlate).room).toBe(0); // 100 cm bay already has one
    expect(positionPlateRoom(s, 'RK2', 1, 2, floorPallet).reason).toMatch(/deeper/);
  });

  it('finds plates left without a position after a change', () => {
    const s = chittagongA();
    s.racks[1].bays = 0; // Rack 2 loses its bays → plate in bay 1 is orphaned
    expect(orphanPlates(s).map((p) => p.label)).toEqual(['PL-CTG-0002']);
  });
});

describe('numbering', () => {
  it('formats document numbers and labels', () => {
    expect(docNumber('RCV', 'CTG', 2026, 5)).toBe('RCV-CTG-2026-0005');
    expect(plateLabel('CTG', 12)).toBe('PL-CTG-0012');
  });
});
