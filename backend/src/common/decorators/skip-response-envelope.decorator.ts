import { SetMetadata } from '@nestjs/common';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../constants/metadata-keys.js';

/**
 * Returns the handler's value verbatim instead of wrapping it in the standard
 * `{ success, data }` envelope.
 *
 * Reserved for infrastructure endpoints — health probes are consumed by
 * orchestrators and uptime monitors that expect a flat, dependency-free body.
 * Business endpoints must use the envelope.
 */
export const SkipResponseEnvelope = () =>
  SetMetadata(SKIP_RESPONSE_ENVELOPE_KEY, true);
