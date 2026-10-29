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

// ---------------------------------------------------------------- stock movement

export interface Product {
  id: string; sku: string; name: string; brand: string; lengthCm: number; widthCm: number; heightCm: number; weightKg: number;
  reorderPoint: number; stackable: boolean; category: { code: string; name: string; idRule: 'GENERATED' | 'VIN' };
  /** alias code 1–3, each optional */
  aliases: [string | null, string | null, string | null];
}
export interface ImportRow { row: number; sku: string; action: 'new' | 'update' | 'unchanged' | 'error'; errors: string[]; warnings: string[]; changes: string[] }
export interface ImportPreview { rows: ImportRow[]; newCategories: string[]; summary: { total: number; new: number; update: number; unchanged: number; error: number } }
export interface ProductForm { sku?: string; name: string; category: string; brand: string; lengthCm: number; widthCm: number; heightCm: number; weightKg: number; reorderPoint: number; alias1?: string; alias2?: string; alias3?: string }
export type DocType = 'RCV' | 'DSP' | 'TRF';
export interface DocLine { sku: string; name: string; byVin: boolean; uids: string[]; from: Record<string, number>; kg: number }
export interface Doc {
  no: string; type: DocType; docDate: string; party: string; reference: string; preparedBy: string; toCode: string | null; createdAt: string;
  warehouse: { code: string; name: string; address: string }; units: number; totalKg: number; lines: DocLine[];
}
export interface DocRow { no: string; type: DocType; docDate: string; party: string; reference: string; createdAt: string; units: number; products: Array<{ name: string; qty: number }> }
export interface PendingGroup {
  doc: string; docDate: string; sku: string; uids: string[];
  product: { sku: string; name: string; lengthCm: number; widthCm: number; heightCm: number; weightKg: number; stackable: boolean; category: { idRule: 'GENERATED' | 'VIN' } };
}
export interface Suggestion { code: string; address: string; kind: string; note: string; sameProduct: boolean; empty: boolean }
export interface StockRow {
  sku: string; name: string; brand: string; category: string; idRule: 'GENERATED' | 'VIN'; lengthCm: number; widthCm: number; heightCm: number; weightKg: number;
  reorderPoint: number; onShelf: number; inReceiving: number; total: number; locations: number; aliases: string[];
}
export interface UnitDetail {
  uid: string; status: 'STAGING' | 'IN_STOCK' | 'DISPATCHED'; warehouse: { code: string; name: string };
  product: Product; location: { code: string; address: string; kind: string; boardCode: string | null } | null;
  receivingDoc: { no: string }; dispatchDoc: { no: string; party: string } | null;
  events: Array<{ id: string; type: 'RECEIVED' | 'PUT_AWAY' | 'MOVED' | 'DISPATCHED'; at: string; by: string; fromCode: string | null; toCode: string | null; document: { no: string; party: string } }>;
}
export interface ItemGroup { sku: string; name: string; qty: number; kg: number; uids: string[] }
export interface Position {
  board: string | null; description: string; heightCm?: number; items: ItemGroup[]; qty: number; kg: number;
  plates: Array<{ label: string; address: string; type: string; capKg: number | null; items: ItemGroup[]; kg: number }>;
  shelf: { level: number; span: number; heightCm: number; capKg: number; usedKg: number; volumeCm3: number; usedCm3: number } | null;
  boardDirty: boolean; boardUpdatedAt: string | null;
  events: Array<{ type: string; at: string; doc: string; by: string; inbound: boolean; from: string | null; to: string | null }>;
}
export interface BoardRow { code: string; lastUpdatedAt: string | null; onRack: boolean; items: Array<{ name: string; qty: number; kg: number }>; qty: number; kg: number }
export interface Dashboard {
  inStock: number; staging: number; receivedToday: number; dispatchedToday: number; boardsToUpdate: number;
  latestDocs: DocRow[]; lowStock: Array<{ sku: string; name: string; total: number; reorderPoint: number }>;
}
export type ScanResult = { type: 'unit'; uid: string; warehouse: string } | { type: 'document'; no: string } | { type: 'location'; board: string; kind: string } | { type: 'product'; sku: string };

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// ---------------------------------------------------------------- login session

export type Role = 'ADMIN' | 'MANAGER' | 'STORE_KEEPER' | 'MANAGEMENT';
export type Company = 'AZNEO' | 'PNL';
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', MANAGER: 'Warehouse Manager', STORE_KEEPER: 'Store Keeper', MANAGEMENT: 'Management' };
export const COMPANY_LABEL: Record<Company, string> = { AZNEO: 'Azneo', PNL: 'PNL Holdings' };
export interface Me { id: string; username: string; fullName: string; role: Role; company: Company; warehouses: Array<{ code: string; name: string }> }
export interface UserRow extends Me { active: boolean; lastLoginAt: string | null; createdAt: string }

const TOKEN_KEY = 'wms.token';
export const session = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* private mode: session lasts this tab */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};
/** Fired when the server says the login is no longer valid (expired, deactivated). */
export const LOGGED_OUT_EVENT = 'wms:logged-out';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return send<T>(method, path, body !== undefined ? JSON.stringify(body) : undefined, body !== undefined ? { 'Content-Type': 'application/json' } : {});
}

