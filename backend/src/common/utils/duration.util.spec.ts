import { parseDurationToMs } from './duration.util.js';

describe('parseDurationToMs', () => {
  it('parses every supported unit', () => {
    expect(parseDurationToMs('500ms')).toBe(500);
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(900_000);
    expect(parseDurationToMs('2h')).toBe(7_200_000);
    expect(parseDurationToMs('7d')).toBe(604_800_000);
    expect(parseDurationToMs('1w')).toBe(604_800_000);
  });

  it('tolerates surrounding whitespace and upper case', () => {
    expect(parseDurationToMs(' 15M ')).toBe(900_000);
  });

  it('rejects malformed values instead of silently defaulting', () => {
    expect(() => parseDurationToMs('7 days')).toThrow(/Invalid duration/);
    expect(() => parseDurationToMs('abc')).toThrow(/Invalid duration/);
    expect(() => parseDurationToMs('15')).toThrow(/Invalid duration/);
    expect(() => parseDurationToMs('0d')).toThrow(/Invalid duration/);
    expect(() => parseDurationToMs('-5m')).toThrow(/Invalid duration/);
  });
});
