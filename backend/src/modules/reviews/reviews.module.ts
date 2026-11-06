import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { ProductsModule } from '../products/products.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminReviewsController } from './admin-reviews.controller.js';
import { MongoReviewsRepository } from './repositories/mongo-reviews.repository.js';
import { ReviewsRepository } from './repositories/reviews.repository.js';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import {
  CustomerReviewsController,
  ProductReviewsController,
} from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Reviews & ratings.
 *
 * Depends on products (resolve the product a review belongs to) and orders (prove
 * the customer received it). Neither depends on reviews, so the graph stays acyclic.
 *
 * The repository is an abstract class used as the DI token, so e2e tests can swap in
 * an in-memory implementation — the same pattern as orders, offers and shipments.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    ProductsModule,
    OrdersModule,
    // `ActiveAccountGuard` re-reads the account, so suspended customers cannot post.
    UsersModule,
    // "New review awaiting moderation" lands in the operator feed.
    NotificationsModule,
  ],
  controllers: [
    ProductReviewsController,
    CustomerReviewsController,
    AdminReviewsController,
  ],
  providers: [
    ReviewsService,
    { provide: ReviewsRepository, useClass: MongoReviewsRepository },
  ],
  exports: [ReviewsService, ReviewsRepository],
})
export class ReviewsModule {}