/** Upload a file (multipart) — e.g. the product Excel. */
function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return send<T>('POST', path, fd, {});
}

/** Download a file that needs the login (e.g. the product Excel export). */
export async function download(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${session.get() ?? ''}` } });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function send<T>(method: string, path: string, body: BodyInit | undefined, extraHeaders: Record<string, string>): Promise<T> {
  const token = session.get();
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') {
    session.clear();
    window.dispatchEvent(new CustomEvent(LOGGED_OUT_EVENT, { detail: data?.message }));
  }
  if (!res.ok) {
    const msg = data?.message;
    throw new ApiError(Array.isArray(msg) ? msg.join('; ') : msg ?? `${res.status} ${res.statusText}`, res.status);
  }
  return data as T;
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const api = {
  health: () => call<{ api: string; database: string }>('GET', '/health'),
  login: (username: string, password: string) => call<{ token: string; user: Me }>('POST', '/auth/login', { username, password }),
  me: () => call<Me>('GET', '/auth/me'),
  changePassword: (current: string, next: string) => call('POST', '/auth/password', { current, next }),
  users: () => call<UserRow[]>('GET', '/users'),
  createUser: (b: { username: string; fullName: string; role: Role; company: Company; warehouses: string[] }) => call<{ id: string; username: string; password?: string }>('POST', '/users', b),
  updateUser: (id: string, b: Partial<{ fullName: string; role: Role; company: Company; warehouses: string[]; active: boolean; resetPassword: boolean }>) => call<{ id: string; password?: string }>('PATCH', `/users/${id}`, b),
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

  products: (search?: string) => call<Product[]>('GET', `/products${search ? `?${q({ q: search })}` : ''}`),
  product: (code: string) => call<Product>('GET', `/products/${encodeURIComponent(code)}`),
  createProduct: (b: ProductForm) => call<Product>('POST', '/products', b),
  updateProduct: (sku: string, b: ProductForm) => call<Product>('PATCH', `/products/${encodeURIComponent(sku)}`, b),
  previewImport: (file: File) => upload<ImportPreview>('/products/import/preview', file),
  importProducts: (file: File) => upload<ImportPreview['summary']>('/products/import', file),
  receive: (wh: string, b: { party: string; reference?: string; date?: string; lines: Array<{ sku: string; qty: number; vins?: string[] }> }) => call<Doc>('POST', `/warehouses/${wh}/receipts`, b),
  pending: (wh: string) => call<PendingGroup[]>('GET', `/warehouses/${wh}/putaway`),
  suggest: (wh: string, uids: string[], exclude?: string) => call<{ suggestions: Suggestion[]; bestQty: number | null }>('POST', `/warehouses/${wh}/suggest`, { uids, exclude }),
  putAway: (wh: string, b: { uids: string[]; location: string }) => call<{ placed: number; location: string; note: string }>('POST', `/warehouses/${wh}/putaway`, b),
  transfer: (wh: string, b: { uids: string[]; location: string; reason?: string }) => call<Doc>('POST', `/warehouses/${wh}/transfers`, b),
  dispatch: (wh: string, b: { party: string; destination?: string; date?: string; uids: string[] }) => call<Doc>('POST', `/warehouses/${wh}/dispatches`, b),
  dashboard: (wh: string) => call<Dashboard>('GET', `/warehouses/${wh}/dashboard`),
  stock: (wh: string) => call<StockRow[]>('GET', `/warehouses/${wh}/stock`),
  stockOf: (wh: string, sku: string) => call<Array<{ address: string; kind: string; boardCode: string | null; uids: string[] }>>('GET', `/warehouses/${wh}/stock/${encodeURIComponent(sku)}`),
  documents: (wh: string, type?: DocType) => call<DocRow[]>('GET', `/warehouses/${wh}/documents${type ? `?type=${type}` : ''}`),
  document: (no: string) => call<Doc>('GET', `/documents/${encodeURIComponent(no)}`),
  unit: (uid: string) => call<UnitDetail>('GET', `/units/${encodeURIComponent(uid)}`),
  position: (wh: string, code: string) => call<Position>('GET', `/warehouses/${wh}/positions/${encodeURIComponent(code)}`),
  scan: (wh: string, code: string) => call<ScanResult>('GET', `/warehouses/${wh}/scan?${q({ code })}`),
  boards: (wh: string) => call<BoardRow[]>('GET', `/warehouses/${wh}/boards`),
  boardUpdated: (wh: string, code: string) => call<{ updated: number }>('POST', `/warehouses/${wh}/boards/${encodeURIComponent(code)}/updated`),
};

/** Today in Bangladesh time (UTC+6), as YYYY-MM-DD. */
export const todayLocal = () => new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
/** Strip a scanner's QR prefix ("AZWMS|U|…") the same way the API does. */
export const parseScan = (raw: string) => {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^AZWMS\|[ULD]\|(?:[A-Z]{2,4}\|)?(.+)$/);
  return m ? m[1] : s;
};
