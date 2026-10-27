import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/health — is the API up, and can it reach PostgreSQL? */
  @Get()
  async check() {
    try {
      const [row] = await this.prisma.$queryRaw<Array<{ db: string; version: string }>>`
        SELECT current_database() AS db, split_part(version(), ' ', 2) AS version`;
      return { api: 'ok', database: 'ok', name: row.db, postgres: row.version };
    } catch (e) {
      return { api: 'ok', database: 'unreachable', error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
    }
  }
}
