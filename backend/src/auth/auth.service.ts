import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';
import { Actor } from './permissions.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  /** Failed logins per username — slows down password guessing. Resets on success or after 15 minutes. */
  private readonly fails = new Map<string, { count: number; until: number }>();

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async login(usernameIn: string, password: string) {
    const username = usernameIn.trim().toLowerCase();
    const f = this.fails.get(username);
    if (f && f.count >= MAX_FAILS && f.until > Date.now()) {
      throw new HttpException(`Too many failed attempts — try again in ${Math.ceil((f.until - Date.now()) / 60_000)} minutes`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const u = await this.prisma.user.findUnique({ where: { username } });
    if (!u || !u.active || !(await verifyPassword(password, u.passwordHash))) {
      const prev = f && f.until > Date.now() ? f.count : 0;
      this.fails.set(username, { count: prev + 1, until: Date.now() + LOCK_MS });
      throw new UnauthorizedException('Wrong username or password');
    }
    this.fails.delete(username);
    await this.prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    return { token: await this.jwt.signAsync({ sub: u.id }), user: await this.me(u.id) };
  }

  async me(id: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, username: true, fullName: true, role: true, company: true, warehouses: { select: { warehouse: { select: { code: true, name: true } } } } },
    });
    return { ...u, warehouses: u.warehouses.map((w) => w.warehouse) };
  }

  async changePassword(actor: Actor, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await verifyPassword(current, u.passwordHash))) throw new BadRequestException('Current password is wrong');
    const p = passwordProblem(next);
    if (p) throw new BadRequestException(p);
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
    return { ok: true };
  }
}
