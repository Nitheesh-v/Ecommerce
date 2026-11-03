import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'customer@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * No strength rules on login: they would tell an attacker which inputs are
   * worth trying. Only the type and bcrypt's 72-byte limit are enforced.
   */
  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsString()
  @MaxLength(72)
  password!: string;
}
