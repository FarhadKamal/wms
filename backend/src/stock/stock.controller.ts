import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { DispatchDto, PutAwayDto, ReceiveDto, SuggestDto, TransferDto } from './stock.dto.js';
import { StockService } from './stock.service.js';

/** Stock movement API — receive, put-away, move, dispatch — plus lookups, challans and bay boards. */
@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('products') products() { return this.stock.products(); }

  // IN
  @Post('warehouses/:wh/receipts') receive(@Param('wh') wh: string, @Body() dto: ReceiveDto) { return this.stock.receive(wh, dto); }
  @Get('warehouses/:wh/putaway') pending(@Param('wh') wh: string) { return this.stock.pending(wh); }
  @Post('warehouses/:wh/suggest') @HttpCode(200) suggest(@Param('wh') wh: string, @Body() dto: SuggestDto) { return this.stock.suggest(wh, dto); }
  @Post('warehouses/:wh/putaway') putAway(@Param('wh') wh: string, @Body() dto: PutAwayDto) { return this.stock.putAway(wh, dto); }

  // MOVE / OUT
  @Post('warehouses/:wh/transfers') transfer(@Param('wh') wh: string, @Body() dto: TransferDto) { return this.stock.transfer(wh, dto); }
  @Post('warehouses/:wh/dispatches') dispatch(@Param('wh') wh: string, @Body() dto: DispatchDto) { return this.stock.dispatch(wh, dto); }

  // Read
  @Get('warehouses/:wh/dashboard') dashboard(@Param('wh') wh: string) { return this.stock.dashboard(wh); }
  @Get('warehouses/:wh/stock') stockList(@Param('wh') wh: string) { return this.stock.stock(wh); }
  @Get('warehouses/:wh/stock/:sku') stockOf(@Param('wh') wh: string, @Param('sku') sku: string) { return this.stock.stockOf(wh, sku); }
  @Get('warehouses/:wh/documents') documents(@Param('wh') wh: string, @Query('type') type?: string) { return this.stock.documents(wh, type); }
  @Get('documents/:no') document(@Param('no') no: string) { return this.stock.document(no); }
  @Get('units/:uid') unit(@Param('uid') uid: string) { return this.stock.unit(uid); }
  @Get('warehouses/:wh/positions/:code') position(@Param('wh') wh: string, @Param('code') code: string) { return this.stock.position(wh, code); }
  @Get('warehouses/:wh/scan') scan(@Param('wh') wh: string, @Query('code') code: string) { return this.stock.scan(wh, code ?? ''); }

  // Bay boards
  @Get('warehouses/:wh/boards') boards(@Param('wh') wh: string) { return this.stock.boards(wh); }
  /** Mark one board as updated, or all with code "*". */
  @Post('warehouses/:wh/boards/:code/updated') @HttpCode(200) boardUpdated(@Param('wh') wh: string, @Param('code') code: string) { return this.stock.markBoardUpdated(wh, code); }
}
