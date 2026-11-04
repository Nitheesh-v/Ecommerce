import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { CategoriesRepository } from './repositories/categories.repository.js';
import { MongooseCategoriesRepository } from './repositories/mongoose-categories.repository.js';
import { Category, CategorySchema } from './schemas/category.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }]),
  ],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [
    CategoriesService,
    { provide: CategoriesRepository, useClass: MongooseCategoriesRepository },
  ],
  exports: [CategoriesService, CategoriesRepository],
})
export class CategoriesModule {}
