import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  CreateBlockDto, CreatePlateTypeDto, CreatePlatesDto, CreateRackDto, CreateRackTypeDto, CreateWarehouseDto,
  PaintCellsDto, UpdateBlockDto, UpdateRackDto, UpdateWarehouseDto,
} from './setup.dto.js';
import { SetupService } from './setup.service.js';

/** Warehouse Setup API — steps 1–6 of the prototype's setup flow. */
@Controller()
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  // Step 1 — warehouses
  @Get('warehouses') listWarehouses() { return this.setup.listWarehouses(); }
  @Post('warehouses') createWarehouse(@Body() dto: CreateWarehouseDto) { return this.setup.createWarehouse(dto); }
  @Patch('warehouses/:wh') updateWarehouse(@Param('wh') wh: string, @Body() dto: UpdateWarehouseDto) { return this.setup.updateWarehouse(wh, dto); }

  /** Everything the setup and layout screens need: blocks + grid, racks + shelf loads, plates, area summary. */
  @Get('warehouses/:wh/structure') structure(@Param('wh') wh: string) { return this.setup.getStructure(wh); }

  // Steps 2–3 — blocks and their grid
  @Post('warehouses/:wh/blocks') createBlock(@Param('wh') wh: string, @Body() dto: CreateBlockDto) { return this.setup.createBlock(wh, dto); }
  @Patch('warehouses/:wh/blocks/:block') updateBlock(@Param('wh') wh: string, @Param('block') block: string, @Body() dto: UpdateBlockDto) {
    return this.setup.updateBlock(wh, block, dto);
  }
  @Put('warehouses/:wh/blocks/:block/cells') paintCells(@Param('wh') wh: string, @Param('block') block: string, @Body() dto: PaintCellsDto) {
    return this.setup.paintCells(wh, block, dto);
  }

  // Step 4 — rack & plate types (shared by all warehouses)
  @Get('rack-types') rackTypes() { return this.setup.listRackTypes(); }
  @Post('rack-types') createRackType(@Body() dto: CreateRackTypeDto) { return this.setup.createRackType(dto); }
  @Get('plate-types') plateTypes() { return this.setup.listPlateTypes(); }
  @Post('plate-types') createPlateType(@Body() dto: CreatePlateTypeDto) { return this.setup.createPlateType(dto); }

  // Step 5 — racks
  @Get('warehouses/:wh/racks/suggest')
  suggestRack(@Param('wh') wh: string, @Query('block') block: string, @Query('type') type: string, @Query('direction') direction: 'ROW' | 'COLUMN' = 'ROW') {
    return this.setup.suggestRack(wh, block, type, direction === 'COLUMN' ? 'COLUMN' : 'ROW');
  }
  @Post('warehouses/:wh/racks') createRack(@Param('wh') wh: string, @Body() dto: CreateRackDto) { return this.setup.createRack(wh, dto); }
  @Patch('warehouses/:wh/racks/:rack') updateRack(@Param('wh') wh: string, @Param('rack') rack: string, @Body() dto: UpdateRackDto) {
    return this.setup.updateRack(wh, rack, dto);
  }
  @Delete('warehouses/:wh/racks/:rack') deleteRack(@Param('wh') wh: string, @Param('rack') rack: string) { return this.setup.deleteRack(wh, rack); }

  // Step 6 — plates
  @Get('warehouses/:wh/plates/suggest-floor')
  suggestFloorPlate(@Param('wh') wh: string, @Query('block') block: string, @Query('type') type: string) {
    return this.setup.suggestFloorPlate(wh, block, type);
  }
  @Post('warehouses/:wh/plates') createPlates(@Param('wh') wh: string, @Body() dto: CreatePlatesDto) { return this.setup.createPlates(wh, dto); }
  @Delete('warehouses/:wh/plates/:label') deletePlate(@Param('wh') wh: string, @Param('label') label: string) { return this.setup.deletePlate(wh, label); }
}
