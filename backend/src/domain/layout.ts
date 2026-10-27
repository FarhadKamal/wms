// Turns a warehouse's structure (blocks, grid, racks, plates) into the shelves,
// storage locations and bay boards that stock can be put into.
// Ported from buildLocations() in the prototype. Pure — the service syncs the result to the DB.

import {
  CellUse,
  Direction,
  SQFT_TO_CM2,
  autoLengthCells,
  cellAreaSqft,
  rackCells,
  shelvesOf,
} from './geometry.js';

export interface BlockIn {
  code: string;
  areaSqft: number;
  rows: number;
  cols: number;
  clearHeightCm: number;
  /** cells[row-1][col-1] */
  cells: CellUse[][];
}
export interface RackTypeIn {
  name: string;
  lengthCm: number;
  depthCm: number;
  shelfCount: number;
  shelfHeightCm: number;
  shelfCapKg: number;
}
export interface RackIn {
  code: string;
  blockCode: string;
  type: RackTypeIn;
  startRow: number;
  startCol: number;
  lengthCells: number;
  direction: Direction;
  bays: number;
  mergedShelves: number[];
}
export interface PlateTypeIn {
  name: string;
  lengthCm: number;
  widthCm: number;
  floorStackHeightCm: number;
  capKg: number;
}
export type PlateParent =
  | { kind: 'POSITION'; rackCode: string; shelfLevel: number; bay: number }
  | { kind: 'CELL'; blockCode: string; row: number; col: number };
export interface PlateIn {
  label: string;
  type: PlateTypeIn;
  parent: PlateParent;
}
export interface StructureIn {
  blocks: BlockIn[];
  racks: RackIn[];
  plates: PlateIn[];
}

export interface ShelfPlan {
  rackCode: string;
  level: number;
  span: number;
  heightCm: number;
  capKg: number;
  volumeCm3: number;
}
export interface LocationPlan {
  code: string;
  address: string;
  kind: 'RECEIVING' | 'BAY' | 'SHELF' | 'PLATE' | 'FLOOR';
  blockCode: string | null;
  rackCode: string | null;
  shelfLevel: number | null;
  bay: number | null;
  plateLabel: string | null;
  cellRow: number | null;
  cellCol: number | null;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  capKg: number | null;
  boardCode: string | null;
}
export interface LayoutPlan {
  shelves: ShelfPlan[];
  locations: LocationPlan[];
  /** Rack positions and floor cells that get a bay board. */
  boards: string[];
}

export const RECEIVING_CODE = 'RCV';
export const positionCode = (blockCode: string, rackCode: string, level: number, bay: number) =>
  `${blockCode}-${rackCode}-S${level}` + (bay ? `-B${bay}` : '');
export const cellCode = (blockCode: string, row: number, col: number) => `${blockCode}-R${row}C${col}`;

function platesKey(p: PlateParent): string {
  return p.kind === 'POSITION'
    ? `P|${p.rackCode}|${p.shelfLevel}|${p.bay}`
    : `C|${p.blockCode}|${p.row}|${p.col}`;
}

