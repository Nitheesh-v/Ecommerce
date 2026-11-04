import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../../config/env.validation.js';

/**
 * Courier integration layer.
 *
 * The store ships through a **manual** workflow by default: an operator assigns a
 * courier, types the tracking number and updates the parcel status as scans come
 * in. That is a real workflow, not a placeholder — nothing is invented.
 *
 * Provider adapters are *declared* here and become selectable only when their
 * credentials exist. Until then they are reported as disabled, and selecting one
 * is a `503` that names the missing variables instead of pretending to ship. When
 * a provider is configured, its adapter is added to this registry — never a second
 * parallel integration.
 */

export const COURIER_PROVIDERS = ['manual', 'shiprocket', 'delhivery', 'bluedart'] as const;
export type CourierProviderId = (typeof COURIER_PROVIDERS)[number];

export interface CourierProviderDescriptor {
  id: CourierProviderId;
  /** Human name printed on labels and shown in the console. */
  name: string;
  /** `true` when parcels can be booked through an API. */
  automated: boolean;
  /** `true` when the provider can be used right now. */
  enabled: boolean;
  /** Environment variables that are still required. */
  missingConfiguration: string[];
  /** Only set when the provider publishes a stable tracking URL template. */
  trackingUrlTemplate?: string;
}

interface ProviderDefinition {
  id: CourierProviderId;
  name: string;
  automated: boolean;
  /** All of these must be present for the provider to be enabled. */
  requiredConfig: Array<keyof ValidatedEnv>;
  trackingUrlTemplate?: string;
}

const DEFINITIONS: ProviderDefinition[] = [
  {
    id: 'manual',
    name: 'Manual / own courier',
    automated: false,
    requiredConfig: [],
  },
  {
    id: 'shiprocket',
    name: 'Shiprocket',
    automated: true,
    requiredConfig: ['SHIPROCKET_EMAIL', 'SHIPROCKET_PASSWORD'],
  },
  {
    id: 'delhivery',
    name: 'Delhivery',
    automated: true,
    requiredConfig: ['DELHIVERY_API_TOKEN'],
  },
  {
    id: 'bluedart',
    name: 'Blue Dart',
    automated: true,
    requiredConfig: ['BLUEDART_API_KEY', 'BLUEDART_LICENCE_KEY'],
  },
];

@Injectable()
export class CourierRegistry {
  private readonly providers: CourierProviderDescriptor[];

  constructor(configService: ConfigService<ValidatedEnv, true>) {
    this.providers = DEFINITIONS.map((definition) => {
      const missingConfiguration = definition.requiredConfig.filter(
        (key) => !configService.get(key, { infer: true }),
      );

      return {
        id: definition.id,
        name: definition.name,
        automated: definition.automated,
        enabled: missingConfiguration.length === 0,
        missingConfiguration,
        trackingUrlTemplate: definition.trackingUrlTemplate,
      };
    });
  }

  list(): CourierProviderDescriptor[] {
    return this.providers.map((provider) => ({ ...provider }));
  }

  /** Enabled providers are what the console offers by default. */
  listEnabled(): CourierProviderDescriptor[] {
    return this.list().filter((provider) => provider.enabled);
  }

  get(id: string): CourierProviderDescriptor {
    const provider = this.providers.find((candidate) => candidate.id === id);

    if (!provider) {
      throw new BadRequestException(`Unknown courier partner "${id}"`);
    }

    return { ...provider };
  }

  /** Refuses a provider that is declared but not configured, with the reason. */
  requireEnabled(id: string): CourierProviderDescriptor {
    const provider = this.get(id);

    if (!provider.enabled) {
      throw new ServiceUnavailableException(
        `${provider.name} is not configured on this server (missing: ${provider.missingConfiguration.join(', ')}). Use the manual courier workflow until its credentials exist.`,
      );
    }

    return provider;
  }

  /** Name to store: the operator's label wins, otherwise the provider's name. */
  resolveName(provider: CourierProviderDescriptor, requested?: string): string {
    const name = requested?.trim();

    return name && name.length > 0 ? name : provider.name;
  }
}
