import {
  Body,
  Controller,
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
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import {
  UpdateShipmentCourierDto,
  UpdateShipmentStatusDto,
} from './dto/update-shipment.dto.js';
import {
  EligibleOrdersQueryDto,
  ShipmentsQueryDto,
} from './dto/shipments-query.dto.js';
import { ShipmentsService } from './shipments.service.js';

/**
 * Shipping console API — `/api/admin/shipments`.
 *
 * Every mutation is a validated transition, a validated courier assignment or a
 * create guarded by the one-live-shipment rule. There is no route that edits a
 * shipment's history or lets a client pick an arbitrary status jump.
 */
@ApiTags('admin-shipments')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/shipments')
export class AdminShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List shipments (search, filter, sort, paginate)' })
  @ApiOkResponse({ description: 'Paginated shipments' })
  list(@Query() query: ShipmentsQueryDto) {
    return this.shipmentsService.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Shipment counts by delivery stage (plus delayed and failed)' })
  summary() {
    return this.shipmentsService.summary();
  }

  @Get('couriers')
  @ApiOperation({ summary: 'Courier providers and whether each is configured' })
  couriers() {
    return this.shipmentsService.courierOptions();
  }

  @Get('eligible')
  @ApiOperation({ summary: 'Orders that can be shipped right now' })
  eligible(@Query() query: EligibleOrdersQueryDto) {
    return this.shipmentsService.eligibleOrders(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a shipment for a confirmed/processing order' })
  @ApiCreatedResponse({ description: 'The created shipment' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Incomplete address or tracking link without a number' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Order not shippable, unpaid (non-COD), or already has a live shipment',
  })
  create(@Body() dto: CreateShipmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.shipmentsService.create(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Shipment detail with order, address, courier and events' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown shipment id' })
  detail(@Param('id') id: string) {
    return this.shipmentsService.detail(id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Append-only shipment event history' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown shipment id' })
  history(@Param('id') id: string) {
    return this.shipmentsService.history(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a shipment through the delivery state machine' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Same status, missing reason, or shipped without courier/tracking',
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Illegal transition or concurrent update' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown shipment id' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shipmentsService.updateStatus(id, dto, actor);
  }

  @Patch(':id/courier')
  @ApiOperation({ summary: 'Assign or correct the courier and tracking number' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Delivery already finalised' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto, description: 'Unknown shipment id' })
  updateCourier(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentCourierDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shipmentsService.updateCourier(id, dto, actor);
  }
}
