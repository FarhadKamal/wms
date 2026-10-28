import { INestApplication } from '@nestjs/common';
import { TEST_ADMIN_PASSWORD, bootApp, client, login } from './helpers.js';

// Stock movement on the TEST database (reset + seeded with Chittagong, no stock) — see global-setup.ts.
describe('Stock movement API (e2e)', () => {
  let app: INestApplication;
  let api: () => ReturnType<typeof client>;
  const year = new Date(Date.now() + 6 * 3600_000).getUTCFullYear();
  const M = 'Warehouse Manager';
  let rcv: { no: string; lines: Array<{ sku: string; uids: string[] }> };
  const uidsOf = (sku: string) => rcv.lines.find((l) => l.sku === sku)!.uids;

  beforeAll(async () => {
    app = await bootApp();
    const token = await login(app, 'admin', TEST_ADMIN_PASSWORD);
    api = () => client(app, token);
  });
  afterAll(() => app.close());

  it('receives a delivery: one challan, one ID per unit, VINs for cars', async () => {
    const res = await api().post('/api/warehouses/CTG/receipts').send({
      party: 'Pedrollo S.p.A. (import)', reference: 'BL-TEST-1', preparedBy: M,
      lines: [
        { sku: 'PDR-PQM60', qty: 10 }, { sku: 'PDR-4SR1', qty: 3 }, { sku: 'PDR-2CPM25', qty: 12 },
        { sku: 'SUB-XV16', qty: 2, vins: ['JF1GTAA61RH900001', 'jf1gtaa61rh900002'] },
      ],
    }).expect(201);
    rcv = res.body;
    expect(rcv.no).toBe(`RCV-CTG-${year}-0001`);
    expect(res.body.units).toBe(27);
    expect(uidsOf('PDR-PQM60')).toHaveLength(10);
    // Unit serials are global across warehouses (other test files may have used some), so check format + sequence.
    const serials = uidsOf('PDR-PQM60').map((u) => Number(u.match(/^PDR-PQM60-(\d{4})$/)![1]));
    expect(serials).toEqual(serials.map((_, i) => serials[0] + i));
    expect(uidsOf('SUB-XV16')).toEqual(['JF1GTAA61RH900001', 'JF1GTAA61RH900002']);
  });

  it('rejects bad VINs and duplicates', async () => {
    const bad = (vins: string[], qty = vins.length) => api().post('/api/warehouses/CTG/receipts')
      .send({ party: 'X', preparedBy: M, lines: [{ sku: 'SUB-XV16', qty, vins }] });
    expect((await bad(['JF1GTAA61RH900003'], 2).expect(400)).body.message).toMatch(/2 cars but 1 VINs/);
    expect((await bad(['SHORTVIN']).expect(400)).body.message).toMatch(/17 valid/);
    expect((await bad(['JF1GTAA61RH900001']).expect(409)).body.message).toMatch(/Already in the system/);
  });

  it('lists what waits for put-away and suggests the merged shelf for tall pumps', async () => {
    const pending = (await api().get('/api/warehouses/CTG/putaway').expect(200)).body;
    expect(pending).toHaveLength(4);
    const s = (await api().post('/api/warehouses/CTG/suggest').send({ uids: uidsOf('PDR-4SR1') }).expect(200)).body;
    expect(s.suggestions[0].address).toMatch(/^A-RK3-S3-B\d$/); // S3+S4 merged = 120 cm
    expect(s.bestQty).toBe(3);
  });

  it('puts away only where space, height and weight allow', async () => {
    const tall = await api().post('/api/warehouses/CTG/putaway').send({ uids: uidsOf('PDR-4SR1'), location: 'A-RK1-S1-B1', by: M }).expect(409);
    expect(tall.body.message).toMatch(/Too tall/);
    await api().post('/api/warehouses/CTG/putaway').send({ uids: uidsOf('PDR-4SR1'), location: 'A-RK3-S3-B1', by: M }).expect(201);
    await api().post('/api/warehouses/CTG/putaway').send({ uids: uidsOf('PDR-PQM60'), location: 'A-RK1-S1-B1', by: M }).expect(201);

    const [car1, car2] = uidsOf('SUB-XV16');
    expect((await api().post('/api/warehouses/CTG/putaway').send({ uids: [car1], location: 'A-RK1-S1-B2', by: M }).expect(409)).body.message).toMatch(/Vehicles/);
    await api().post('/api/warehouses/CTG/putaway').send({ uids: [car1], location: 'C-R1C1', by: M }).expect(201);
    expect((await api().post('/api/warehouses/CTG/putaway').send({ uids: [car2], location: 'C-R1C1', by: M }).expect(409)).body.message).toMatch(/occupied/);
    await api().post('/api/warehouses/CTG/putaway').send({ uids: [car2], location: 'AZWMS|L|CTG|C-R1C2', by: M }).expect(201); // scanned QR form
  });

  it('refuses a shelf at its weight limit even with space left (Rack 4 = 250 kg/shelf)', async () => {
    const twin = uidsOf('PDR-2CPM25'); // 27 kg each
    for (const [i, bay] of ['A-RK4-S1-B1', 'A-RK4-S1-B2', 'A-RK4-S1-B3'].entries()) {
      await api().post('/api/warehouses/CTG/putaway').send({ uids: twin.slice(i * 3, i * 3 + 3), location: bay, by: M }).expect(201);
    }
    const full = await api().post('/api/warehouses/CTG/putaway').send({ uids: twin.slice(9, 10), location: 'A-RK4-S1-B4', by: M }).expect(409);
    expect(full.body.message).toMatch(/Shelf weight limit: 270 \/ 250 kg/);
    const pos = (await api().get('/api/warehouses/CTG/positions/A-RK4-S1-B1').expect(200)).body;
    expect(pos.shelf).toMatchObject({ usedKg: 243, capKg: 250 });
    const st = (await api().get('/api/warehouses/CTG/structure').expect(200)).body;
    expect(st.summary.shelvesAtWeightLimit).toContain('RK4-S1');
  });

  it('never lets two simultaneous put-aways overload one shelf', async () => {
    // Receive 10 more twin pumps; 5 + 5 on RK4 shelf 2 = 270 kg > 250 kg, though each half fits alone.
    const r = (await api().post('/api/warehouses/CTG/receipts').send({ party: 'X', preparedBy: M, lines: [{ sku: 'PDR-2CPM25', qty: 10 }] }).expect(201)).body;
    const u = r.lines[0].uids as string[];
    const results = await Promise.all([
      api().post('/api/warehouses/CTG/putaway').send({ uids: u.slice(0, 5), location: 'A-RK4-S2-B1', by: 'A' }),
      api().post('/api/warehouses/CTG/putaway').send({ uids: u.slice(5), location: 'A-RK4-S2-B2', by: 'B' }),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([201, 409]);
    const pos = (await api().get('/api/warehouses/CTG/positions/A-RK4-S2-B1').expect(200)).body;
    expect(pos.shelf.usedKg).toBe(135);
  });

  it('moves stock with a transfer slip; the unit keeps its ID', async () => {
    const two = uidsOf('PDR-PQM60').slice(0, 2);
    const doc = (await api().post('/api/warehouses/CTG/transfers').send({ uids: two, location: 'A-RK1-S2-B1', reason: 'test', by: M }).expect(201)).body;
    expect(doc.no).toBe(`TRF-CTG-${year}-0001`);
    expect(doc.lines[0]).toMatchObject({ sku: 'PDR-PQM60', uids: two, from: { 'A-RK1-S1-B1': 2 } });
    await api().post('/api/warehouses/CTG/transfers').send({ uids: two, location: 'A-RK1-S2-B1', by: M }).expect(409); // already there
  });

  it('dispatches all scanned units on one challan, and never twice', async () => {
    const out = [...uidsOf('PDR-PQM60').slice(2, 5), uidsOf('SUB-XV16')[0]];
    const doc = (await api().post('/api/warehouses/CTG/dispatches').send({ party: 'Agrani Traders', destination: "Cox's Bazar", preparedBy: M, uids: out }).expect(201)).body;
    expect(doc.no).toBe(`DSP-CTG-${year}-0001`);
    expect(doc.units).toBe(4);
    expect(doc.lines.map((l: { sku: string }) => l.sku).sort()).toEqual(['PDR-PQM60', 'SUB-XV16']);
    const again = await api().post('/api/warehouses/CTG/dispatches').send({ party: 'X', preparedBy: M, uids: out.slice(0, 1) }).expect(409);
    expect(again.body.message).toMatch(/Already dispatched/);
  });

  it('shows a unit with its whole history', async () => {
    const uid = uidsOf('PDR-PQM60')[0];
    const u = (await api().get(`/api/units/AZWMS|U|${uid}`).expect(200)).body;
    expect(u.status).toBe('IN_STOCK');
    expect(u.location.address).toBe('A-RK1-S2-B1');
    expect(u.events.map((e: { type: string }) => e.type)).toEqual(['RECEIVED', 'PUT_AWAY', 'MOVED']);
  });

  it('blocks a layout change that would strand real stock', async () => {
    const res = await api().patch('/api/warehouses/CTG/racks/RK3').send({ mergedShelves: [] }).expect(409);
    expect(res.body.message).toMatch(/too tall/);
  });

  it('flags bay boards that changed and clears them', async () => {
    const boards = (await api().get('/api/warehouses/CTG/boards').expect(200)).body;
    expect(boards.map((b: { code: string }) => b.code)).toEqual(expect.arrayContaining(['A-RK3-S3-B1', 'A-RK4-S1-B1', 'A-RK1-S2-B1']));
    await api().post('/api/warehouses/CTG/boards/*/updated').expect(200);
    expect((await api().get('/api/warehouses/CTG/boards').expect(200)).body).toHaveLength(0);
  });

  it('reports stock, documents, dashboard and scans', async () => {
    const stock = (await api().get('/api/warehouses/CTG/stock').expect(200)).body;
    expect(stock.find((p: { sku: string }) => p.sku === 'PDR-PQM60')).toMatchObject({ onShelf: 7, inReceiving: 0, total: 7 });
    expect(stock.find((p: { sku: string }) => p.sku === 'PDR-2CPM25')).toMatchObject({ onShelf: 14, inReceiving: 8 });
    const docs = (await api().get('/api/warehouses/CTG/documents?type=RCV').expect(200)).body;
    expect(docs).toHaveLength(2);
    const dash = (await api().get('/api/warehouses/CTG/dashboard').expect(200)).body;
    expect(dash).toMatchObject({ staging: 8, dispatchedToday: 4, boardsToUpdate: 0 });
    expect((await api().get(`/api/warehouses/CTG/scan?code=${encodeURIComponent(`AZWMS|D|DSP-CTG-${year}-0001`)}`).expect(200)).body.type).toBe('document');
    expect((await api().get('/api/warehouses/CTG/scan?code=PL-CTG-0004').expect(200)).body).toMatchObject({ type: 'location', board: 'A-R9C2' });
  });
});
