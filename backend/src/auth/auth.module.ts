import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersController, UsersService } from '../users/users.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
        return { secret, signOptions: { expiresIn: '12h' } }; // one working day; then log in again
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  // The guard applies to every route in the app.
  providers: [AuthService, UsersService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
