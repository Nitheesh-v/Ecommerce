import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import type { RequestWithContext } from '../interfaces/request-with-context.interface.js';

/**
 * Injects the authenticated user, or one of its properties.
 *
 * ```ts
 * findMine(@CurrentUser() user: AuthenticatedUser) {}
 * findMine(@CurrentUser('id') userId: string) {}
 * ```
 */
export const CurrentUser = createParamDecorator(
  (
    property: keyof AuthenticatedUser | undefined,
    context: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return property ? user[property] : user;
  },
);
