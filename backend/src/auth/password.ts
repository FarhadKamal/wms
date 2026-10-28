// Password hashing with Node's built-in scrypt (memory-hard, salted). Stored as "scrypt$N$r$p$salt$hash".
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64, MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Minimum rules for a password set by an admin or a user. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers';
  return null;
}

/** A readable random password for a new account, e.g. "kite-4821-Mango". */
export function generatePassword(): string {
  const words = ['river', 'mango', 'cargo', 'kite', 'delta', 'harbor', 'pump', 'tiger', 'lotus', 'amber', 'cedar', 'falcon'];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const w2 = pick();
  return `${pick()}-${1000 + (randomBytes(2).readUInt16BE() % 9000)}-${w2[0].toUpperCase()}${w2.slice(1)}`;
}
