import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ModerateReviewDto } from './dto/create-review.dto.js';
import { ReviewsQueryDto } from './dto/reviews-query.dto.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Review moderation — `/api/admin/reviews`.
 *
 * Admin-only. A review becomes visible to shoppers only through `PATCH /:id`;
 * there is no customer-facing way to publish, and no bulk "approve everything".
 */
@ApiTags('admin-reviews')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews (search, status, product, rating, dates, sort)' })
  @ApiOkResponse({ description: 'Paginated reviews with product and order references' })
  list(@Query() query: ReviewsQueryDto) {
    return this.reviews.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Queue counts and the approved rating average' })
  @ApiOkResponse({ description: 'Pending / approved / rejected counts plus distribution' })
  summary() {
    return this.reviews.summary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One review with its moderation state' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.reviews.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Approve or reject a review (a rejection needs a reason)' })
  @ApiOkResponse({ description: 'The moderated review' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Rejection without reason' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The review already has that status',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  moderate(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviews.moderate(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a review (spam, abuse, customer request)' })
  @ApiOkResponse({ description: '`{ deleted: true }`' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }
}
