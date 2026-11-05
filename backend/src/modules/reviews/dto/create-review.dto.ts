import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { REVIEW_STATUSES } from '../schemas/review.schema.js';

/**
 * A customer's review.
 *
 * Note what is *not* here: the product comes from the route, and the customer,
 * the verifying order and the initial `pending` status all come from the server.
 * There is no field a client could use to publish a review directly.
 */
export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: 120, example: 'Excellent build quality' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    example: 'Battery lasts two days and the noise cancelling is genuinely good.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  comment!: string;
}

/** Admin moderation decision. */
export class ModerateReviewDto {
  @ApiProperty({
    enum: ['approved', 'rejected'],
    description: '`pending` is only ever the starting state',
  })
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Why — required when rejecting, shown to the moderator later',
  })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  reason?: string;
}

/** Anything a moderation decision can set (used for the enum in the console). */
export const MODERATION_TARGETS = REVIEW_STATUSES.filter(
  (status) => status !== 'pending',
);
