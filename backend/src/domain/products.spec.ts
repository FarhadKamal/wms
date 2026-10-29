import { ExistingProduct, RawRow, checkImport, mapHeaders, readRow } from './products.js';

const row = (n: number, o: Partial<RawRow> = {}): RawRow => ({
  row: n, sku: 'PDR-PQM60', name: 'Pedrollo PQm 60', category: 'Water Pumps', brand: 'Pedrollo',
  lengthCm: 30, widthCm: 20, heightCm: 25, weightKg: 6, reorderPoint: 15, ...o,
});
const existing = (o: Partial<ExistingProduct> = {}): ExistingProduct => ({
  sku: 'PDR-PQM60', name: 'Pedrollo PQm 60', category: 'Water Pumps', brand: 'Pedrollo',
  lengthCm: 30, widthCm: 20, heightCm: 25, weightKg: 6, reorderPoint: 15, aliases: [null, null, null], unitsInStock: 0, ...o,
});
const CATS = ['Water Pumps', 'Cars'];

describe('readRow', () => {
  it('normalises codes and accepts empty aliases', () => {
    const r = readRow(row(2, { sku: ' pdr-pqm60 ', alias1: ' erp 1001 ', alias2: '', alias3: null, reorderPoint: '' }));
    expect(r.errors).toEqual([]);
    expect(r.value).toMatchObject({ sku: 'PDR-PQM60', aliases: ['ERP 1001', null, null], reorderPoint: 0 });
  });

  it('reports every problem in the row', () => {
    const r = readRow(row(2, { sku: '', name: '', lengthCm: 'abc', weightKg: 0, reorderPoint: 2.5, alias1: 'X1', alias2: 'x1' }));
    expect(r.errors).toEqual(expect.arrayContaining([
      'SKU is required', 'Name is required', 'Length must be a number', 'Weight must be more than 0',
      'Reorder level must be a whole number', 'The same alias code is used twice in this row',
    ]));
  });

  it('accepts numbers typed with thousands separators', () => {
    expect(readRow(row(2, { weightKg: '1,550' })).value.weightKg).toBe(1550);
  });
});

describe('checkImport', () => {
  it('classifies new, updated and unchanged rows', () => {
    const { rows } = checkImport(
      [row(2), row(3, { sku: 'PDR-PQM81', name: 'Pedrollo PQm 81' }), row(4, { sku: 'HCP-JET05', name: 'HCP Jet', weightKg: 13 })],
      [existing(), existing({ sku: 'HCP-JET05', name: 'HCP Jet', weightKg: 12, unitsInStock: 30 })], CATS,
    );
    expect(rows.map((r) => r.action)).toEqual(['unchanged', 'new', 'update']);
    expect(rows[2].changes).toEqual(['weight']);
    expect(rows[2].warnings[0]).toMatch(/30 units in stock/);
  });

  it('refuses duplicate SKUs in the file', () => {
    const { rows } = checkImport([row(2), row(3)], [], CATS);
    expect(rows[1]).toMatchObject({ action: 'error', errors: ['SKU PDR-PQM60 is already on row 2'] });
  });

  it('keeps alias codes unique across all products', () => {
    const others = [existing({ sku: 'HCP-JET05', aliases: ['ERP-55', null, null] })];
    const clash = checkImport([row(2, { alias1: 'erp-55' })], others, CATS).rows[0];
    expect(clash.errors).toEqual(['Alias ERP-55 already belongs to HCP-JET05']);
    const sku = checkImport([row(2, { alias1: 'HCP-JET05' })], others, CATS).rows[0];
    expect(sku.errors).toContain('Alias HCP-JET05 is the SKU of another product');
    const twoInFile = checkImport([row(2, { alias1: 'A1' }), row(3, { sku: 'X-2', alias2: 'A1' })], [], CATS).rows[1];
    expect(twoInFile.errors).toEqual(['Alias A1 already belongs to PDR-PQM60']);
  });

  it('lets one upload swap aliases between two products', () => {
    const before = [existing({ aliases: ['A', null, null] }), existing({ sku: 'X-2', aliases: ['B', null, null] })];
    const { rows } = checkImport([row(2, { alias1: 'B' }), row(3, { sku: 'X-2', alias1: 'A' })], before, CATS);
    expect(rows.map((r) => r.action)).toEqual(['update', 'update']);
  });

  it('warns about new categories instead of failing', () => {
    const r = checkImport([row(2, { sku: 'CUM-KTA38', category: 'Generators' })], [], CATS);
    expect(r.newCategories).toEqual(['Generators']);
    expect(r.rows[0]).toMatchObject({ action: 'new', warnings: ['New category "Generators" will be created'] });
  });
});

describe('mapHeaders', () => {
  it('matches headers loosely and lists missing required columns', () => {
    const { map, missing } = mapHeaders(['sku', 'NAME', 'Category', 'Brand', 'Length', 'Width (cm)', 'height(cm)', 'Alias Code 2']);
    expect(map.get(4)).toBe('lengthCm');
    expect(map.get(7)).toBe('alias2');
    expect(missing).toEqual(['Weight (kg)']);
  });
});