export function planLayout(s: StructureIn): LayoutPlan {
  const shelves: ShelfPlan[] = [];
  const boards: string[] = [];
  const locations: LocationPlan[] = [
    {
      code: RECEIVING_CODE, address: RECEIVING_CODE, kind: 'RECEIVING', blockCode: null, rackCode: null,
      shelfLevel: null, bay: null, plateLabel: null, cellRow: null, cellCol: null,
      lengthCm: 0, widthCm: 0, heightCm: 99999, capKg: null, boardCode: null,
    },
  ];
  const platesAt = new Map<string, PlateIn[]>();
  for (const p of s.plates) {
    const k = platesKey(p.parent);
    platesAt.set(k, [...(platesAt.get(k) ?? []), p]);
  }

  for (const b of s.blocks) {
    const underRack = new Set<string>();
    for (const rk of s.racks.filter((r) => r.blockCode === b.code)) {
      for (const [r, c] of rackCells(rk)) underRack.add(`${r},${c}`);
      const t = rk.type;
      for (const sh of shelvesOf(t.shelfCount, rk.mergedShelves)) {
        const h = t.shelfHeightCm * sh.span;
        shelves.push({
          rackCode: rk.code, level: sh.level, span: sh.span, heightCm: h,
          capKg: t.shelfCapKg * sh.span, volumeCm3: t.lengthCm * t.depthCm * h,
        });
        const nb = rk.bays || 0;
        for (let bay = nb ? 1 : 0; bay <= nb; bay++) {
          const pos = positionCode(b.code, rk.code, sh.level, bay);
          const posLen = nb ? t.lengthCm / nb : t.lengthCm;
          boards.push(pos);
          const plates = platesAt.get(`P|${rk.code}|${sh.level}|${bay}`) ?? [];
          const base = {
            blockCode: b.code, rackCode: rk.code, shelfLevel: sh.level, bay,
            cellRow: null, cellCol: null, heightCm: h, boardCode: pos,
          };
          if (plates.length) {
            plates.forEach((p, i) => locations.push({
              ...base, code: p.label, address: `${pos}-P${i + 1}`, kind: 'PLATE', plateLabel: p.label,
              lengthCm: p.type.lengthCm, widthCm: p.type.widthCm, capKg: p.type.capKg,
            }));
          } else {
            locations.push({
              ...base, code: pos, address: pos, kind: nb ? 'BAY' : 'SHELF', plateLabel: null,
              lengthCm: posLen, widthCm: t.depthCm, capKg: null,
            });
          }
        }
      }
    }

    const side = Math.sqrt(cellAreaSqft(b) * SQFT_TO_CM2);
    for (let r = 1; r <= b.rows; r++) {
      for (let c = 1; c <= b.cols; c++) {
        if (b.cells[r - 1][c - 1] !== 'STORAGE' || underRack.has(`${r},${c}`)) continue;
        const cc = cellCode(b.code, r, c);
        boards.push(cc);
        const base = {
          blockCode: b.code, rackCode: null, shelfLevel: null, bay: null, cellRow: r, cellCol: c, boardCode: cc,
        };
        const plates = platesAt.get(`C|${b.code}|${r}|${c}`) ?? [];
        if (plates.length) {
          plates.forEach((p, i) => locations.push({
            ...base, code: p.label, address: `${cc}-P${i + 1}`, kind: 'PLATE', plateLabel: p.label,
            lengthCm: p.type.lengthCm, widthCm: p.type.widthCm,
            heightCm: p.type.floorStackHeightCm || b.clearHeightCm, capKg: p.type.capKg,
          }));
        } else {
          locations.push({
            ...base, code: cc, address: cc, kind: 'FLOOR', plateLabel: null,
            lengthCm: side, widthCm: side, heightCm: b.clearHeightCm, capKg: null,
          });
        }
      }
    }
  }
  return { shelves, locations, boards };
}

// ---------------------------------------------------------------- placement checks

/** Why a rack can't stand here, or null if it can. */
export function rackPlacementProblem(s: StructureIn, rk: RackIn, ignoreRackCode?: string): string | null {
  const b = s.blocks.find((x) => x.code === rk.blockCode);
  if (!b) return 'Unknown block';
  const need = autoLengthCells(rk.type.lengthCm, b);
  if (rk.lengthCells < need) return `${rk.type.name} is ${rk.type.lengthCm} cm long — it needs at least ${need} cells here`;
  const others = s.racks.filter((o) => o.blockCode === b.code && o.code !== ignoreRackCode);
  const taken = new Set(others.flatMap((o) => rackCells(o).map(([r, c]) => `${r},${c}`)));
  const plated = new Set(
    s.plates.filter((p) => p.parent.kind === 'CELL' && p.parent.blockCode === b.code)
      .map((p) => (p.parent.kind === 'CELL' ? `${p.parent.row},${p.parent.col}` : '')),
  );
  for (const [r, c] of rackCells(rk)) {
    if (r < 1 || c < 1 || r > b.rows || c > b.cols) return "The rack doesn't fit inside the grid";
    if (b.cells[r - 1][c - 1] !== 'STORAGE') return 'All cells under a rack must be Storage';
    if (taken.has(`${r},${c}`)) return 'Another rack already stands there';
    if (plated.has(`${r},${c}`)) return 'Plates are on that floor cell — remove them first';
  }
  return null;
}

/** First free run of cells for a rack (row-major scan), or null. */
export function firstRackSpot(s: StructureIn, blockCode: string, direction: Direction, lengthCells: number,
  isCellOccupied: (row: number, col: number) => boolean = () => false): [number, number] | null {
  const b = s.blocks.find((x) => x.code === blockCode);
  if (!b) return null;
  for (let r = 1; r <= b.rows; r++) {
    for (let c = 1; c <= b.cols; c++) {
      const probe: RackIn = {
        code: '__probe__', blockCode, type: { name: '', lengthCm: 0, depthCm: 0, shelfCount: 1, shelfHeightCm: 1, shelfCapKg: 1 },
        startRow: r, startCol: c, lengthCells, direction, bays: 0, mergedShelves: [],
      };
      if (!rackPlacementProblem(s, probe) && !rackCells(probe).some(([rr, cc]) => isCellOccupied(rr, cc))) return [r, c];
    }
  }
  return null;
}

