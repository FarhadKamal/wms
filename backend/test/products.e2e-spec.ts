import { INestApplication } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { TEST_ADMIN_PASSWORD, bootApp, client, login } from './helpers.js';

const HEAD = ['SKU', 'Name', 'Category', 'Brand', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)', 'Reorder level', 'Alias code 1', 'Alias code 2', 'Alias code 3'];
async function xlsx(rows: unknown[][], head = HEAD): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow(head);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Product catalogue + Excel import. Uses its own TEST-* SKUs so the stock tests' products are untouched.
describe('Products and Excel import (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await bootApp();
    admin = client(app, await login(app, 'admin', TEST_ADMIN_PASSWORD));
  });
  afterAll(() => app.close());

  it('gives a template and an export of the current catalogue', async () => {
    const res = await admin.get('/api/products/export').buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); }).expect(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toBe('SKU');
    expect(wb.worksheets[0].rowCount).toBeGreaterThan(10); // the seeded products
    expect(wb.worksheets[1].name).toBe('How to fill');
  });

  it('previews an upload row by row and saves nothing until confirmed', async () => {
    const file = await xlsx([
      ['TEST-PUMP-1', 'Test pump one', 'Water Pumps', 'Pedrollo', 30, 20, 25, 6, 10, 'ERP-9001', '', ''],
      ['TEST-GEN-1', 'Cummins test generator', 'Generators', 'Cummins', 300, 120, 180, 2500, 1, '', '', ''],
      ['TEST-BAD-1', '', 'Water Pumps', 'HCP', 'abc', 20, 25, 6, 5, '', '', ''],
      ['TEST-PUMP-1', 'Duplicate', 'Water Pumps', 'Pedrollo', 30, 20, 25, 6, 10, '', '', ''],
    ]);
    const p = (await admin.post('/api/products/import/preview').attach('file', file, 'products.xlsx').expect(200)).body;
    expect(p.summary).toEqual({ total: 4, new: 2, update: 0, unchanged: 0, error: 2 });
    expect(p.newCategories).toEqual(['Generators']);
    expect(p.rows[2].errors).toEqual(expect.arrayContaining(['Name is required', 'Length must be a number']));
    expect(p.rows[3].errors).toEqual(['SKU TEST-PUMP-1 is already on row 2']);

    const refused = await admin.post('/api/products/import').attach('file', file, 'products.xlsx').expect(400);
    expect(refused.body.message).toMatch(/2 rows have errors/);
    await admin.get('/api/products/TEST-PUMP-1').expect(404); // nothing saved
  });

  it('imports a clean file and finds products by any alias code', async () => {
    const file = await xlsx([
      ['TEST-PUMP-1', 'Test pump one', 'Water Pumps', 'Pedrollo', 30, 20, 25, 6, 10, 'erp-9001', 'SUP-PQ60', ''],
      ['TEST-PUMP-2', 'Test pump two', 'Water Pumps', 'HCP', 40, 28, 32, 12, '', '', '', 'OLD-77'],
      ['PDR-PQM60', 'Pedrollo PQm 60 Peripheral Pump 0.5HP', 'Water Pumps', 'Pedrollo', 30, 20, 25, 6, 15, 'ERP-1001', '', ''], // existing: adds an alias only
    ]);
    const r = (await admin.post('/api/products/import').attach('file', file, 'products.xlsx').expect(200)).body;
    expect(r).toMatchObject({ new: 2, update: 1, error: 0 });

    expect((await admin.get('/api/products/ERP-9001').expect(200)).body).toMatchObject({ sku: 'TEST-PUMP-1', aliases: ['ERP-9001', 'SUP-PQ60', null] });
    expect((await admin.get('/api/products/old-77').expect(200)).body.sku).toBe('TEST-PUMP-2'); // case doesn't matter
    expect((await admin.get('/api/products?q=SUP-PQ').expect(200)).body.map((p: { sku: string }) => p.sku)).toEqual(['TEST-PUMP-1']);
    expect((await admin.get('/api/warehouses/CTG/scan?code=ERP-1001').expect(200)).body).toEqual({ type: 'product', sku: 'PDR-PQM60' });
    const stock = (await admin.get('/api/warehouses/CTG/stock').expect(200)).body;
    expect(stock.find((s: { sku: string }) => s.sku === 'PDR-PQM60').aliases).toEqual(['ERP-1001']);
  });

  it('keeps alias codes unique, but lets one upload swap them', async () => {
    const clash = await xlsx([['TEST-PUMP-2', 'Test pump two', 'Water Pumps', 'HCP', 40, 28, 32, 12, 0, 'ERP-9001', '', '']]);
    const p = (await admin.post('/api/products/import/preview').attach('file', clash, 'p.xlsx').expect(200)).body;
    expect(p.rows[0].errors).toEqual(['Alias ERP-9001 already belongs to TEST-PUMP-1']);

    const swap = await xlsx([
      ['TEST-PUMP-1', 'Test pump one', 'Water Pumps', 'Pedrollo', 30, 20, 25, 6, 10, 'OLD-77', '', ''],
      ['TEST-PUMP-2', 'Test pump two', 'Water Pumps', 'HCP', 40, 28, 32, 12, 0, 'ERP-9001', '', ''],
    ]);
    await admin.post('/api/products/import').attach('file', swap, 'p.xlsx').expect(200);
    expect((await admin.get('/api/products/OLD-77').expect(200)).body.sku).toBe('TEST-PUMP-1');
    expect((await admin.get('/api/products/ERP-9001').expect(200)).body.sku).toBe('TEST-PUMP-2');
  });

  it('adds and edits one product on screen with the same rules', async () => {
    const created = (await admin.post('/api/products').send({ sku: 'test-fan-1', name: 'RT.FANS test fan', category: 'Fans', brand: 'RT.FANS', lengthCm: 80, widthCm: 80, heightCm: 40, weightKg: 9, alias1: 'FAN-A' }).expect(201)).body;
    expect(created).toMatchObject({ sku: 'TEST-FAN-1', category: { name: 'Fans', idRule: 'GENERATED' }, aliases: ['FAN-A', null, null] });
    await admin.post('/api/products').send({ sku: 'TEST-FAN-1', name: 'x', category: 'Fans', brand: 'x', lengthCm: 1, widthCm: 1, heightCm: 1, weightKg: 1 }).expect(409);
    const dup = await admin.patch('/api/products/TEST-FAN-1').send({ name: 'RT.FANS test fan', category: 'Fans', brand: 'RT.FANS', lengthCm: 80, widthCm: 80, heightCm: 40, weightKg: 9, alias1: 'OLD-77' }).expect(400);
    expect(dup.body.message).toMatch(/already belongs to TEST-PUMP-1/);
    const edited = (await admin.patch('/api/products/TEST-FAN-1').send({ name: 'RT.FANS test fan', category: 'Fans', brand: 'RT.FANS', lengthCm: 80, widthCm: 80, heightCm: 40, weightKg: 9.5 }).expect(200)).body;
    expect(edited).toMatchObject({ weightKg: 9.5, aliases: [null, null, null] });
  });

  it('rejects files that are not the template', async () => {
    await admin.post('/api/products/import/preview').attach('file', Buffer.from('a,b'), 'p.csv').expect(400);
    await admin.post('/api/products/import/preview').attach('file', Buffer.from('not excel'), 'p.xlsx').expect(400);
    const noWeight = await xlsx([['X-1', 'n', 'c', 'b', 1, 1, 1]], HEAD.slice(0, 7));
    const res = await admin.post('/api/products/import/preview').attach('file', noWeight, 'p.xlsx').expect(400);
    expect(res.body.message).toMatch(/Missing column: Weight \(kg\)/);
  });

  it('lets only the Admin change products; everyone can search by alias', async () => {
    await admin.post('/api/users').send({ username: 'viewer', fullName: 'Viewer', role: 'MANAGEMENT', company: 'AZNEO', warehouses: [], password: 'Warehouse2026' }).expect(201);
    const viewer = client(app, await login(app, 'viewer', 'Warehouse2026'));
    expect((await viewer.get('/api/products?q=ERP-9001').expect(200)).body[0].sku).toBe('TEST-PUMP-2');
    const file = await xlsx([['TEST-X', 'x', 'Water Pumps', 'x', 1, 1, 1, 1, 0]]);
    await viewer.post('/api/products/import').attach('file', file, 'p.xlsx').expect(403);
    await viewer.post('/api/products').send({ sku: 'TEST-Y', name: 'y', category: 'Fans', brand: 'y', lengthCm: 1, widthCm: 1, heightCm: 1, weightKg: 1 }).expect(403);
  });
});
