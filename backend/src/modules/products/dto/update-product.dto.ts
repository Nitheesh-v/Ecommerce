import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

/**
 * Every field optional, all original validators kept — **except `stock`**.
 *
 * Stock is intentionally not updatable through the product endpoints: a silent
 * `PATCH { stock: 3 }` would bypass the audit trail, the negative-stock guard and
 * the low-stock alerts. Because the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, sending `stock` here is a 400 that points the caller at
 * `POST /api/admin/inventory/adjust`.
 *
 * `lowStockThreshold` stays editable — it is configuration, not quantity — but
 * changing it re-evaluates the product's alerts (see `ProductsService.update`).
 *
 * Cross-field rules — sale price below regular price, unique SKU/slug, category
 * existence — are enforced in `ProductsService`, because they need the stored
 * record, not just the payload.
 */
export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['stock'] as const),
) {}
