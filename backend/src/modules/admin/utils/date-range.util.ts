import { BadRequestException } from '@nestjs/common';
import type { DashboardRange } from '../dto/dashboard-query.dto.js';
import type { TimeSeriesPoint } from '../repositories/dashboard.repository.js';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

const PRESET_DAYS: Record<Exclude<DashboardRange, 'custom'>, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const PRESET_LABELS: Record<Exclude<DashboardRange, 'custom'>, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

export interface ResolvedRange {
  range: DashboardRange;
  from: Date;
  to: Date;
  label: string;
}

export interface DateRangeInput {
  range?: DashboardRange;
  from?: string;
  to?: string;
}

/**
 * Turns the query into a concrete `[from, to]` window.
 *
 * Everything is UTC so a dashboard cannot show a different total depending on
 * the browser's timezone.
 */
export function resolveDateRange(
  input: DateRangeInput,
  now: Date = new Date(),
): ResolvedRange {
  const range = input.range ?? '30d';

  if (range === 'custom') {
    if (!input.from || !input.to) {
      throw new BadRequestException(
        'A custom range requires both "from" and "to" (ISO 8601 dates)',
      );
    }

    const from = new Date(input.from);
    const to = new Date(input.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('"from" and "to" must be valid ISO 8601 dates');
    }

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException('"from" must be earlier than "to"');
    }

    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(
        `The selected range is too large (maximum ${MAX_RANGE_DAYS} days)`,
      );
    }

    return {
      range,
      from,
      to,
      label: `${toIsoDate(from)} → ${toIsoDate(to)}`,
    };
  }

  const days = PRESET_DAYS[range];

  // Whole UTC calendar days, ending today: "last 7 days" is 7 buckets, not 8.
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  return { range, from, to: now, label: PRESET_LABELS[range] };
}

/**
 * Fills missing days with zeros so a chart never "skips" a quiet day.
 *
 * Aggregations only return days that had data; without this a chart would draw a
 * misleading continuous line between two distant points.
 */
export function fillDailySeries(
  resolved: ResolvedRange,
  points: TimeSeriesPoint[],
): TimeSeriesPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point.value]));
  const series: TimeSeriesPoint[] = [];

  const cursor = new Date(resolved.from);
  cursor.setUTCHours(0, 0, 0, 0);

  const lastDay = new Date(resolved.to);
  lastDay.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= lastDay.getTime() && series.length < MAX_RANGE_DAYS) {
    const date = toIsoDate(cursor);

    series.push({ date, value: byDate.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return series;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
