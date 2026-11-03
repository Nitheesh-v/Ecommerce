const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DURATION_PATTERN = /^(\d+)\s*(ms|s|m|h|d|w)$/i;

/**
 * Parses a human duration (`"15m"`, `"7d"`, `"30s"`) into milliseconds.
 *
 * Used for session expiry. Throws on malformed input so a typo in `.env`
 * (`"7 days"`) fails at boot via the config layer instead of creating sessions
 * that live forever or expire instantly.
 */
export function parseDurationToMs(value: string): number {
  const match = DURATION_PATTERN.exec(value.trim());

  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use a number followed by ms, s, m, h, d or w (for example "15m").`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = UNIT_TO_MS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || multiplier === undefined) {
    throw new Error(`Invalid duration "${value}"`);
  }

  return amount * multiplier;
}
