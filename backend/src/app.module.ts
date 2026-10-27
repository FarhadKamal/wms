import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SetupModule } from './setup/setup.module.js';
import { StockModule } from './stock/stock.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, SetupModule, StockModule],
  controllers: [HealthController],
})
export class AppModule {}
