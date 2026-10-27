// Where should these units go? Ranks every location that passes fitCheck (space + weight).
// Ported from suggestLocs()/bestQty() in the prototype. Pure.

import { fitCheck, LocationGeom, ProductDims } from './fit.js';

export interface Candidate {
  code: string;
  address: string;
  kind: LocationGeom['kind'];
  geom: LocationGeom;
  /** What is in it now. */
  contents: ProductDims[];
  /** SKUs in it now. */
  skus: string[];
}

export interface Suggestion {
  code: string;
  address: string;
  kind: LocationGeom['kind'];
  note: string;
  sameProduct: boolean;
  empty: boolean;
}

/**
 * Locations that can take all `incoming` units, best first: already holding this product, then empty,
 * then the tightest height fit (tall items to tall spaces, keeping pallets free for big goods),
 * then the lightest-loaded shelf.
 */
export function suggestLocations(incoming: ProductDims[], sku: string, candidates: Candidate[], max = 6, exclude?: string): Suggestion[] {
  const tallest = Math.max(...incoming.map((p) => p.heightCm));
  const ranked = candidates
    .filter((c) => c.kind !== 'RECEIVING' && c.code !== exclude)
    .map((c) => ({ c, fit: fitCheck(incoming, c.geom, { products: c.contents }) }))
    .filter((x) => x.fit.ok)
    .map((x) => ({
      c: x.c,
      note: x.fit.ok ? x.fit.note : '',
      same: x.c.skus.includes(sku),
      empty: x.c.contents.length === 0,
      spareHeight: x.c.geom.heightCm - tallest,
      ratio: x.fit.ok && x.fit.shelfAfterKg != null ? x.fit.shelfAfterKg / x.fit.shelfCapKg! : 0,
    }));
  ranked.sort((a, b) => Number(b.same) - Number(a.same) || Number(b.empty) - Number(a.empty)
    || a.spareHeight - b.spareHeight || a.ratio - b.ratio || a.c.address.localeCompare(b.c.address));
  return ranked.slice(0, max).map((x) => ({ code: x.c.code, address: x.c.address, kind: x.c.kind, note: x.note, sameProduct: x.same, empty: x.empty }));
}

/** The most units of one product that fit together in a single location (1 for vehicles). */
export function bestQuantity(product: ProductDims, available: number, sku: string, candidates: Candidate[]): number {
  if (!product.stackable || available <= 1) return Math.min(1, available);
  for (let n = available; n > 1; n--) {
    if (suggestLocations(Array.from({ length: n }, () => product), sku, candidates, 1).length) return n;
  }
  return 1;
}

/** VINs: 17 characters, letters and digits except I, O and Q. */
export const isValidVin = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
