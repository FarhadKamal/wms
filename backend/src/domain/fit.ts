// Can these units go into this location? Space AND weight are both checked.
// Weight is a safety limit: a shelf can be full by weight while it still looks half empty.

export interface ProductDims {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  /** false for vehicles: they need floor area, not shelf volume */
  stackable: boolean;
}

export interface LocationGeom {
  kind: 'RECEIVING' | 'BAY' | 'SHELF' | 'PLATE' | 'FLOOR';
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** The location's own limit (plates). */
  capKg: number | null;
  /** The shelf this location sits on, with its limit and current load. */
  shelf: { capKg: number; usedKg: number } | null;
}

/** What is already in the location. */
export interface Occupancy {
  products: ProductDims[];
}

export type FitResult =
  | { ok: true; note: string; shelfAfterKg?: number; shelfCapKg?: number }
  | { ok: false; reason: string; weight?: boolean };

const vol = (p: ProductDims) => p.lengthCm * p.widthCm * p.heightCm;
const foot = (p: ProductDims) => p.lengthCm * p.widthCm;
const kg = (ps: ProductDims[]) => ps.reduce((s, p) => s + p.weightKg, 0);

export function fitCheck(incoming: ProductDims[], loc: LocationGeom, occ: Occupancy): FitResult {
  if (loc.kind === 'RECEIVING') return { ok: false, reason: "That's the Receiving Area" };
  if (!incoming.length) return { ok: false, reason: 'Nothing to place' };

  const vehicle = incoming.some((p) => !p.stackable);
  if (vehicle && loc.kind !== 'FLOOR') return { ok: false, reason: 'Vehicles park on floor cells only' };

  const tallest = Math.max(...incoming.map((p) => p.heightCm));
  if (tallest > loc.heightCm) {
    return {
      ok: false,
      reason: `Too tall: ${tallest} vs ${Math.round(loc.heightCm)} cm` + (loc.shelf ? ' (merge shelves?)' : ''),
    };
  }

  const inKg = kg(incoming);
  if (vehicle || occ.products.some((p) => !p.stackable)) {
    // Floor parking: footprints must fit side by side.
    const area = loc.lengthCm * loc.widthCm;
    const after = [...occ.products, ...incoming].reduce((s, p) => s + foot(p), 0);
    if (after > area) {
      return { ok: false, reason: occ.products.length ? 'Cell already occupied' : 'Not enough floor space' };
    }
  } else {
    const capacity = loc.lengthCm * loc.widthCm * loc.heightCm;
    const after = [...occ.products, ...incoming].reduce((s, p) => s + vol(p), 0);
    if (after > capacity) {
      return { ok: false, reason: `Not enough space (${Math.round((after / capacity) * 100)}% of volume)` };
    }
  }

  if (loc.capKg != null) {
    const after = kg(occ.products) + inKg;
    if (after > loc.capKg) {
      return { ok: false, reason: `Plate over weight: ${Math.round(after)} / ${loc.capKg} kg`, weight: true };
    }
  }

  if (loc.shelf) {
    const after = loc.shelf.usedKg + inKg;
    if (after > loc.shelf.capKg) {
      return { ok: false, reason: `Shelf weight limit: ${Math.round(after)} / ${loc.shelf.capKg} kg`, weight: true };
    }
    return { ok: true, note: `shelf ${Math.round(after)}/${loc.shelf.capKg} kg`, shelfAfterKg: after, shelfCapKg: loc.shelf.capKg };
  }
  if (loc.capKg != null) return { ok: true, note: `plate ${Math.round(kg(occ.products) + inKg)}/${loc.capKg} kg` };
  return { ok: true, note: vehicle ? 'free spot' : 'floor space ok' };
}
