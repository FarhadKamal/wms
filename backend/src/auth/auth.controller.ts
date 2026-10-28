import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Allow, CurrentUser, Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import type { Actor } from './permissions.js';

class LoginDto {
  @IsString() @Length(1, 60) username: string;
  @IsString() @Length(1, 200) password: string;
}
class ChangePasswordDto {
  @IsString() @Length(1, 200) current: string;
  @IsString() @Length(8, 200) next: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200)
  login(@Body() dto: LoginDto) { return this.auth.login(dto.username, dto.password); }

  @Get('me') me(@CurrentUser() u: Actor) { return this.auth.me(u.id); }

  @Post('password') @HttpCode(200) @Allow('ADMIN', 'MANAGER', 'STORE_KEEPER', 'MANAGEMENT')
  changePassword(@CurrentUser() u: Actor, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(u, dto.current, dto.next); }
}
