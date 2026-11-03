import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * 8–72 characters. The upper bound is not cosmetic: bcrypt only considers the
   * first 72 bytes, so longer passwords would silently share a prefix.
   */
  @ApiProperty({
    example: 'Str0ngPassw0rd',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters, including a letter and a number',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  @Matches(/\d/, { message: 'password must contain at least one number' })
  password!: string;

  @ApiProperty({ example: 'Nitheesh' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiPropertyOptional({ example: 'V' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;
}
