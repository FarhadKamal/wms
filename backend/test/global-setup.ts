// Before the API tests: reset the TEST database (never the dev/live one) and seed it.
import { execSync } from 'node:child_process';
import 'dotenv/config';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set in .env');
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": the test database name must end in _test`);

  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate reset --force', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
  process.env.DATABASE_URL = url;
}
