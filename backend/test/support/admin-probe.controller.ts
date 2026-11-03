import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator.js';
import { Roles } from '../../src/common/decorators/roles.decorator.js';
import { Role } from '../../src/common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../src/common/interfaces/authenticated-user.interface.js';

/**
 * Test-only admin route: proves the global guards enforce authorization on the
 * server, independently of any admin UI.
 */
@Controller('admin-probe')
export class AdminProbeController {
  @Roles(Role.Admin)
  @Get()
  check(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, role: user.role };
  }
}
