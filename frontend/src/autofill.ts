// Auto-fill helpers (everything derived from cell size and type sizes), as in the prototype.

const SQFT_TO_CM2 = 929.0304;

export function suggestCode(name: string, taken: string[]): string {
  const L = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (L.length < 2) return '';
  const candidates = [L.slice(0, 3), L[0] + L.slice(2, 4), L[0] + L[L.length - 1] + (L[1] ?? ''), L.slice(0, 4)];
  return candidates.find((c) => c.length >= 2 && !taken.includes(c)) ?? '';
}

/** Rows × columns for an area and a target cell size (sq ft). */
export function gridFor(areaSqft: number, cellSqft: number) {
  const cells = Math.max(1, Math.round((areaSqft || 0) / Math.max(1, cellSqft || 1)));
  const cols = Math.min(20, Math.max(1, Math.round(Math.sqrt(cells))));
  return { rows: Math.min(30, Math.max(1, Math.round(cells / cols))), cols };
}

export function cellFacts(areaSqft: number, rows: number, cols: number, rackLengthCm = 300, pallet = { l: 120, w: 100 }) {
  const per = areaSqft / (rows * cols);
  const side = Math.sqrt(per * SQFT_TO_CM2);
  return {
    perCellSqft: per,
    sideCm: side,
    cells: rows * cols,
    palletsPerCell: Math.floor((per * SQFT_TO_CM2) / (pallet.l * pallet.w)),
    rackCells: Math.max(1, Math.ceil(rackLengthCm / side - 1e-9)),
  };
}

export function nextTypeName(existing: string[]): string {
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((ch) => !existing.includes(`Type ${ch}`));
  return letter ? `Type ${letter}` : '';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const sqft = (n: number) => `${Math.round(n).toLocaleString('en-IN')} sq ft`;
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
