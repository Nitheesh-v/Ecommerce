import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestWithContext } from '../../../common/interfaces/request-with-context.interface.js';
import { UsersService } from '../../users/users.service.js';

/**
 * Rejects suspended/deactivated accounts on routes that must not work for them.
 *
 * `JwtAuthGuard` is deliberately stateless (it never touches the database), so an
 * access token minted before a suspension would otherwise stay valid until it
 * expires. This guard closes that window for the actions that matter — placing an
 * order and anything else that touches a customer's account — at the cost of one
 * indexed user lookup, and only on the controllers that opt in.
 *
 * Must run **after** `JwtAuthGuard` (which populates `request.user`).
 */
@Injectable()
export class ActiveAccountGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const user = request.user;

    if (!user) {
      // Public route (or the auth guard already rejected the request) — nothing
      // to check here.
      return true;
    }

    if (!user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    await this.usersService.assertUsable(user.id);

    return true;
  }
}
