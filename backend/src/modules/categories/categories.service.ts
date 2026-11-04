import { Injectable } from '@nestjs/common';
// Value import on purpose: `CategoriesRepository` is the DI token, and a
// type-only import erases it from `design:paramtypes` (Nest then can't inject).
import { CategoriesRepository } from './repositories/categories.repository.js';
import type { CategoryRecord } from './repositories/categories.repository.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  /** Admin view: every category, optionally filtered by status. */
  list(status?: 'active' | 'inactive'): Promise<CategoryRecord[]> {
    return this.categoriesRepository.list(status);
  }

  /** Storefront view: only categories that products may be assigned to. */
  listActive(): Promise<CategoryRecord[]> {
    return this.categoriesRepository.list('active');
  }

  /**
   * Used by the product service before assigning a category.
   * Returns the record so callers can check `status` as well as existence.
   */
  findById(id: string): Promise<CategoryRecord | null> {
    return this.categoriesRepository.findById(id);
  }

  async exists(id: string): Promise<boolean> {
    return (await this.categoriesRepository.findById(id)) !== null;
  }
}
