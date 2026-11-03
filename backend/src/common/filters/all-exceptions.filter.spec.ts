import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { PassthroughHttpException } from '../exceptions/passthrough-http.exception.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface Harness {
  filter: AllExceptionsFilter;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  host: ArgumentsHost;
  request: ReturnType<typeof createRequest>;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    url: '/api/products?limit=1000',
    originalUrl: '/api/products?limit=1000',
    requestId: 'req-123',
    ...overrides,
  };
}

function createHarness(nodeEnv: string, headersSent = false): Harness {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const request = createRequest();

  const response = {
    headersSent,
    status,
    json,
    setHeader: vi.fn(),
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;

  const configService = {
    get: () => nodeEnv,
  } as unknown as ConfigService<ValidatedEnv, true>;

  return {
    filter: new AllExceptionsFilter(configService),
    status,
    json,
    host,
    request,
  };
}

describe('AllExceptionsFilter', () => {
  it('maps class-validator errors to 400 with a details array', () => {
    const { filter, host, status, json } = createHarness('test');
    const exception = new BadRequestException({
      message: ['limit must not be greater than 100'],
      error: 'Bad Request',
      statusCode: 400,
    });

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: ['limit must not be greater than 100'],
        path: '/api/products?limit=1000',
        method: 'GET',
        requestId: 'req-123',
      }),
    );
  });

  it('passes a standard HttpException message through', () => {
    const { filter, host, json } = createHarness('test');

    filter.catch(new NotFoundException('Product not found'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Product not found',
        error: 'Not Found',
      }),
    );
  });

  it('sends PassthroughHttpException payloads verbatim (health probes)', () => {
    const { filter, host, status, json } = createHarness('production');
    const payload = { success: false, status: 'degraded', checks: {} };

    filter.catch(
      new PassthroughHttpException(payload, HttpStatus.SERVICE_UNAVAILABLE),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(payload);
  });

  it('hides unexpected error details in production but keeps them in development', () => {
    const production = createHarness('production');
    production.filter.catch(new Error('Secret driver detail'), production.host);

    expect(production.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      }),
    );
    expect(JSON.stringify(production.json.mock.calls[0][0])).not.toContain(
      'Secret driver detail',
    );

    const development = createHarness('development');
    development.filter.catch(new Error('Secret driver detail'), development.host);

    expect(development.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Secret driver detail' }),
    );
  });

  it('translates a duplicate key error into 409', () => {
    const { filter, host, status, json } = createHarness('test');
    const duplicateKeyError = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { email: 1 },
    });

    filter.catch(duplicateKeyError, host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        details: ['email must be unique'],
      }),
    );
  });

  it('translates a CastError into 400', () => {
    const { filter, host, json } = createHarness('test');
    const castError = Object.assign(new Error('Cast to ObjectId failed'), {
      name: 'CastError',
    });

    filter.catch(castError, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: 'Invalid identifier format' }),
    );
  });

  it('does not touch the response when headers were already sent', () => {
    const { filter, host, status, json } = createHarness('test', true);

    filter.catch(new Error('late failure'), host);

    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
