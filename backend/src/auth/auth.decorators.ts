import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Actor, Role } from './permissions.js';

export const IS_PUBLIC = 'isPublic';
export const ALLOWED_ROLES = 'allowedRoles';

/** No login needed (login itself, health check). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Only these roles may call this route. Every non-GET route must say who may call it (deny by default). */
export const Allow = (...roles: readonly Role[]) => SetMetadata(ALLOWED_ROLES, roles);

/** The logged-in user, as loaded by the AuthGuard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest().user);
