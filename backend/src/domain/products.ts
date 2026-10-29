// Product rows from Excel (or the single-product form): normalise, validate, and compare with what exists.
// Pure — the products service parses the file and applies the result.

export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  brand: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  reorderPoint: number;
  /** alias code 1, 2, 3 — each optional */
  aliases: [string | null, string | null, string | null];
}

/** One row as read from the sheet: raw cell values. */
export type RawRow = { row: number } & Partial<Record<keyof Omit<ProductInput, 'aliases'> | 'alias1' | 'alias2' | 'alias3', unknown>>;

export interface ExistingProduct extends ProductInput { unitsInStock: number }

export type RowAction = 'new' | 'update' | 'unchanged' | 'error';
export interface CheckedRow {
  row: number;
  sku: string;
  action: RowAction;
  errors: string[];
  warnings: string[];
  value: ProductInput | null;
  /** fields that change, for updates */
  changes: string[];
}

export const SKU_RE = /^[A-Z0-9][A-Z0-9._/-]{1,39}$/;
export const ALIAS_RE = /^[A-Z0-9][A-Z0-9._/ -]{0,59}$/;
export const MAX_ROWS = 5000;

const text = (v: unknown): string => (v == null ? '' : String(v).trim());
const code = (v: unknown): string => text(v).toUpperCase().replace(/\s+/g, ' ');

function num(v: unknown, field: string, errors: string[], { int = false, min = 0, positive = true, fallback }: { int?: boolean; min?: number; positive?: boolean; fallback?: number } = {}): number {
  const t = text(v);
  if (t === '' && fallback !== undefined) return fallback;
  const n = typeof v === 'number' ? v : Number(t.replace(/,/g, ''));
  if (t === '' || !Number.isFinite(n)) { errors.push(`${field} must be a number`); return NaN; }
  if (positive ? n <= 0 : n < min) errors.push(`${field} must be ${positive ? 'more than 0' : `at least ${min}`}`);
  if (int && !Number.isInteger(n)) errors.push(`${field} must be a whole number`);
  return n;
}

/** Normalise and check one row on its own (no cross-row checks). */
export function readRow(r: RawRow): { value: ProductInput; errors: string[] } {
  const errors: string[] = [];
  const sku = code(r.sku);
  if (!sku) errors.push('SKU is required');
  else if (!SKU_RE.test(sku)) errors.push('SKU: 2–40 characters, letters, digits and - _ . / only');
  const name = text(r.name);
  if (!name) errors.push('Name is required');
  else if (name.length > 160) errors.push('Name is longer than 160 characters');
  const category = text(r.category);
  if (!category) errors.push('Category is required');
  const brand = text(r.brand);
  if (!brand) errors.push('Brand is required');
  const aliases = [r.alias1, r.alias2, r.alias3].map((a) => code(a) || null) as ProductInput['aliases'];
  aliases.forEach((a, i) => { if (a && !ALIAS_RE.test(a)) errors.push(`Alias code ${i + 1}: up to 60 letters, digits, spaces and - _ . /`); });
  const filled = aliases.filter((a): a is string => !!a);
  if (new Set(filled).size !== filled.length) errors.push('The same alias code is used twice in this row');
  if (sku && filled.includes(sku)) errors.push('An alias code is the same as the SKU');
  return {
    errors,
    value: {
      sku, name, category, brand, aliases,
      lengthCm: num(r.lengthCm, 'Length', errors), widthCm: num(r.widthCm, 'Width', errors), heightCm: num(r.heightCm, 'Height', errors),
      weightKg: num(r.weightKg, 'Weight', errors),
      reorderPoint: num(r.reorderPoint, 'Reorder level', errors, { int: true, positive: false, fallback: 0 }),
    },
  };
}

const FIELDS: Array<[keyof ProductInput, string]> = [
  ['name', 'name'], ['category', 'category'], ['brand', 'brand'], ['lengthCm', 'length'], ['widthCm', 'width'], ['heightCm', 'height'],
  ['weightKg', 'weight'], ['reorderPoint', 'reorder level'], ['aliases', 'alias codes'],
];

/**
 * Check a whole upload against the existing catalogue:
 * duplicate SKUs in the file, alias codes unique across ALL products after the upload
 * (so swapping aliases between products in one file works), aliases never equal to another SKU.
 */
