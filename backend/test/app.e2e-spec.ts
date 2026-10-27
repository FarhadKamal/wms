import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('GET /api/health answers even when the database is unreachable', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.api).toBe('ok');
    expect(['ok', 'unreachable']).toContain(res.body.database);
  });

  afterEach(async () => {
    await app.close();
  });
});
