import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { CategoriesService } from './categories.service.js';

class CategoryListQueryDto {
  @IsIn(['active', 'inactive'])
  @IsOptional()
  status?: 'active' | 'inactive';
}

/**
 * Read-only category surface.
 *
 * Full category management (create/rename/reorder) is the next module; products
 * only need the list to render a category selector and to validate assignments.
 */
@ApiTags('categories')
@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Active categories (storefront)' })
  @ApiOkResponse({ description: 'Category list, alphabetical' })
  listPublic() {
    return this.categoriesService.listActive();
  }

  @Get('admin/categories')
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'All categories, optionally filtered by status (admin)' })
  listForAdmin(@Query() query: CategoryListQueryDto) {
    return this.categoriesService.list(query.status);
  }
}
