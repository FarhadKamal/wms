import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOWED_ROLES, IS_PUBLIC } from './auth.decorators.js';
import { Actor, Role, canAccessWarehouse } from './permissions.js';

/**
 * Runs on every request:
 * 1. a valid login token is required (except @Public routes);
 * 2. the user is reloaded from the DB, so deactivation or a role change applies at once;
 * 3. non-GET routes need an explicit @Allow(...) that includes the user's role;
 * 4. routes with :wh are refused for warehouses the user isn't assigned to.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Please log in');
    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Your session has expired — please log in again');
    }
    const u = await this.prisma.user.findUnique({ where: { id: sub }, include: { warehouses: { include: { warehouse: { select: { code: true } } } } } });
    if (!u || !u.active) throw new UnauthorizedException('This account is not active');
    const actor: Actor = { id: u.id, username: u.username, fullName: u.fullName, role: u.role, company: u.company, warehouses: u.warehouses.map((w) => w.warehouse.code) };
    req.user = actor;

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ALLOWED_ROLES, targets);
    if (allowed ? !allowed.includes(actor.role) : req.method !== 'GET') {
      throw new ForbiddenException(`Your role (${actor.role.replace('_', ' ').toLowerCase()}) can't do this`);
    }
    const wh = req.params?.wh;
    if (wh && !canAccessWarehouse(actor, wh)) throw new ForbiddenException(`You don't have access to warehouse ${wh}`);
    return true;
  }
}
