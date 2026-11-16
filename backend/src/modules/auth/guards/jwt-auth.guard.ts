import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALLOW_GUEST_KEY,
  IS_PUBLIC_KEY,
} from '../../../common/constants/metadata-keys.js';
import {
  GUEST_CART_HEADER,
  GUEST_CHECKOUT_HEADER,
  resolveCartId,
  userCartId,
} from '../../../common/utils/cart-identity.util.js';
import type { RequestWithContext } from '../../../common/interfaces/request-with-context.interface.js';
import { TokenService } from '../services/token.service.js';

/**
 * Global authentication guard — deny by default.
 *
 * Every route requires a valid access token unless it (or its controller) is
 * marked `@Public()`. On public routes a token is still parsed when present, so
 * handlers can branch on the caller without forcing authentication.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      if (isPublic) {
        return true;
      }

      if (this.allowsGuest(context)) {
        const cartId = resolveCartId({
          cartHeader: request.headers[GUEST_CART_HEADER],
          guestCheckoutHeader: request.headers[GUEST_CHECKOUT_HEADER],
        });

        if (cartId) {
          request.cartId = cartId;

          return true;
        }
      }

      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      // A signed-in caller always uses their own cart, whatever a stale guest id
      // in the browser says. The account wins.
      if (this.allowsGuest(context)) {
        request.cartId = userCartId(payload.sub);
      }

      return true;
    } catch {
      if (isPublic) {
        // An expired token on a public route is not an error — treat the caller
        // as anonymous instead of blocking a login/refresh.
        return true;
      }

      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /** `@AllowGuest()` on the handler or the controller. */
  private allowsGuest(context: ExecutionContext): boolean {
    return Boolean(
      this.reflector.getAllAndOverride<boolean>(ALLOW_GUEST_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  const [scheme, value] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    return undefined;
  }

  return value.trim();
}
