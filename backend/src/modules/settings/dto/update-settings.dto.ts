import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** The store's postal address, used on invoices. */
export class StoreAddressDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @IsOptional()
  line1?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  line2?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsOptional()
  country?: string;
}

/**
 * Settings patch.
 *
 * Every field is optional, but the merged result is validated as a whole in the
 * service — a patch cannot leave the store with a 400% tax rate or a currency that
 * contradicts its stored prices.
 */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ maxLength: 120, example: 'Ecommerce26' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsOptional()
  storeName?: string;

  @ApiPropertyOptional({ maxLength: 160, description: 'Registered entity name, for invoices' })
  @IsString()
  @MaxLength(160)
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsEmail()
  @MaxLength(160)
  @IsOptional()
  supportEmail?: string;

  @ApiPropertyOptional({ maxLength: 32, example: '+91 98765 43210' })
  @IsString()
  @Matches(/^[\d+\-\s()]{6,20}$/, {
    message: 'Phone must contain 6–20 digits and phone symbols',
  })
  @IsOptional()
  supportPhone?: string;

  @ApiPropertyOptional({ type: StoreAddressDto })
  @ValidateNested()
  @Type(() => StoreAddressDto)
  @IsOptional()
  address?: StoreAddressDto;

  @ApiPropertyOptional({ maxLength: 500, description: 'Printed at the bottom of invoices' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  invoiceFooter?: string;

  @ApiPropertyOptional({ maxLength: 300, description: 'Shown after checkout' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  orderNote?: string;

  @ApiPropertyOptional({
    description: 'ISO 4217. Only changeable while the store has no products or orders.',
    example: 'INR',
  })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'Currency must be a 3-letter ISO 4217 code' })
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'en-IN', description: 'BCP-47 locale for formatting' })
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, {
    message: 'Locale must look like "en" or "en-IN"',
  })
  @IsOptional()
  locale?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxRatePercent?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minor units (paise)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  flatShippingCharge?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Minor units (paise)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  freeShippingThreshold?: number;

  @ApiPropertyOptional({ description: 'Allow cash-on-delivery at checkout' })
  @IsBoolean()
  @IsOptional()
  codEnabled?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Highest COD order total in minor units; 0 means no limit',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  codMaxAmount?: number;
}
