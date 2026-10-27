import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';

export const CELL_USES = ['STORAGE', 'PASSAGE', 'OFFICE', 'TOILET', 'SERVICE', 'UNLOAD', 'FORKLIFT'] as const;

export class CreateWarehouseDto {
  @Matches(/^[A-Z]{2,4}$/, { message: 'code must be 2–4 capital letters' }) code: string;
  @IsString() @Length(1, 80) name: string;
  @IsString() @Length(1, 300) address: string;
  @IsOptional() @IsString() landmark?: string;
  @IsNumber() @IsPositive() areaSqft: number;
  @IsOptional() @IsIn(['ACTIVE', 'PLANNED']) status?: 'ACTIVE' | 'PLANNED';
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(1, 300) address?: string;
  @IsOptional() @IsString() landmark?: string;
  @IsOptional() @IsNumber() @IsPositive() areaSqft?: number;
  @IsOptional() @IsIn(['ACTIVE', 'PLANNED']) status?: 'ACTIVE' | 'PLANNED';
}

export class CreateBlockDto {
  @IsString() @Length(1, 60) name: string;
  @IsNumber() @IsPositive() areaSqft: number;
  @IsInt() @Min(1) @Max(30) rows: number;
  @IsInt() @Min(1) @Max(20) cols: number;
  @IsOptional() @IsInt() @Min(100) @Max(3000) clearHeightCm?: number;
  @IsOptional() @IsString() note?: string;
}

export class UpdateBlockDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsNumber() @IsPositive() areaSqft?: number;
  @IsOptional() @IsInt() @Min(1) @Max(30) rows?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) cols?: number;
  @IsOptional() @IsInt() @Min(100) @Max(3000) clearHeightCm?: number;
  @IsOptional() @IsString() note?: string;
}

export class CellRefDto {
  @IsInt() @Min(1) row: number;
  @IsInt() @Min(1) col: number;
}

export class PaintCellsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CellRefDto) cells: CellRefDto[];
  @IsIn(CELL_USES) use: (typeof CELL_USES)[number];
  @IsOptional() @IsString() @Length(0, 60) areaName?: string;
}

export class CreateRackTypeDto {
  @IsString() @Length(1, 40) name: string;
  @IsNumber() @IsPositive() lengthCm: number;
  @IsNumber() @IsPositive() depthCm: number;
  @IsInt() @Min(1) @Max(12) shelfCount: number;
  @IsNumber() @IsPositive() shelfHeightCm: number;
  @IsNumber() @IsPositive() shelfCapKg: number;
}

export class CreatePlateTypeDto {
  @IsString() @Length(1, 40) name: string;
  @IsNumber() @IsPositive() lengthCm: number;
  @IsNumber() @IsPositive() widthCm: number;
  @IsNumber() @Min(0) floorStackHeightCm: number;
  @IsNumber() @IsPositive() capKg: number;
}

export class CreateRackDto {
  @IsString() blockCode: string;
  @IsString() rackTypeId: string;
  @IsInt() @Min(1) startRow: number;
  @IsInt() @Min(1) startCol: number;
  @IsIn(['ROW', 'COLUMN']) direction: 'ROW' | 'COLUMN';
  /** Omit to use the length the rack type needs in this block. */
  @IsOptional() @IsInt() @Min(1) lengthCells?: number;
  /** Omit for one bay per cell. 0 = shelf only. */
  @IsOptional() @IsInt() @Min(0) @Max(20) bays?: number;
}

export class UpdateRackDto {
  @IsOptional() @IsInt() @Min(0) @Max(20) bays?: number;
  @IsOptional() @IsArray() @IsInt({ each: true }) mergedShelves?: number[];
}

export class CreatePlatesDto {
  @IsString() plateTypeId: string;
  @IsInt() @Min(1) @Max(50) count: number;
  // Either a rack position …
  @IsOptional() @IsString() rackCode?: string;
  @IsOptional() @IsInt() @Min(1) shelfLevel?: number;
  @IsOptional() @IsInt() @Min(0) bay?: number;
  // … or a floor cell.
  @IsOptional() @IsString() blockCode?: string;
  @IsOptional() @IsInt() @Min(1) row?: number;
  @IsOptional() @IsInt() @Min(1) col?: number;
}
