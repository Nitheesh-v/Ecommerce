import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import type {
  CategorySalesPoint,
  DashboardMetrics,
  DashboardRepository,
  LowStockSummary,
  RecentCustomerSummary,
  RecentOrderSummary,
  StatusCount,
  TimeSeriesPoint,
  TopProductSummary,
} from './repositories/dashboard.repository.js';

function createRepositoryStub(overrides: Partial<DashboardRepository> = {}) {
  const repository: DashboardRepository = {
    getMetrics: async (): Promise<DashboardMetrics> => ({
      revenue: 250_000,
      orders: 12,
      products: 40,
      customers: 8,
      pendingOrders: 3,
      lowStockProducts: 2,
      averageOrderValue: 20_833,
    }),
    getRevenueSeries: async (): Promise<TimeSeriesPoint[]> => [
      { date: '2026-11-04', value: 120_000 },
    ],
    getOrdersSeries: async (): Promise<TimeSeriesPoint[]> => [{ date: '2026-11-04', value: 2 }],
    getOrderStatusDistribution: async (): Promise<StatusCount[]> => [
      { status: 'pending', count: 3 },
    ],
    getSalesByCategory: async (): Promise<CategorySalesPoint[]> => [
      { category: 'Shoes', revenue: 90_000, orders: 4 },
    ],
    getRecentOrders: async (): Promise<RecentOrderSummary[]> => [],
    getTopProducts: async (): Promise<TopProductSummary[]> => [
      { id: 'p1', name: 'Runner', unitsSold: 4, revenue: 90_000 },
    ],
    getLowStock: async (): Promise<LowStockSummary[]> => [
      { id: 'p2', name: 'Cap', sku: 'CAP-1', stock: 1, lowStockThreshold: 5 },
    ],
    getRecentCustomers: async (): Promise<RecentCustomerSummary[]> => [],
    ...overrides,
  };

  return repository;
}

describe('DashboardService', () => {
  it('returns every dashboard section for the requested range', async () => {
    const service = new DashboardService(createRepositoryStub());

    const overview = await service.getOverview({ range: '7d' } as never);

    expect(overview.range.key).toBe('7d');
    expect(overview.range.label).toBe('Last 7 days');
    expect(overview.metrics.revenue).toBe(250_000);
    expect(overview.revenueSeries).toHaveLength(7);
    expect(overview.ordersSeries).toHaveLength(7);
    expect(overview.salesByCategory[0]?.category).toBe('Shoes');
    expect(overview.topProducts).toHaveLength(1);
    expect(overview.generatedAt).toEqual(expect.any(String));
  });

  it('gap-fills sparse series so charts stay continuous', async () => {
    const service = new DashboardService(
      createRepositoryStub({
        getRevenueSeries: async (): Promise<TimeSeriesPoint[]> => [],
        getOrdersSeries: async (): Promise<TimeSeriesPoint[]> => [],
      }),
    );

    const overview = await service.getOverview({ range: '30d' } as never);

    expect(overview.revenueSeries).toHaveLength(30);
    expect(overview.revenueSeries.every((point) => point.value === 0)).toBe(true);
  });

  it('caps list sizes so a big store cannot blow up the payload', async () => {
    const limits: number[] = [];
    const service = new DashboardService(
      createRepositoryStub({
        getRecentOrders: async (limit: number) => {
          limits.push(limit);
          return [];
        },
        getSalesByCategory: async (_from: Date, _to: Date, limit: number) => {
          limits.push(limit);
          return [];
        },
      }),
    );

    await service.getOverview({ range: 'today' } as never);

    // Invoked in service order: category chart, then recent orders.
    expect(limits).toEqual([6, 5]);
  });

  it('propagates range validation errors as 400s', async () => {
    const service = new DashboardService(createRepositoryStub());

    await expect(
      service.getOverview({ range: 'custom', from: '2026-11-01T00:00:00.000Z' } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
