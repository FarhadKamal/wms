import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Min } from 'class-validator';
import type { Response } from 'express';
import { Allow } from '../auth/auth.decorators.js';
import { CAN } from '../auth/permissions.js';
import { ProductsService } from './products.service.js';

class ProductDto {
  @IsString() @Length(1, 160) name: string;
  @IsString() @Length(1, 60) category: string;
  @IsString() @Length(1, 60) brand: string;
  @IsNumber() @IsPositive() lengthCm: number;
  @IsNumber() @IsPositive() widthCm: number;
  @IsNumber() @IsPositive() heightCm: number;
  @IsNumber() @IsPositive() weightKg: number;
  @IsOptional() @IsInt() @Min(0) reorderPoint?: number;
  @IsOptional() @IsString() alias1?: string;
  @IsOptional() @IsString() alias2?: string;
  @IsOptional() @IsString() alias3?: string;
}
class CreateProductDto extends ProductDto {
  @IsString() @Length(2, 40) sku: string;
}

/** The two fields of an uploaded file that we use. */
interface Upload { originalname: string; buffer: Buffer }

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const upload = FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const needFile = (f?: Upload) => {
  if (!f) throw new BadRequestException('Choose an Excel (.xlsx) file');
  if (!/\.xlsx$/i.test(f.originalname)) throw new BadRequestException('Only .xlsx files (use the template)');
  return f.buffer;
};

/** Product catalogue. Everyone can search (incl. alias codes); only the Admin (IT) adds, edits and uploads. */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get() list(@Query('q') q?: string) { return this.products.list(q); }

  @Get('export')
  async export(@Res() res: Response, @Query('empty') empty?: string) {
    const blank = empty === '1';
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${blank ? 'wms-products-template' : `wms-products-${new Date().toISOString().slice(0, 10)}`}.xlsx"`);
    res.send(await this.products.export(blank));
  }

  /** By SKU or alias code. */
  @Get(':code') find(@Param('code') code: string) { return this.products.find(code); }

  @Post('import/preview') @HttpCode(200) @Allow(...CAN.manageProducts) @UseInterceptors(upload)
  preview(@UploadedFile() file?: Upload) { return this.products.preview(needFile(file)); }

  @Post('import') @HttpCode(200) @Allow(...CAN.manageProducts) @UseInterceptors(upload)
  import(@UploadedFile() file?: Upload) { return this.products.import(needFile(file)); }

  @Post() @Allow(...CAN.manageProducts) create(@Body() dto: CreateProductDto) { return this.products.create({ row: 1, ...dto }); }
  @Patch(':sku') @Allow(...CAN.manageProducts) update(@Param('sku') sku: string, @Body() dto: ProductDto) { return this.products.update(sku, { row: 1, ...dto }); }
}
