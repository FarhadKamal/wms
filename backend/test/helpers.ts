import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

export const TEST_ADMIN_PASSWORD = 'TestAdmin2026';

/** Boot the API the same way main.ts does. */
export async function bootApp(): Promise<INestApplication> {
  expect(process.env.DATABASE_URL).toMatch(/_test\?/); // never run against dev/live data
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function login(app: INestApplication, username: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

/** supertest with the Authorization header already set. */
export function client(app: INestApplication, token?: string) {
  const r = request(app.getHttpServer());
  const auth = <T extends { set: (k: string, v: string) => T }>(t: T) => (token ? t.set('Authorization', `Bearer ${token}`) : t);
  return {
    get: (url: string) => auth(r.get(url)),
    post: (url: string) => auth(r.post(url)),
    put: (url: string) => auth(r.put(url)),
    patch: (url: string) => auth(r.patch(url)),
    delete: (url: string) => auth(r.delete(url)),
  };
}
