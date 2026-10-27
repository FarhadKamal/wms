// Geometry rules shared by setup and stock movement.
// Ported from the prototype (wms-prototype.html). Pure functions — no database access.

export const SQFT_TO_CM2 = 929.0304;

/** A shelf at or above this share of its weight limit is "weight full" (shown red). */
export const WEIGHT_FULL = 0.95;
/** A shelf at or above this share is "filling up" (shown amber). */
export const WEIGHT_WARN = 0.75;

export type CellUse = 'STORAGE' | 'PASSAGE' | 'OFFICE' | 'TOILET' | 'SERVICE' | 'UNLOAD' | 'FORKLIFT';
export type Direction = 'ROW' | 'COLUMN';

export interface BlockGeom {
  areaSqft: number;
  rows: number;
  cols: number;
}

export interface RackPlacement {
  startRow: number;
  startCol: number;
  lengthCells: number;
  direction: Direction;
}

/** Every cell of a block has the same area: block area ÷ number of cells. */
export function cellAreaSqft(b: BlockGeom): number {
  return b.areaSqft / (b.rows * b.cols);
}

/** Cells are treated as squares until real row/column widths are measured. */
export function cellSideCm(b: BlockGeom): number {
  return Math.sqrt(cellAreaSqft(b) * SQFT_TO_CM2);
}

/** How many cells a rack of this length needs in this block (rounded up). */
export function autoLengthCells(rackLengthCm: number, b: BlockGeom): number {
  return Math.max(1, Math.ceil(rackLengthCm / cellSideCm(b) - 1e-9));
}

/** The grid cells a rack stands on, as [row, col] pairs (1-based). */
export function rackCells(r: RackPlacement): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < r.lengthCells; i++) {
    out.push(r.direction === 'ROW' ? [r.startRow, r.startCol + i] : [r.startRow + i, r.startCol]);
  }
  return out;
}

export interface ShelfSlot {
  level: number;
  span: number;
}

/**
 * Shelves of a rack after merges. `merged` lists the lower level of each merged
 * pair, e.g. shelfCount 4 with merged [3] → S1, S2, S3+S4.
 */
export function shelvesOf(shelfCount: number, merged: readonly number[]): ShelfSlot[] {
  const out: ShelfSlot[] = [];
  for (let n = 1; n <= shelfCount; n++) {
    if (merged.includes(n) && n < shelfCount) {
      out.push({ level: n, span: 2 });
      n++;
    } else {
      out.push({ level: n, span: 1 });
    }
  }
  return out;
}

export type WeightBand = 'empty' | 'ok' | 'warn' | 'full';

export function weightBand(usedKg: number, capKg: number): WeightBand {
  if (!usedKg) return 'empty';
  const r = capKg ? usedKg / capKg : 1;
  return r >= WEIGHT_FULL ? 'full' : r >= WEIGHT_WARN ? 'warn' : 'ok';
}
