// Is a structure change safe for the stock that is already in the warehouse?
// Checked before every setup change (resize a block, repaint cells, add/remove a rack,
// change bays, merge/split shelves, add/remove plates). Mirrors tryConfig() in the prototype.

import { ProductDims } from './fit.js';
import { StructureIn, orphanPlates, planLayout, rackPlacementProblem } from './layout.js';

export interface UnitAt {
  uid: string;
  /** Location.code — the address, or the plate label for plates */
  locationCode: string;
  product: ProductDims;
}

const list = (xs: string[]) => [...new Set(xs)].slice(0, 3).join(', ') + (new Set(xs).size > 3 ? '…' : '');

/** Why the changed structure can't be saved, or null if it can. */
export function changeProblem(next: StructureIn, units: UnitAt[]): string | null {
  for (const rk of next.racks) {
    const p = rackPlacementProblem(next, rk, rk.code);
    if (p) return `${rk.code}: ${p}`;
  }

  const orphans = orphanPlates(next);
  if (orphans.length) return `Plates ${list(orphans.map((p) => p.label))} would be left without a place — remove them first`;

  const plan = planLayout(next);
  const loc = new Map(plan.locations.map((l) => [l.code, l]));

  const gone = units.filter((u) => !loc.has(u.locationCode));
  if (gone.length) return `Stock is still in ${list(gone.map((u) => u.locationCode))} — move it first`;

  const tooTall = units.filter((u) => u.product.heightCm > loc.get(u.locationCode)!.heightCm);
  if (tooTall.length) return `Items in ${list(tooTall.map((u) => loc.get(u.locationCode)!.address))} would be too tall — move them first`;

  const shelfKg = new Map<string, number>();
  const plateKg = new Map<string, number>();
  for (const u of units) {
    const l = loc.get(u.locationCode)!;
    if (l.rackCode && l.shelfLevel != null) {
      const k = `${l.rackCode}|${l.shelfLevel}`;
      shelfKg.set(k, (shelfKg.get(k) ?? 0) + u.product.weightKg);
    }
    if (l.capKg != null) plateKg.set(l.code, (plateKg.get(l.code) ?? 0) + u.product.weightKg);
  }
  for (const s of plan.shelves) {
    const used = shelfKg.get(`${s.rackCode}|${s.level}`) ?? 0;
    if (used > s.capKg) return `${s.rackCode} shelf ${s.level} would be over its weight limit (${Math.round(used)} / ${s.capKg} kg)`;
  }
  for (const [code, used] of plateKg) {
    const cap = loc.get(code)!.capKg!;
    if (used > cap) return `Plate ${code} would be over its weight limit (${Math.round(used)} / ${cap} kg)`;
  }
  return null;
}
