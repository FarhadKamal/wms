// Typed client for the WMS API. All calls go to /api (proxied to NestJS in development).

export type CellUse = 'STORAGE' | 'PASSAGE' | 'OFFICE' | 'TOILET' | 'SERVICE' | 'UNLOAD' | 'FORKLIFT';
export type Direction = 'ROW' | 'COLUMN';
export type Band = 'empty' | 'ok' | 'warn' | 'full';

export const CELL_USE_LABEL: Record<CellUse, string> = {
  STORAGE: 'Storage', PASSAGE: 'Passage', OFFICE: 'Office', TOILET: 'Toilet', SERVICE: 'Service', UNLOAD: 'Unload zone', FORKLIFT: 'Forklift',
};

export interface WarehouseRow {
  code: string; name: string; address: string; landmark: string; areaSqft: number; status: 'ACTIVE' | 'PLANNED';
  _count: { blocks: number; racks: number; plates: number };
}
export interface RackType { id: string; name: string; lengthCm: number; depthCm: number; shelfCount: number; shelfHeightCm: number; shelfCapKg: number; _count?: { racks: number } }
export interface PlateType { id: string; name: string; lengthCm: number; widthCm: number; floorStackHeightCm: number; capKg: number; _count?: { plates: number } }
export interface Shelf { level: number; span: number; heightCm: number; capKg: number; usedKg: number; volumeCm3: number; usedCm3: number; band: Band }
export interface Rack {
  code: string; name: string; blockCode: string; rackType: RackType; startRow: number; startCol: number; direction: Direction;
  lengthCells: number; bays: number; mergedShelves: number[]; shelves: Shelf[]; plates: number;
}
export type PlateParent =
  | { kind: 'POSITION'; rackCode: string; shelfLevel: number; bay: number }
  | { kind: 'CELL'; blockCode: string; row: number; col: number };
export interface Plate { label: string; plateType: { id: string; name: string }; parent: PlateParent; address: string | null; units: number; usedKg: number; capKg: number }
export interface Block {
  code: string; name: string; note: string; areaSqft: number; rows: number; cols: number; clearHeightCm: number;
  cellAreaSqft: number; cellSideCm: number; storageSqft: number; cells: CellUse[][]; names: Record<string, string>;
}
export interface FloorCell { code: string; blockCode: string; row: number; col: number; units: number; kg: number }
export interface Structure {
  warehouse: { code: string; name: string; address: string; landmark: string; areaSqft: number; status: 'ACTIVE' | 'PLANNED' };
  blocks: Block[]; racks: Rack[]; plates: Plate[]; floorCells: FloorCell[];
  summary: {
    areaByUse: Partial<Record<CellUse, number>>; blockAreaSqft: number; storageSqft: number; outsideBlocksSqft: number;
    blocks: number; racks: number; plates: number; platesInShelves: number; platesOnFloor: number; shelvesAtWeightLimit: string[]; locations: number;
  };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message;
    throw new ApiError(Array.isArray(msg) ? msg.join('; ') : msg ?? `${res.status} ${res.statusText}`, res.status);
  }
  return data as T;
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const api = {
  health: () => call<{ api: string; database: string }>('GET', '/health'),
  warehouses: () => call<WarehouseRow[]>('GET', '/warehouses'),
  createWarehouse: (b: { code: string; name: string; address: string; areaSqft: number }) => call('POST', '/warehouses', b),
  updateWarehouse: (wh: string, b: Partial<{ name: string; address: string; landmark: string; areaSqft: number; status: 'ACTIVE' | 'PLANNED' }>) => call('PATCH', `/warehouses/${wh}`, b),
  structure: (wh: string) => call<Structure>('GET', `/warehouses/${wh}/structure`),

  createBlock: (wh: string, b: { name: string; areaSqft: number; rows: number; cols: number; clearHeightCm?: number; note?: string }) => call<{ code: string }>('POST', `/warehouses/${wh}/blocks`, b),
  updateBlock: (wh: string, block: string, b: Partial<{ name: string; areaSqft: number; rows: number; cols: number; clearHeightCm: number; note: string }>) => call('PATCH', `/warehouses/${wh}/blocks/${block}`, b),
  paintCells: (wh: string, block: string, b: { cells: Array<{ row: number; col: number }>; use: CellUse; areaName?: string }) => call<{ updated: number }>('PUT', `/warehouses/${wh}/blocks/${block}/cells`, b),

  rackTypes: () => call<RackType[]>('GET', '/rack-types'),
  createRackType: (b: Omit<RackType, 'id' | '_count'>) => call('POST', '/rack-types', b),
  plateTypes: () => call<PlateType[]>('GET', '/plate-types'),
  createPlateType: (b: Omit<PlateType, 'id' | '_count'>) => call('POST', '/plate-types', b),

  suggestRack: (wh: string, block: string, type: string, direction: Direction) =>
    call<{ lengthCells: number; bays: number; startRow: number | null; startCol: number | null; cellSideCm: number; rackLengthCm: number }>('GET', `/warehouses/${wh}/racks/suggest?${q({ block, type, direction })}`),
  createRack: (wh: string, b: { blockCode: string; rackTypeId: string; startRow: number; startCol: number; direction: Direction; lengthCells?: number; bays?: number }) => call<{ code: string }>('POST', `/warehouses/${wh}/racks`, b),
  updateRack: (wh: string, rack: string, b: { bays?: number; mergedShelves?: number[] }) => call('PATCH', `/warehouses/${wh}/racks/${rack}`, b),
  deleteRack: (wh: string, rack: string) => call('DELETE', `/warehouses/${wh}/racks/${rack}`),

  suggestFloorPlate: (wh: string, block: string, type: string) =>
    call<{ row: number | null; col: number | null; room: number; reason?: string; cellAreaSqft?: number }>('GET', `/warehouses/${wh}/plates/suggest-floor?${q({ block, type })}`),
  createPlates: (wh: string, b: { plateTypeId: string; count: number } & ({ rackCode: string; shelfLevel: number; bay: number } | { blockCode: string; row: number; col: number })) =>
    call<{ labels: string[] }>('POST', `/warehouses/${wh}/plates`, b),
  deletePlate: (wh: string, label: string) => call('DELETE', `/warehouses/${wh}/plates/${label}`),
};
