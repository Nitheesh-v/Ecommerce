import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { SettingsService } from './settings.service.js';

/**
 * Store settings — `/api/admin/settings`.
 *
 * One document, admin-only writes. A save takes effect on the *next* order: prices,
 * tax and shipping already written to an order are never recomputed.
 */
@ApiTags('admin-settings')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Current store settings (identity, contact, pricing inputs)' })
  @ApiOkResponse({ description: 'Settings, plus whether the currency is still editable' })
  get() {
    return this.settings.view();
  }

  @Patch()
  @ApiOperation({ summary: 'Update store settings' })
  @ApiOkResponse({ description: 'The saved settings' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Invalid value in the merged settings',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Currency change refused because products or orders already exist',
  })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.settings.update(dto, actor);
  }
}
