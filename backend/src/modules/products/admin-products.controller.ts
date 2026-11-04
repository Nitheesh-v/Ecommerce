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
import {
  AdminProductsQueryDto,
  CreateProductDto,
  UpdateProductStatusDto,
} from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsService } from './products.service.js';

/**
 * Admin product surface.
 *
 * Kept under `/api/admin/*` (like the dashboard endpoint) so the storefront API
 * never exposes a write verb and the admin namespace stays a single, guardable
 * prefix. `@Roles(Role.Admin)` is enforced server-side by the global `RolesGuard`.
 */
@ApiTags('admin/products')
@ApiBearerAuth()
@Roles(Role.Admin)
@ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
@ApiForbiddenResponse({ type: ApiErrorResponseDto, description: 'Admin role required' })
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products with search, filters, sorting and pagination' })
  @ApiOkResponse({ description: 'Paginated products in `{ data, meta }`' })
  list(@Query() query: AdminProductsQueryDto) {
    return this.productsService.listForAdmin(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ description: 'The created product, including cost price' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Duplicate SKU or slug' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product (any status)' })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  get(@Param('id') id: string) {
    return this.productsService.getForAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Publish, unpublish (draft) or archive a product' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.changeStatus(id, dto.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (partial)' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: 'Duplicate SKU or slug' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a product, or archive it when order history references it',
  })
  @ApiOkResponse({
    description: '`{ deleted, archived, referencedOrders, message }`',
  })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
