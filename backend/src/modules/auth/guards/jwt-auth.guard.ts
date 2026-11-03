import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/constants/metadata-keys.js';
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

      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

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
