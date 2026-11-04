import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../../config/env.validation.js';
import { COURIER_PROVIDERS, CourierRegistry } from './courier-provider.js';

function registry(config: Partial<Record<keyof ValidatedEnv, string>> = {}) {
  const configService = {
    get: (key: keyof ValidatedEnv) => config[key],
  } as unknown as ConfigService<ValidatedEnv, true>;

  return new CourierRegistry(configService);
}

describe('CourierRegistry', () => {
  it('always offers the manual workflow, because it needs no credentials', () => {
    const couriers = registry();
    const manual = couriers.get('manual');

    expect(manual.enabled).toBe(true);
    expect(manual.automated).toBe(false);
    expect(manual.missingConfiguration).toEqual([]);
    expect(couriers.listEnabled().map((provider) => provider.id)).toEqual(['manual']);
  });

  it('declares every partner but disables the ones without configuration', () => {
    const providers = registry().list();

    expect(providers.map((provider) => provider.id)).toEqual([...COURIER_PROVIDERS]);

    const shiprocket = providers.find((provider) => provider.id === 'shiprocket');
    expect(shiprocket?.enabled).toBe(false);
    expect(shiprocket?.missingConfiguration).toEqual([
      'SHIPROCKET_EMAIL',
      'SHIPROCKET_PASSWORD',
    ]);

    const bluedart = providers.find((provider) => provider.id === 'bluedart');
    expect(bluedart?.missingConfiguration).toEqual([
      'BLUEDART_API_KEY',
      'BLUEDART_LICENCE_KEY',
    ]);
  });

  it('enables a partner only when every one of its credentials is present', () => {
    const partial = registry({ DELHIVERY_API_TOKEN: 'token' });
    expect(partial.get('delhivery').enabled).toBe(true);

    const shiprocket = registry({
      SHIPROCKET_EMAIL: 'ops@example.com',
    }).get('shiprocket');
    expect(shiprocket.enabled).toBe(false);
    expect(shiprocket.missingConfiguration).toEqual(['SHIPROCKET_PASSWORD']);
  });

  it('names the missing configuration instead of pretending to ship', () => {
    expect(() => registry().requireEnabled('shiprocket')).toThrowError(
      /SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD/,
    );

    const enabled = registry({
      SHIPROCKET_EMAIL: 'ops@example.com',
      SHIPROCKET_PASSWORD: 'secret',
    });
    expect(enabled.requireEnabled('shiprocket').enabled).toBe(true);
  });

  it('rejects an unknown provider', () => {
    expect(() => registry().get('fedex')).toThrowError(BadRequestException);
  });

  it('stores the printed label, or the provider name when none is given', () => {
    const couriers = registry();
    const manual = couriers.get('manual');

    expect(couriers.resolveName(manual, '  Blue Dart  ')).toBe('Blue Dart');
    expect(couriers.resolveName(manual, '   ')).toBe('Manual / own courier');
    expect(couriers.resolveName(manual)).toBe('Manual / own courier');
  });
});
