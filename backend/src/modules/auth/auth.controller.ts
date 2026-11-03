import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import type { RequestWithContext } from '../../common/interfaces/request-with-context.interface.js';
import type { ValidatedEnv } from '../../config/env.validation.js';
import {
  ACCESS_TOKEN_TYPE,
  REFRESH_COOKIE_NAME,
  buildClearedCookieOptions,
  buildRefreshCookieOptions,
} from './auth.constants.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { AuthService } from './services/auth.service.js';
import type { AuthResult, ClientMetadata } from './services/auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<ValidatedEnv, true>,
  ) {
    this.isProduction =
      this.configService.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a customer account and sign in' })
  @ApiCreatedResponse({ description: 'Account created; refresh cookie set' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Validation failed' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Email already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto, clientMetadata(request));

    return this.respondWithSession(response, result);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ description: 'Access token returned; refresh cookie set' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Validation failed' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, clientMetadata(request));

    return this.respondWithSession(response, result);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ description: 'New access token; refresh cookie rotated' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: 'Invalid or reused refresh token' })
  async refresh(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      readRefreshCookie(request),
      clientMetadata(request),
    );

    return this.respondWithSession(response, result);
  }

  /**
   * Public on purpose: a caller whose access token already expired must still be
   * able to clear their cookie.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session and clear the cookie' })
  async logout(
    @Req() request: RequestWithContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(readRefreshCookie(request));
    response.clearCookie(
      REFRESH_COOKIE_NAME,
      buildClearedCookieOptions(this.isProduction),
    );
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session of the current user' })
  async logoutAll(@CurrentUser('id') userId: string) {
    const revoked = await this.authService.logoutAll(userId);

    return { revokedSessions: revoked };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user' })
  @ApiOkResponse({ description: 'The authenticated user' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  private respondWithSession(response: Response, result: AuthResult) {
    response.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      ...buildRefreshCookieOptions(this.isProduction),
      expires: result.refreshExpiresAt,
    });

    // The refresh token is deliberately absent from the body.
    return {
      user: result.user,
      accessToken: result.accessToken,
      tokenType: ACCESS_TOKEN_TYPE,
    };
  }
}

function readRefreshCookie(request: RequestWithContext): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;

  return cookies?.[REFRESH_COOKIE_NAME];
}

function clientMetadata(request: RequestWithContext): ClientMetadata {
  const userAgent = request.headers['user-agent'];
  const forwarded = request.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : request.ip ?? undefined;

  return {
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : undefined,
    ipAddress: ipAddress?.slice(0, 60),
  };
}
