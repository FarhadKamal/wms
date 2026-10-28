import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { Allow, CurrentUser } from '../auth/auth.decorators.js';
import { generatePassword, hashPassword, passwordProblem } from '../auth/password.js';
import { CAN } from '../auth/permissions.js';
import type { Actor, Role } from '../auth/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLES = ['ADMIN', 'MANAGER', 'STORE_KEEPER', 'MANAGEMENT'] as const;
const COMPANIES = ['AZNEO', 'PNL'] as const;

class CreateUserDto {
  @Matches(/^[a-z0-9._-]{3,40}$/, { message: 'username: 3–40 lowercase letters, digits, . _ -' }) username: string;
  @IsString() @Length(1, 80) fullName: string;
  @IsIn(ROLES) role: Role;
  @IsIn(COMPANIES) company: 'AZNEO' | 'PNL';
  @IsArray() @ArrayUnique() @IsString({ each: true }) warehouses: string[];
  /** Omit to get a generated one (returned once). */
  @IsOptional() @IsString() password?: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() @Length(1, 80) fullName?: string;
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsIn(COMPANIES) company?: 'AZNEO' | 'PNL';
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) warehouses?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
  /** true = set a new generated password (returned once). */
  @IsOptional() @IsBoolean() resetPassword?: boolean;
}

const SELECT = {
  id: true, username: true, fullName: true, role: true, company: true, active: true, lastLoginAt: true, createdAt: true,
  warehouses: { select: { warehouse: { select: { code: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: [{ active: 'desc' }, { fullName: 'asc' }], select: SELECT });
    return users.map((u) => ({ ...u, warehouses: u.warehouses.map((w) => w.warehouse) }));
  }

  private async warehouseIds(role: Role, codes: string[]) {
    if (role === 'ADMIN' || role === 'MANAGEMENT') return [];
    if (!codes.length) throw new BadRequestException('Managers and store keepers need at least one warehouse');
    const whs = await this.prisma.warehouse.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
    const missing = codes.filter((c) => !whs.some((w) => w.code === c));
    if (missing.length) throw new BadRequestException(`Unknown warehouse ${missing.join(', ')}`);
    return whs.map((w) => w.id);
  }

  async create(dto: CreateUserDto) {
    if (await this.prisma.user.findUnique({ where: { username: dto.username } })) throw new ConflictException(`Username ${dto.username} is taken`);
    const password = dto.password ?? generatePassword();
    const p = passwordProblem(password);
    if (p) throw new BadRequestException(p);
    const ids = await this.warehouseIds(dto.role, dto.warehouses);
    const u = await this.prisma.user.create({
      data: {
        username: dto.username, fullName: dto.fullName, role: dto.role, company: dto.company, passwordHash: await hashPassword(password),
        warehouses: { create: ids.map((warehouseId) => ({ warehouseId })) },
      },
      select: { id: true },
    });
    return { id: u.id, username: dto.username, password: dto.password ? undefined : password };
  }

  async update(id: string, dto: UpdateUserDto, actor: Actor) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { warehouses: { include: { warehouse: true } } } });
    if (!u) throw new NotFoundException('User not found');
    const role = dto.role ?? u.role;
    const losesAdmin = u.role === 'ADMIN' && (role !== 'ADMIN' || dto.active === false);
    if (losesAdmin) {
      if (u.id === actor.id) throw new BadRequestException("You can't remove your own Admin access");
      const admins = await this.prisma.user.count({ where: { role: 'ADMIN', active: true } });
      if (admins <= 1) throw new BadRequestException('There must always be at least one active Admin');
    }
    const ids = dto.warehouses || dto.role ? await this.warehouseIds(role, dto.warehouses ?? u.warehouses.map((w) => w.warehouse.code)) : null;
    const password = dto.resetPassword ? generatePassword() : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          fullName: dto.fullName, role: dto.role, company: dto.company, active: dto.active,
          ...(password ? { passwordHash: await hashPassword(password) } : {}),
        },
      });
      if (ids) {
        await tx.userWarehouse.deleteMany({ where: { userId: id } });
        if (ids.length) await tx.userWarehouse.createMany({ data: ids.map((warehouseId) => ({ userId: id, warehouseId })) });
      }
    });
    return { id, password: password ?? undefined };
  }
}

/** User accounts — Admin only. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get() @Allow(...CAN.manageUsers) list() { return this.users.list(); }
  @Post() @Allow(...CAN.manageUsers) create(@Body() dto: CreateUserDto) { return this.users.create(dto); }
  @Patch(':id') @Allow(...CAN.manageUsers) update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: Actor) { return this.users.update(id, dto, actor); }
}
