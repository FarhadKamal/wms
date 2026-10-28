import { INestApplication } from '@nestjs/common';
import { TEST_ADMIN_PASSWORD, bootApp, client, login } from './helpers.js';

// Logins and role-based permissions. Uses Dhaka for its own stock so it doesn't disturb the Chittagong tests.
describe('Logins and roles (e2e)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof client>;
  const pw = 'Warehouse2026';
  const users: Record<string, { id: string; token: string }> = {};

  beforeAll(async () => {
    app = await bootApp();
    admin = client(app, await login(app, 'admin', TEST_ADMIN_PASSWORD));
    const make = async (username: string, fullName: string, role: string, company: string, warehouses: string[]) => {
      const res = await admin.post('/api/users').send({ username, fullName, role, company, warehouses, password: pw });
      if (res.status !== 201) throw new Error(`create ${username}: ${res.status} ${JSON.stringify(res.body)}`);
      users[username] = { id: res.body.id, token: await login(app, username, pw) };
    };
    await make('rahim', 'Rahim Uddin', 'STORE_KEEPER', 'PNL', ['CTG']);
    await make('karim', 'Karim Ahmed', 'MANAGER', 'AZNEO', ['CTG']);
    await make('nasrin', 'Nasrin Akter', 'STORE_KEEPER', 'AZNEO', ['DHK']);
    await make('director', 'Managing Director', 'MANAGEMENT', 'AZNEO', []);
  });
  afterAll(() => app.close());
  const as = (u: string) => client(app, users[u].token);

  it('requires a login, except for the health check', async () => {
    await client(app).get('/api/warehouses').expect(401);
    await client(app).get('/api/health').expect(200);
    await client(app, 'not-a-real-token').get('/api/warehouses').expect(401);
  });

  it('rejects wrong passwords and slows down guessing', async () => {
    await client(app).post('/api/auth/login').send({ username: 'karim', password: 'wrong' }).expect(401);
    await admin.post('/api/users').send({ username: 'guess', fullName: 'Target', role: 'MANAGEMENT', company: 'AZNEO', warehouses: [], password: pw }).expect(201);
    for (let i = 0; i < 5; i++) await client(app).post('/api/auth/login').send({ username: 'guess', password: 'nope' }).expect(401);
    const locked = await client(app).post('/api/auth/login').send({ username: 'guess', password: pw }).expect(429);
    expect(locked.body.message).toMatch(/Too many failed attempts/);
  });

  it('shows each user only their warehouses; management sees all', async () => {
    const codes = async (u: string) => (await as(u).get('/api/warehouses').expect(200)).body.map((w: { code: string }) => w.code);
    expect(await codes('rahim')).toEqual(['CTG']);
    expect(await codes('nasrin')).toEqual(['DHK']);
    expect(await codes('director')).toEqual(expect.arrayContaining(['CTG', 'DHK']));
    await as('rahim').get('/api/warehouses/DHK/structure').expect(403);
    await as('director').get('/api/warehouses/DHK/structure').expect(200);
  });

  it('lets store keepers move stock but not change the layout', async () => {
    const doc = (await as('nasrin').post('/api/warehouses/DHK/receipts')
      .send({ party: 'Local supplier', preparedBy: 'Someone Else', lines: [{ sku: 'PDR-PQM60', qty: 2 }] }).expect(201)).body;
    expect(doc.preparedBy).toBe('Nasrin Akter'); // from the login, not from what the client sent
    const u = (await as('nasrin').get(`/api/units/${doc.lines[0].uids[0]}`).expect(200)).body;
    expect(u.events[0].by).toBe('Nasrin Akter');

    await as('rahim').get(`/api/documents/${doc.no}`).expect(403); // a Dhaka challan, Chittagong user
    await as('director').get(`/api/documents/${doc.no}`).expect(200);

    const setup = await as('nasrin').post('/api/warehouses/DHK/blocks').send({ name: 'X', areaSqft: 100, rows: 2, cols: 2 }).expect(403);
    expect(setup.body.message).toMatch(/store keeper/);
  });

  it('lets managers change the layout of their own warehouse only', async () => {
    await as('karim').patch('/api/warehouses/CTG/racks/RK2').send({ mergedShelves: [] }).expect(200);
    await as('karim').patch('/api/warehouses/DHK').send({ landmark: 'x' }).expect(403);
    await as('karim').post('/api/warehouses').send({ code: 'SYL', name: 'Sylhet', address: 'x', areaSqft: 100 }).expect(403); // admin only
  });

  it('keeps management read-only', async () => {
    await as('director').get('/api/warehouses/CTG/dashboard').expect(200);
    await as('director').post('/api/warehouses/CTG/receipts').send({ party: 'x', lines: [{ sku: 'PDR-PQM60', qty: 1 }] }).expect(403);
    await as('director').get('/api/users').expect(403);
  });

  it('lets only the admin manage users, and never locks the system out', async () => {
    await as('karim').post('/api/users').send({ username: 'x1', fullName: 'X', role: 'ADMIN', company: 'AZNEO', warehouses: [] }).expect(403);
    const list = (await admin.get('/api/users').expect(200)).body;
    expect(list.find((x: { username: string }) => x.username === 'rahim')).toMatchObject({ role: 'STORE_KEEPER', company: 'PNL', warehouses: [{ code: 'CTG', name: 'Chittagong' }] });
    expect(list[0]).not.toHaveProperty('passwordHash');

    const me = list.find((x: { username: string }) => x.username === 'admin');
    const self = await admin.patch(`/api/users/${me.id}`).send({ role: 'MANAGER', warehouses: ['CTG'] }).expect(400);
    expect(self.body.message).toMatch(/your own Admin/);
    await admin.post('/api/users').send({ username: 'sk', fullName: 'No Warehouse', role: 'STORE_KEEPER', company: 'PNL', warehouses: [] }).expect(400);

    const gen = (await admin.post('/api/users').send({ username: 'newbie', fullName: 'New Person', role: 'MANAGEMENT', company: 'PNL', warehouses: [] }).expect(201)).body;
    expect(gen.password).toMatch(/^[a-z]+-\d{4}-[A-Z][a-z]+$/); // generated, shown once
    await login(app, 'newbie', gen.password);
  });

  it('logs out deactivated users at once', async () => {
    const t = users.rahim.token;
    await client(app, t).get('/api/warehouses').expect(200);
    await admin.patch(`/api/users/${users.rahim.id}`).send({ active: false }).expect(200);
    await client(app, t).get('/api/warehouses').expect(401);
    await client(app).post('/api/auth/login').send({ username: 'rahim', password: pw }).expect(401);
    await admin.patch(`/api/users/${users.rahim.id}`).send({ active: true }).expect(200);
  });

  it('lets users change their own password', async () => {
    await as('karim').post('/api/auth/password').send({ current: 'wrong', next: 'NewPass2026' }).expect(400);
    await as('karim').post('/api/auth/password').send({ current: pw, next: 'short' }).expect(400);
    await as('karim').post('/api/auth/password').send({ current: pw, next: 'NewPass2026' }).expect(200);
    await login(app, 'karim', 'NewPass2026');
    const me = (await as('karim').get('/api/auth/me').expect(200)).body;
    expect(me).toMatchObject({ fullName: 'Karim Ahmed', role: 'MANAGER', warehouses: [{ code: 'CTG' }] });
  });
});