/** How many more plates of this type fit on a floor cell (by floor area). */
export function floorPlateRoom(s: StructureIn, blockCode: string, row: number, col: number, pt: PlateTypeIn):
  { room: number; reason?: string } {
  const b = s.blocks.find((x) => x.code === blockCode);
  if (!b || row < 1 || col < 1 || row > b.rows || col > b.cols) return { room: 0, reason: 'Outside the grid' };
  if (b.cells[row - 1][col - 1] !== 'STORAGE') return { room: 0, reason: 'Plates go on Storage cells only' };
  if (s.racks.some((rk) => rk.blockCode === blockCode && rackCells(rk).some(([r, c]) => r === row && c === col))) {
    return { room: 0, reason: 'A rack stands on that cell — add plates to its shelves instead' };
  }
  if (!pt.floorStackHeightCm) return { room: 0, reason: `${pt.name} is for shelves only` };
  const used = s.plates
    .filter((p) => p.parent.kind === 'CELL' && p.parent.blockCode === blockCode && p.parent.row === row && p.parent.col === col)
    .reduce((sum, p) => sum + p.type.lengthCm * p.type.widthCm, 0);
  const room = Math.max(0, Math.floor((cellAreaSqft(b) * SQFT_TO_CM2 - used) / (pt.lengthCm * pt.widthCm) + 1e-9));
  return room ? { room } : { room: 0, reason: 'No floor area left on that cell' };
}

/** How many more plates of this type fit in a rack position (side by side along the bay). */
export function positionPlateRoom(s: StructureIn, rackCode: string, shelfLevel: number, bay: number, pt: PlateTypeIn):
  { room: number; reason?: string } {
  const rk = s.racks.find((r) => r.code === rackCode);
  if (!rk) return { room: 0, reason: 'Unknown rack' };
  if (pt.widthCm > rk.type.depthCm) return { room: 0, reason: `${pt.name} is deeper (${pt.widthCm} cm) than the rack (${rk.type.depthCm} cm)` };
  const posLen = rk.bays ? rk.type.lengthCm / rk.bays : rk.type.lengthCm;
  const used = s.plates
    .filter((p) => p.parent.kind === 'POSITION' && p.parent.rackCode === rackCode && p.parent.shelfLevel === shelfLevel && p.parent.bay === bay)
    .reduce((sum, p) => sum + p.type.lengthCm, 0);
  const room = Math.max(0, Math.floor((posLen - used) / pt.lengthCm + 1e-9));
  return room ? { room } : { room: 0, reason: `No room for another ${pt.name} here (${Math.round(posLen)} cm wide)` };
}

/** Plates whose position no longer exists after a structure change. */
export function orphanPlates(s: StructureIn): PlateIn[] {
  return s.plates.filter((p) => {
    const pr = p.parent;
    if (pr.kind === 'POSITION') {
      const rk = s.racks.find((r) => r.code === pr.rackCode);
      if (!rk) return true;
      if (!shelvesOf(rk.type.shelfCount, rk.mergedShelves).some((x) => x.level === pr.shelfLevel)) return true;
      return rk.bays ? !(pr.bay >= 1 && pr.bay <= rk.bays) : pr.bay !== 0;
    }
    const b = s.blocks.find((x) => x.code === pr.blockCode);
    if (!b || pr.row > b.rows || pr.col > b.cols) return true;
    if (b.cells[pr.row - 1][pr.col - 1] !== 'STORAGE') return true;
    return s.racks.some((rk) => rk.blockCode === b.code && rackCells(rk).some(([r, c]) => r === pr.row && c === pr.col));
  });
}

// ---------------------------------------------------------------- numbering

export const docNumber = (type: 'RCV' | 'DSP' | 'TRF', whCode: string, year: number, n: number) =>
  `${type}-${whCode}-${year}-${String(n).padStart(4, '0')}`;
export const plateLabel = (whCode: string, n: number) => `PL-${whCode}-${String(n).padStart(4, '0')}`;
export const unitIdFor = (sku: string, n: number) => `${sku}-${String(n).padStart(4, '0')}`;
