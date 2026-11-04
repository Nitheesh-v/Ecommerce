import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnv } from '../../config/env.validation.js';
import { CloudinaryImageStorage } from './cloudinary-image-storage.js';
import { ImageStorage } from './image-storage.js';
import { LocalImageStorage } from './local-image-storage.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/**
 * Chooses the image provider from the environment:
 *
 * - all three `CLOUDINARY_*` values present → Cloudinary (CDN, multi-instance safe);
 * - otherwise → local disk under `UPLOAD_DIR`, served from `/uploads`.
 *
 * The choice is invisible above `ImageStorage`, so switching providers needs no
 * code change in the product module.
 */
@Module({
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: ImageStorage,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ValidatedEnv, true>) => {
        const cloudName = configService.get('CLOUDINARY_CLOUD_NAME', { infer: true });
        const apiKey = configService.get('CLOUDINARY_API_KEY', { infer: true });
        const apiSecret = configService.get('CLOUDINARY_API_SECRET', { infer: true });

        if (cloudName && apiKey && apiSecret) {
          return new CloudinaryImageStorage(cloudName, apiKey, apiSecret);
        }

        return new LocalImageStorage(configService.get('UPLOAD_DIR', { infer: true }));
      },
    },
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
