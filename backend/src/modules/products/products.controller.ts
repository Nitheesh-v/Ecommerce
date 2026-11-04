import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { PublicProductsQueryDto } from './dto/create-product.dto.js';
import { ProductsService } from './products.service.js';

/**
 * Customer-facing product reads.
 *
 * Only `published` products are visible, and the projection in
 * `ProductsService.toPublicView()` never includes `costPrice`.
 */
@ApiTags('products')
@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Published products (search, category, sort, pagination)' })
  @ApiOkResponse({ description: 'Paginated public product summaries' })
  list(@Query() query: PublicProductsQueryDto) {
    return this.productsService.listPublic(query);
  }

  @Get(':idOrSlug')
  @ApiOperation({ summary: 'A published product by id or slug' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.getPublic(idOrSlug);
  }
}
