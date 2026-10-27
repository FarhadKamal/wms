import { changeProblem, UnitAt } from './change.js';
import { ProductDims } from './fit.js';
import { BlockIn, RackTypeIn, StructureIn } from './layout.js';

const typeB: RackTypeIn = { name: 'Type B', lengthCm: 400, depthCm: 60, shelfCount: 4, shelfHeightCm: 60, shelfCapKg: 300 };
const submersible: ProductDims = { lengthCm: 20, widthCm: 20, heightCm: 115, weightKg: 38, stackable: true };
const twin: ProductDims = { lengthCm: 50, widthCm: 30, heightCm: 40, weightKg: 27, stackable: true };

function structure(): StructureIn {
  const cells = Array.from({ length: 3 }, () => Array.from({ length: 6 }, () => 'STORAGE' as const)) as BlockIn['cells'];
  return {
    blocks: [{ code: 'A', areaSqft: 18 * 15.5, rows: 3, cols: 6, clearHeightCm: 400, cells }],
    racks: [{ code: 'RK3', blockCode: 'A', type: typeB, startRow: 1, startCol: 1, lengthCells: 4, direction: 'ROW', bays: 4, mergedShelves: [3] }],
    plates: [],
  };
}
const at = (code: string, p: ProductDims, n = 1): UnitAt[] =>
  Array.from({ length: n }, (_, i) => ({ uid: `${code}#${i}`, locationCode: code, product: p }));

describe('changeProblem', () => {
  it('allows a safe change', () => {
    const s = structure();
    s.racks[0].bays = 2;
    expect(changeProblem(s, at('A-RK3-S1-B1', twin))).toBeNull();
  });

  it('blocks splitting a merged shelf while tall pumps sit on it', () => {
    const s = structure();
    s.racks[0].mergedShelves = [];
    expect(changeProblem(s, at('A-RK3-S3-B1', submersible, 2))).toMatch(/too tall/);
  });

  it('blocks removing bays that hold stock', () => {
    const s = structure();
    s.racks[0].bays = 2;
    expect(changeProblem(s, at('A-RK3-S1-B4', twin))).toMatch(/Stock is still in A-RK3-S1-B4/);
  });

  it('blocks a change that would overload a shelf', () => {
    const s = structure();
    s.racks[0].mergedShelves = []; // merged S3+S4 (600 kg) back to S3 (300 kg)
    expect(changeProblem(s, at('A-RK3-S3-B1', twin, 12))).toMatch(/over its weight limit/);
  });

  it('blocks painting a cell under a rack as non-storage', () => {
    const s = structure();
    s.blocks[0].cells[0][1] = 'OFFICE';
    expect(changeProblem(s, [])).toMatch(/must be Storage/);
  });

  it('blocks shrinking the grid under a rack', () => {
    const s = structure();
    s.blocks[0].cols = 3;
    s.blocks[0].cells = s.blocks[0].cells.map((r) => r.slice(0, 3));
    expect(changeProblem(s, [])).toMatch(/fit inside the grid/);
  });

  it('blocks adding plates where loose stock sits', () => {
    const s = structure();
    s.plates.push({ label: 'PL-T-0001', type: { name: 'Shelf plate', lengthCm: 60, widthCm: 50, floorStackHeightCm: 0, capKg: 120 }, parent: { kind: 'POSITION', rackCode: 'RK3', shelfLevel: 1, bay: 1 } });
    expect(changeProblem(s, at('A-RK3-S1-B1', twin))).toMatch(/move it first/);
  });
});
