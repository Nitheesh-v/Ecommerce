// src/modules/addresses/addresses.controller.ts

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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ActiveAccountGuard } from '../auth/guards/active-account.guard.js';
import { AddressesService } from './addresses.service.js';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto.js';

/**
 * Saved delivery addresses — `/api/addresses`.
 *
 * Signed in, never role-restricted: an admin may shop too. Each row is reachable
 * only by its owner, and another customer's id is a 404.
 */
@ApiTags('addresses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@Controller('addresses')
@UseGuards(ActiveAccountGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'My address book, default first' })
  @ApiOkResponse({ description: 'Saved addresses' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a delivery address' })
  @ApiCreatedResponse({ description: 'The saved address' })
  create(@Body() dto: CreateAddressDto, @CurrentUser() user: AuthenticatedUser) {
    return this.addresses.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an address (or make it the default)' })
  @ApiOkResponse({ description: 'The updated address' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.addresses.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an address' })
  @ApiOkResponse({ description: '`{ deleted: true }`' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.addresses.remove(user.id, id);
  }
}
