import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

// Runs against the TEST database, freshly reset and seeded with the Chittagong layout (see global-setup.ts).
describe('Warehouse Setup API (e2e)', () => {
  let app: INestApplication;
  let api: () => ReturnType<typeof request>;
  let typeA: string, shelfPlate: string, floorPallet: string;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toMatch(/_test\?/); // never run against dev/live data
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    api = () => request(app.getHttpServer());
    const rt = (await api().get('/api/rack-types')).body;
    const pt = (await api().get('/api/plate-types')).body;
    typeA = rt.find((t: { name: string }) => t.name === 'Type A').id;
    shelfPlate = pt.find((t: { name: string }) => t.name === 'Shelf plate').id;
    floorPallet = pt.find((t: { name: string }) => t.name === 'Floor pallet').id;
  });
  afterAll(() => app.close());

  it('lists the seeded warehouses', async () => {
    const res = await api().get('/api/warehouses').expect(200);
    expect(res.body.map((w: { code: string }) => w.code)).toEqual(['CTG', 'DHK']);
  });

  it('returns the Chittagong structure as in the prototype', async () => {
    const { body } = await api().get('/api/warehouses/CTG/structure').expect(200);
    expect(body.summary).toMatchObject({ blocks: 4, racks: 5, plates: 19, platesInShelves: 8, platesOnFloor: 11, locations: 144 });
    expect(body.racks.map((r: { lengthCells: number }) => r.lengthCells)).toEqual([3, 4, 4, 5, 5]);
    const rk3 = body.racks.find((r: { code: string }) => r.code === 'RK3');
    expect(rk3.shelves.at(-1)).toMatchObject({ level: 3, span: 2, heightCm: 120, capKg: 600 });
    expect(body.plates.find((p: { label: string }) => p.label === 'PL-CTG-0012').address).toBe('A-RK2-S1-B1-P1');
  });

  it('suggests where a new rack can go', async () => {
    const a = await api().get(`/api/warehouses/CTG/racks/suggest?block=A&type=${typeA}&direction=ROW`).expect(200);
    expect(a.body).toMatchObject({ lengthCells: 3, startRow: null }); // Block A has no free run of 3 cells
    const b = await api().get(`/api/warehouses/CTG/racks/suggest?block=B&type=${typeA}&direction=ROW`).expect(200);
    expect(b.body).toMatchObject({ lengthCells: 1, bays: 1, startRow: 1, startCol: 1 }); // Block B cells ≈ 3.7 m
  });

  it('creates a rack, refuses overlaps and non-storage cells', async () => {
    const res = await api().post('/api/warehouses/CTG/racks')
      .send({ blockCode: 'B', rackTypeId: typeA, startRow: 1, startCol: 1, direction: 'ROW' }).expect(201);
    expect(res.body).toMatchObject({ code: 'RK6', lengthCells: 1, bays: 1 });

    const clash = await api().post('/api/warehouses/CTG/racks')
      .send({ blockCode: 'B', rackTypeId: typeA, startRow: 1, startCol: 1, direction: 'COLUMN' }).expect(409);
    expect(clash.body.message).toMatch(/Another rack/);

    const paint = await api().put('/api/warehouses/CTG/blocks/B/cells').send({ cells: [{ row: 1, col: 1 }], use: 'OFFICE' }).expect(409);
    expect(paint.body.message).toMatch(/must be Storage/);
  });

  it('adds plates to a shelf up to what fits, numbering them in sequence', async () => {
    const tooMany = await api().post('/api/warehouses/CTG/plates')
      .send({ plateTypeId: shelfPlate, count: 6, rackCode: 'RK6', shelfLevel: 1, bay: 1 }).expect(409);
    expect(tooMany.body.message).toMatch(/Only 5 more/); // 300 cm bay ÷ 60 cm plates
    const ok = await api().post('/api/warehouses/CTG/plates')
      .send({ plateTypeId: shelfPlate, count: 2, rackCode: 'RK6', shelfLevel: 1, bay: 1 }).expect(201);
    expect(ok.body.labels).toEqual(['PL-CTG-0020', 'PL-CTG-0021']);
  });

  it('blocks changes that would strand plates, then allows them once cleared', async () => {
    const bays0 = await api().patch('/api/warehouses/CTG/racks/RK6').send({ bays: 0 }).expect(409);
    expect(bays0.body.message).toMatch(/PL-CTG-0020/);
    const del = await api().delete('/api/warehouses/CTG/racks/RK6').expect(409);
    expect(del.body.message).toMatch(/left without a place/);

    await api().delete('/api/warehouses/CTG/plates/PL-CTG-0020').expect(200);
    await api().delete('/api/warehouses/CTG/plates/PL-CTG-0021').expect(200);
    await api().delete('/api/warehouses/CTG/racks/RK6').expect(200);
    const { body } = await api().get('/api/warehouses/CTG/structure').expect(200);
    expect(body.summary).toMatchObject({ racks: 5, plates: 19, locations: 144 });
  });

  // Rack 2's upper shelves: the stock tests never put anything there, so file order doesn't matter.
  it('merges and splits shelves', async () => {
    const rk2 = async () => (await api().get('/api/warehouses/CTG/structure')).body.racks.find((r: { code: string }) => r.code === 'RK2');
    await api().patch('/api/warehouses/CTG/racks/RK2').send({ mergedShelves: [3] }).expect(200);
    expect((await rk2()).shelves.at(-1)).toMatchObject({ level: 3, span: 2, heightCm: 120 });
    await api().patch('/api/warehouses/CTG/racks/RK2').send({ mergedShelves: [2, 3] }).expect(400); // overlapping merges
    await api().patch('/api/warehouses/CTG/racks/RK2').send({ mergedShelves: [] }).expect(200);
    expect((await rk2()).shelves).toHaveLength(4);
  });

  it('suggests a floor cell for plates and places them', async () => {
    const s = await api().get(`/api/warehouses/CTG/plates/suggest-floor?block=B&type=${floorPallet}`).expect(200);
    expect(s.body).toMatchObject({ row: 1, col: 1 });
    expect(s.body.room).toBeGreaterThan(5);
    const res = await api().post('/api/warehouses/CTG/plates').send({ plateTypeId: floorPallet, count: 2, blockCode: 'B', row: 1, col: 1 }).expect(201);
    expect(res.body.labels).toHaveLength(2);
  });

  it('sets up a brand-new warehouse from scratch', async () => {
    await api().post('/api/warehouses').send({ code: 'KHL', name: 'Khulna', address: 'Test road', areaSqft: 5000 }).expect(201);
    await api().post('/api/warehouses').send({ code: 'KHL', name: 'Again', address: 'x', areaSqft: 10 }).expect(409);

    const tooBig = await api().post('/api/warehouses/KHL/blocks').send({ name: 'Huge', areaSqft: 6000, rows: 4, cols: 5 }).expect(409);
    expect(tooBig.body.message).toMatch(/Not enough area/);
    const blk = await api().post('/api/warehouses/KHL/blocks').send({ name: 'Main Block', areaSqft: 3000, rows: 4, cols: 5 }).expect(201);
    expect(blk.body.code).toBe('A');

    await api().put('/api/warehouses/KHL/blocks/A/cells')
      .send({ cells: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }], use: 'OFFICE', areaName: 'Office' }).expect(200);
    const { body } = await api().get('/api/warehouses/KHL/structure').expect(200);
    expect(body.summary.areaByUse).toEqual({ STORAGE: 2400, OFFICE: 600 });
    expect(body.blocks[0].names['1,1']).toBe('Office');

    await api().patch('/api/warehouses/KHL').send({ areaSqft: 2000 }).expect(409); // smaller than its blocks
    await api().patch('/api/warehouses/KHL/blocks/A').send({ rows: 3 }).expect(200);
    expect((await api().get('/api/warehouses/KHL/structure')).body.blocks[0].rows).toBe(3);
  });

  it('validates input', async () => {
    await api().post('/api/warehouses').send({ code: 'toolong', name: '', address: 'x', areaSqft: -1 }).expect(400);
    await api().get('/api/warehouses/NOPE/structure').expect(404);
  });
});
