import { BadRequestException } from '@nestjs/common';
import { fillDailySeries, resolveDateRange, toIsoDate } from './date-range.util.js';

const NOW = new Date('2026-11-04T12:00:00.000Z');

describe('resolveDateRange', () => {
  it('defaults to the last 30 days', () => {
    const range = resolveDateRange({}, NOW);

    expect(range.range).toBe('30d');
    expect(range.label).toBe('Last 30 days');
    expect(toIsoDate(range.from)).toBe('2026-10-06');
    expect(range.to).toEqual(NOW);
  });

  it('produces whole-day windows that include today', () => {
    const seven = resolveDateRange({ range: '7d' }, NOW);
    expect(toIsoDate(seven.from)).toBe('2026-10-29');
    expect(fillDailySeries(seven, [])).toHaveLength(7);

    const today = resolveDateRange({ range: 'today' }, NOW);
    expect(today.from.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(fillDailySeries(today, [])).toHaveLength(1);

    const ninety = resolveDateRange({ range: '90d' }, NOW);
    expect(fillDailySeries(ninety, [])).toHaveLength(90);
  });

  it('accepts a valid custom window', () => {
    const range = resolveDateRange(
      { range: 'custom', from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.000Z' },
      NOW,
    );

    expect(range.label).toBe('2026-10-01 → 2026-10-31');
    expect(range.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rejects a custom window missing one bound', () => {
    expect(() =>
      resolveDateRange({ range: 'custom', from: '2026-10-01T00:00:00.000Z' }, NOW),
    ).toThrow(BadRequestException);
  });

  it('rejects an inverted window', () => {
    expect(() =>
      resolveDateRange(
        { range: 'custom', from: '2026-10-31T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
        NOW,
      ),
    ).toThrow(/"from" must be earlier than "to"/);
  });

  it('caps an oversized window', () => {
    expect(() =>
      resolveDateRange({ range: 'custom', from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }, NOW),
    ).toThrow(/too large/);
  });
});

describe('fillDailySeries', () => {
  it('inserts zeros for quiet days and keeps existing values', () => {
    const range = resolveDateRange({ range: '7d' }, NOW);

    const filled = fillDailySeries(range, [
      { date: '2026-10-29', value: 1500 },
      { date: '2026-11-04', value: 2400 },
    ]);

    expect(filled).toHaveLength(7);
    expect(filled[0]).toEqual({ date: '2026-10-29', value: 1500 });
    expect(filled[1]).toEqual({ date: '2026-10-30', value: 0 });
    expect(filled.at(-1)).toEqual({ date: '2026-11-04', value: 2400 });
  });

  it('ignores points outside the window', () => {
    const range = resolveDateRange({ range: 'today' }, NOW);

    const filled = fillDailySeries(range, [{ date: '2026-10-01', value: 999 }]);

    expect(filled).toEqual([{ date: '2026-11-04', value: 0 }]);
  });
});
