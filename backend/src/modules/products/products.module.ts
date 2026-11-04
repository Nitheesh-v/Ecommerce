import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module.js';
import { AdminProductsController } from './admin-products.controller.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { MongooseProductsRepository } from './repositories/mongoose-products.repository.js';
import { ProductsRepository } from './repositories/products.repository.js';
import { Product, ProductSchema } from './schemas/product.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    CategoriesModule,
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsService,
    { provide: ProductsRepository, useClass: MongooseProductsRepository },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
