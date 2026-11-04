import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { CategoriesService } from './categories.service.js';
import { PublicCategoriesQueryDto } from './dto/categories-query.dto.js';

/**
 * Customer-facing category reads.
 *
 * Only `active` categories are ever returned; inactive ones (and children of
 * inactive parents) are 404s. Nothing here exposes SEO internals or admin fields
 * beyond what the storefront renders.
 */
@ApiTags('categories')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Active categories (nested tree by default, flat with `?tree=false`)',
  })
  @ApiOkResponse({ description: 'Active categories in display order' })
  list(@Query() query: PublicCategoriesQueryDto) {
    const wantsFlat = query.tree === 'false' || query.parent !== undefined;

    return wantsFlat
      ? this.categoriesService.getPublicList(query.parent)
      : this.categoriesService.getPublicTree();
  }

  @Get(':slug')
  @ApiOperation({
    summary: 'An active category with breadcrumb, children and siblings',
  })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('slug') slug: string) {
    return this.categoriesService.getPublicBySlug(slug);
  }
}
