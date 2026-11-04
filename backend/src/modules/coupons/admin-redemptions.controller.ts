import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SkipResponseEnvelope } from '../../common/decorators/skip-response-envelope.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { CouponsService } from './coupons.service.js';
import { RedemptionsQueryDto } from './dto/offers-query.dto.js';

/**
 * Redemption ledger — `/api/admin/redemptions`.
 *
 * Read-only by design: a redemption changes because its order changed (confirmed,
 * cancelled, returned), never because an operator edited it. That is what keeps the
 * usage counters trustworthy.
 */
@ApiTags('admin-redemptions')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/redemptions')
export class AdminRedemptionsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @ApiOperation({ summary: 'List coupon redemptions across all offers' })
  @ApiOkResponse({ description: 'Paginated redemptions' })
  list(@Query() query: RedemptionsQueryDto) {
    return this.coupons.listRedemptions(query);
  }

  @Get('export')
  @SkipResponseEnvelope()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV of the filtered redemptions' })
  async export(@Query() query: RedemptionsQueryDto, @Res() response: Response) {
    const csv = await this.coupons.exportRedemptionsCsv(query);
    const filename = `coupon-redemptions-${new Date().toISOString().slice(0, 10)}.csv`;

    // Attachment, not inline: an export lands in a file, never renders in a tab.
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.send(csv);
  }
}