export function checkImport(raw: RawRow[], existing: ExistingProduct[], categories: string[]): { rows: CheckedRow[]; newCategories: string[] } {
  const bySku = new Map(existing.map((p) => [p.sku, p]));
  const read = raw.map((r) => ({ row: r.row, ...readRow(r) }));
  const rows: CheckedRow[] = read.map((r) => ({ row: r.row, sku: r.value.sku, action: 'new', errors: [...r.errors], warnings: [], value: r.value, changes: [] }));

  // Duplicate SKUs in the file
  const firstRow = new Map<string, number>();
  for (const r of rows) {
    if (!r.sku) continue;
    if (firstRow.has(r.sku)) r.errors.push(`SKU ${r.sku} is already on row ${firstRow.get(r.sku)}`);
    else firstRow.set(r.sku, r.row);
  }

  // Alias codes after the upload: file rows replace the aliases of their product; others keep theirs.
  const inFile = new Set(rows.map((r) => r.sku));
  const owner = new Map<string, string>(); // alias → sku
  for (const p of existing) if (!inFile.has(p.sku)) p.aliases.forEach((a) => a && owner.set(a, p.sku));
  const allSkus = new Set([...existing.map((p) => p.sku), ...inFile]);
  for (const r of rows) {
    for (const a of r.value?.aliases ?? []) {
      if (!a) continue;
      if (allSkus.has(a) && a !== r.sku) r.errors.push(`Alias ${a} is the SKU of another product`);
      const o = owner.get(a);
      if (o && o !== r.sku) r.errors.push(`Alias ${a} already belongs to ${o}`);
      else owner.set(a, r.sku);
    }
  }

  const known = new Set(categories.map((c) => c.toLowerCase()));
  const newCategories = new Set<string>();
  for (const r of rows) {
    const v = r.value!;
    if (v.category && !known.has(v.category.toLowerCase())) {
      newCategories.add(v.category);
      r.warnings.push(`New category "${v.category}" will be created`);
    }
    if (r.errors.length) { r.action = 'error'; continue; }
    const old = bySku.get(r.sku);
    if (!old) continue;
    r.changes = FIELDS.filter(([k]) => JSON.stringify(old[k]) !== JSON.stringify(v[k])).map(([, label]) => label);
    r.action = r.changes.length ? 'update' : 'unchanged';
    const physical = r.changes.some((c) => ['length', 'width', 'height', 'weight'].includes(c));
    if (physical && old.unitsInStock) r.warnings.push(`${old.unitsInStock} units in stock — new size/weight is used for space and weight checks from now on`);
  }
  return { rows, newCategories: [...newCategories] };
}

/** Column headers of the template, in order, and how each maps to a field. */
export const COLUMNS: Array<{ header: string; key: keyof RawRow; width: number }> = [
  { header: 'SKU', key: 'sku', width: 16 },
  { header: 'Name', key: 'name', width: 44 },
  { header: 'Category', key: 'category', width: 16 },
  { header: 'Brand', key: 'brand', width: 14 },
  { header: 'Length (cm)', key: 'lengthCm', width: 12 },
  { header: 'Width (cm)', key: 'widthCm', width: 12 },
  { header: 'Height (cm)', key: 'heightCm', width: 12 },
  { header: 'Weight (kg)', key: 'weightKg', width: 12 },
  { header: 'Reorder level', key: 'reorderPoint', width: 13 },
  { header: 'Alias code 1', key: 'alias1', width: 16 },
  { header: 'Alias code 2', key: 'alias2', width: 16 },
  { header: 'Alias code 3', key: 'alias3', width: 16 },
];

/** Match a sheet's header row to our columns (case and spacing don't matter). */
export function mapHeaders(headers: string[]): { map: Map<number, keyof RawRow>; missing: string[] } {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map<number, keyof RawRow>();
  headers.forEach((h, i) => {
    const c = COLUMNS.find((x) => norm(x.header) === norm(h) || norm(x.header.replace(/\s*\(.*\)/, '')) === norm(h));
    if (c) map.set(i, c.key);
  });
  const required = COLUMNS.slice(0, 8).filter((c) => ![...map.values()].includes(c.key)).map((c) => c.header);
  return { map, missing: required };
}
