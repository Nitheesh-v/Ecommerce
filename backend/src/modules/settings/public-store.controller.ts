import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { SettingsService } from './settings.service.js';

/**
 * Public store profile — `/api/store/settings`.
 *
 * Only what a storefront may show: name, contact, address, currency/locale and
 * whether cash-on-delivery is offered. Tax rate, fees and the moderator trail stay
 * in the admin view.
 */
@ApiTags('store')
@Controller('store')
export class PublicStoreController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get('settings')
  @ApiOperation({ summary: 'Public store profile (contact, address, payment options)' })
  @ApiOkResponse({ description: 'Store identity and contact details' })
  get() {
    return this.settings.publicView();
  }
}
