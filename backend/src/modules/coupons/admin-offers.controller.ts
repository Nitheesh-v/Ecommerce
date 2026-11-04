import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { CouponsService } from './coupons.service.js';
import {
  CreateOfferDto,
  UpdateOfferDto,
  UpdateOfferStatusDto,
} from './dto/create-offer.dto.js';
import { OffersQueryDto, RedemptionsQueryDto } from './dto/offers-query.dto.js';

/**
 * Offers console — `/api/admin/offers`.
 *
 * Admin-only, and every write is audited on the offer's own history. Deleting an
 * offer archives it: past orders and redemptions reference it, so removing the
 * record would rewrite history.
 */
@ApiTags('admin-offers')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/offers')
export class AdminOffersController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'List offers (search, status, type, dates, sort, paginate)' })
  @ApiOkResponse({ description: 'Paginated offers' })
  list(@Query() query: OffersQueryDto) {
    return this.coupons.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Offer counts plus redemption and discount totals' })
  summary() {
    return this.coupons.summary();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an offer' })
  @ApiCreatedResponse({ description: 'The created offer' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Invalid configuration' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Coupon code already exists' })
  create(@Body() dto: CreateOfferDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.coupons.create(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Offer detail with its audit history' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown offer id' })
  detail(@Param('id') id: string) {
    return this.coupons.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an offer (merged configuration is re-validated)' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Coupon code already exists' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.coupons.update(id, dto, actor);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive an offer (history is preserved)' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Already archived' })
  archive(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.coupons.archive(id, actor);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate an offer' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Status unchanged' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOfferStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.coupons.changeStatus(id, dto, actor);
  }

  @Get(':id/redemptions')
  @ApiOperation({ summary: 'Redemptions for one offer' })
  redemptions(@Param('id') id: string, @Query() query: RedemptionsQueryDto) {
    return this.coupons.redemptionsForOffer(id, query);
  }
}
