import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Allow, CurrentUser } from '../auth/auth.decorators.js';
import { CAN, canAccessWarehouse } from '../auth/permissions.js';
import type { Actor } from '../auth/permissions.js';
import { DispatchDto, PutAwayDto, ReceiveDto, SuggestDto, TransferDto } from './stock.dto.js';
import { StockService } from './stock.service.js';

const guardWarehouse = <T extends { warehouse: { code: string } }>(u: Actor, x: T): T => {
  if (!canAccessWarehouse(u, x.warehouse.code)) throw new ForbiddenException(`You don't have access to warehouse ${x.warehouse.code}`);
  return x;
};

/**
 * Stock movement API — receive, put-away, move, dispatch — plus lookups, challans and bay boards.
 * Movements: Admin, Manager, Store Keeper. Reads: everyone who can access the warehouse.
 * Who did it always comes from the login.
 */
@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('products') products() { return this.stock.products(); }

  // IN
  @Post('warehouses/:wh/receipts') @Allow(...CAN.moveStock)
  receive(@Param('wh') wh: string, @Body() dto: ReceiveDto, @CurrentUser() u: Actor) { return this.stock.receive(wh, dto, u); }
  @Get('warehouses/:wh/putaway') pending(@Param('wh') wh: string) { return this.stock.pending(wh); }
  @Post('warehouses/:wh/suggest') @HttpCode(200) @Allow(...CAN.moveStock) suggest(@Param('wh') wh: string, @Body() dto: SuggestDto) { return this.stock.suggest(wh, dto); }
  @Post('warehouses/:wh/putaway') @Allow(...CAN.moveStock)
  putAway(@Param('wh') wh: string, @Body() dto: PutAwayDto, @CurrentUser() u: Actor) { return this.stock.putAway(wh, dto, u); }

  // MOVE / OUT
  @Post('warehouses/:wh/transfers') @Allow(...CAN.moveStock)
  transfer(@Param('wh') wh: string, @Body() dto: TransferDto, @CurrentUser() u: Actor) { return this.stock.transfer(wh, dto, u); }
  @Post('warehouses/:wh/dispatches') @Allow(...CAN.moveStock)
  dispatch(@Param('wh') wh: string, @Body() dto: DispatchDto, @CurrentUser() u: Actor) { return this.stock.dispatch(wh, dto, u); }

  // Read
  @Get('warehouses/:wh/dashboard') dashboard(@Param('wh') wh: string) { return this.stock.dashboard(wh); }
  @Get('warehouses/:wh/stock') stockList(@Param('wh') wh: string) { return this.stock.stock(wh); }
  @Get('warehouses/:wh/stock/:sku') stockOf(@Param('wh') wh: string, @Param('sku') sku: string) { return this.stock.stockOf(wh, sku); }
  @Get('warehouses/:wh/documents') documents(@Param('wh') wh: string, @Query('type') type?: string) { return this.stock.documents(wh, type); }
  @Get('documents/:no') async document(@Param('no') no: string, @CurrentUser() u: Actor) { return guardWarehouse(u, await this.stock.document(no)); }
  @Get('units/:uid') async unit(@Param('uid') uid: string, @CurrentUser() u: Actor) { return guardWarehouse(u, await this.stock.unit(uid)); }
  @Get('warehouses/:wh/positions/:code') position(@Param('wh') wh: string, @Param('code') code: string) { return this.stock.position(wh, code); }
  @Get('warehouses/:wh/scan') scan(@Param('wh') wh: string, @Query('code') code: string) { return this.stock.scan(wh, code ?? ''); }

  // Bay boards
  @Get('warehouses/:wh/boards') boards(@Param('wh') wh: string) { return this.stock.boards(wh); }
  /** Mark one board as updated, or all with code "*". */
  @Post('warehouses/:wh/boards/:code/updated') @HttpCode(200) @Allow(...CAN.moveStock)
  boardUpdated(@Param('wh') wh: string, @Param('code') code: string) { return this.stock.markBoardUpdated(wh, code); }
}
