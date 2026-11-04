import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { InventoryQueryDto, MovementsQueryDto } from './dto/inventory-query.dto.js';
import { InventoryService } from './inventory.service.js';

/**
 * Admin inventory surface — `/api/admin/inventory`.
 *
 * Everything here is admin-only (`@Roles` + the global `RolesGuard`); the public
 * catalog never sees cost price, thresholds or the audit trail. Reads are
 * paginated with the same `{ data, meta }` envelope as the other admin lists.
 */
@ApiTags('admin/inventory')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: 'Inventory table (search by name/SKU, category + stock-status filters, sorting)',
  })
  @ApiOkResponse({ description: 'Paginated inventory rows in `{ data, meta }`' })
  list(@Query() query: InventoryQueryDto) {
    return this.inventoryService.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Summary cards: units, low/out counts, cost & retail value' })
  @ApiOkResponse({ description: 'Inventory summary' })
  summary() {
    return this.inventoryService.summary();
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Products with 0 < quantity ≤ their low-stock threshold' })
  lowStock(@Query() query: InventoryQueryDto) {
    return this.inventoryService.lowStock(query);
  }

  @Get('out-of-stock')
  @ApiOperation({ summary: 'Products with quantity 0' })
  outOfStock(@Query() query: InventoryQueryDto) {
    return this.inventoryService.outOfStock(query);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Open, deduplicated stock alerts' })
  @ApiQuery({ name: 'level', required: false, enum: ['low', 'out'] })
  alerts(@Query('level') level?: 'low' | 'out') {
    return this.inventoryService.listAlerts(level);
  }

  @Get('history')
  @ApiOperation({ summary: 'Stock movement audit trail (filterable, paginated)' })
  history(@Query() query: MovementsQueryDto) {
    return this.inventoryService.history(query);
  }

  @Get('products/:productId')
  @ApiOperation({ summary: 'Current stock of one product (fresh read for the adjust modal)' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  product(@Param('productId') productId: string) {
    return this.inventoryService.getProductStock(productId);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adjust stock (increase / decrease / set exact) and audit it' })
  @ApiCreatedResponse({ description: 'The adjustment and its movement record' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Would go below zero, or the reference id was already used',
  })
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.inventoryService.adjust(dto, actor);
  }
}
