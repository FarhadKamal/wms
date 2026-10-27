import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReceiveLineDto {
  @IsString() sku: string;
  @IsInt() @Min(1) @Max(5000) qty: number;
  /** Cars: one VIN per unit. */
  @IsOptional() @IsArray() @IsString({ each: true }) vins?: string[];
}

export class ReceiveDto {
  @IsString() @Length(1, 120) party: string;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsString() @Length(1, 80) preparedBy: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto) lines: ReceiveLineDto[];
}

export class UnitsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2000) @IsString({ each: true }) uids: string[];
}

export class SuggestDto extends UnitsDto {
  /** Location to leave out (a move's current location). */
  @IsOptional() @IsString() exclude?: string;
}

export class PutAwayDto extends UnitsDto {
  /** Location code, address or plate label. */
  @IsString() location: string;
  @IsString() @Length(1, 80) by: string;
}

export class TransferDto extends PutAwayDto {
  @IsOptional() @IsString() @Length(0, 200) reason?: string;
}

export class DispatchDto extends UnitsDto {
  @IsString() @Length(1, 120) party: string;
  @IsOptional() @IsString() @Length(0, 200) destination?: string;
  @IsOptional() @Matches(DATE) date?: string;
  @IsString() @Length(1, 80) preparedBy: string;
}
