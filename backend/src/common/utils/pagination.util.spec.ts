import {
  createPaginatedResult,
  createPaginationMeta,
  getSkip,
} from './pagination.util.js';

describe('getSkip', () => {
  it('returns the offset for a 1-based page', () => {
    expect(getSkip(1, 20)).toBe(0);
    expect(getSkip(3, 20)).toBe(40);
    expect(getSkip(2, 15)).toBe(15);
  });

  it('never returns a negative offset', () => {
    expect(getSkip(0, 20)).toBe(0);
    expect(getSkip(-5, 20)).toBe(0);
  });
});

describe('createPaginationMeta', () => {
  it('computes totals and flags', () => {
    expect(createPaginationMeta(2, 10, 35)).toEqual({
      page: 2,
      limit: 10,
      total: 35,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('marks the last page correctly', () => {
    const meta = createPaginationMeta(4, 10, 35);

    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPreviousPage).toBe(true);
  });

  it('handles an empty result set', () => {
    expect(createPaginationMeta(1, 10, 0)).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('clamps out-of-range input instead of producing NaN', () => {
    const meta = createPaginationMeta(Number.NaN, 0, -3);

    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(1);
    expect(meta.total).toBe(0);
    expect(meta.totalPages).toBe(0);
  });
});

describe('createPaginatedResult', () => {
  it('wraps the page of documents with its metadata', () => {
    const result = createPaginatedResult([{ id: '1' }, { id: '2' }], 1, 2, 5);

    expect(result.data).toHaveLength(2);
    expect(result.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
  });
});
