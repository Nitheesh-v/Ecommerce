import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
// Type-only: mongoose is CommonJS, and `emitDecoratorMetadata` would otherwise
// turn this into a runtime value import that fails in ESM.
import type { Connection } from 'mongoose';

/** Subset of the Mongoose connection states we report on. */
const CONNECTION_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface LivenessResult {
  success: true;
  message: string;
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResult {
  success: boolean;
  status: 'ok' | 'degraded';
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: {
      status: 'up' | 'down';
      state: string;
      /** Present only when a connection exists. */
      name?: string;
      host?: string;
    };
  };
}

/**
 * Health checks.
 *
 * Liveness answers "is the process up?" and must not touch external systems.
 * Readiness answers "can this instance serve traffic?" and therefore inspects
 * the dependencies that a request needs — today MongoDB.
 */
@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  getLiveness(): LivenessResult {
    return {
      success: true,
      message: 'E-commerce API is running',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  getReadiness(): ReadinessResult {
    const state = this.connection?.readyState ?? 0;
    const isUp = state === 1;

    return {
      success: isUp,
      status: isUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database: {
          status: isUp ? 'up' : 'down',
          state: CONNECTION_STATE_LABELS[state] ?? 'unknown',
          name: isUp ? this.connection.name : undefined,
          host: isUp ? this.connection.host : undefined,
        },
      },
    };
  }
}
