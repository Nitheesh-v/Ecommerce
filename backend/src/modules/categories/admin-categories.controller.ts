import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto.js';
import { Role } from '../../common/enums/role.enum.js';
import { CategoriesService } from './categories.service.js';
import { AdminCategoriesQueryDto } from './dto/categories-query.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import {
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './dto/update-category.dto.js';

/**
 * Admin category surface — deliberately under `/api/admin/*`, matching
 * `/api/admin/products` and `/api/admin/dashboard`: the public `/api/categories`
 * namespace never exposes a write verb.
 *
 * `@Roles(Role.Admin)` is enforced server-side by the global `RolesGuard`; the
 * console's role check is only UX.
 */
@ApiTags('admin/categories')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List categories with search, filters, sorting, pagination' })
  @ApiOkResponse({ description: 'Paginated categories in `{ data, meta }`' })
  list(@Query() query: AdminCategoriesQueryDto) {
    return this.categoriesService.listAdmin({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      parentId: query.parentId,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ description: 'The created category' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Duplicate slug or a duplicate name at the same level',
  })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single category (any status)' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.categoriesService.getAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate or deactivate a category' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCategoryStatusDto) {
    return this.categoriesService.changeStatus(id, dto.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category (partial)' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Duplicate slug' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category that has no children and no products' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'The category still has subcategories or products',
  })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
