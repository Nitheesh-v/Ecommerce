import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

/**
 * Every field optional, all original validators kept (including the nested image
 * shape). Cross-field rules — sale price below regular price, unique SKU/slug,
 * category existence — are enforced in `ProductsService`, because they need the
 * stored record, not just the payload.
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}
