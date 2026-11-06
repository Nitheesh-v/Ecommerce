// src/modules/addresses/dto/address.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * One delivery address.
 *
 * The same field rules as the order's shipping address (`ShippingAddressDto`), so an
 * address that validates here can always be turned into an order without a second
 * round of surprises at checkout.
 */
export class CreateAddressDto {
  @ApiPropertyOptional({ default: 'Home', maxLength: 40 })
  @IsString()
  @MaxLength(40)
  @IsOptional()
  label?: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  recipientName!: string;

  @ApiProperty({ example: '+91 98765 43210' })
  @IsString()
  @Matches(/^[\d+\-\s()]{6,20}$/, {
    message: 'Phone must contain 6–20 digits and phone symbols',
  })
  phone!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  line2?: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state!: string;

  @ApiProperty({ example: '641001' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,15}$/, { message: 'Invalid postal code' })
  postalCode!: string;

  @ApiPropertyOptional({ default: 'India', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ description: 'Make this the default delivery address' })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateAddressDto extends CreateAddressDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  declare recipientName: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsString()
  @Matches(/^[\d+\-\s()]{6,20}$/, {
    message: 'Phone must contain 6–20 digits and phone symbols',
  })
  @IsOptional()
  declare phone: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  declare line1: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  declare city: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @IsOptional()
  declare state: string;

  @ApiPropertyOptional({ example: '641001' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,15}$/, { message: 'Invalid postal code' })
  @IsOptional()
  declare postalCode: string;
}
