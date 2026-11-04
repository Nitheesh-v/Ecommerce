import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ImageStorage } from './image-storage.js';
import type { StoredImage, UploadFileInput } from './image-storage.js';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly storage: ImageStorage) {}

  get provider() {
    return this.storage.provider;
  }

  /**
   * Validates the upload before it reaches storage.
   *
   * The MIME type comes from the client and is therefore untrusted for anything
   * security-critical, but it is enough to stop "upload a PDF as a product
   * image" accidents; files are additionally re-served with a fixed content type
   * by the static handler.
   */
  async uploadImage(file: UploadFileInput | undefined): Promise<StoredImage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Attach an image in the "file" field');
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      throw new BadRequestException(
        `Unsupported image type "${file.mimetype}". Use JPEG, PNG, WEBP or AVIF.`,
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Images must be 5 MB or smaller');
    }

    return this.storage.upload(file);
  }

  /** Removes an asset when an image is detached from a product. */
  async removeImage(publicId: string | undefined): Promise<void> {
    if (!publicId) {
      return;
    }

    try {
      await this.storage.remove(publicId);
    } catch (error) {
      // A stale CDN asset must never block an admin workflow.
      this.logger.warn(`Image cleanup failed for ${publicId}: ${String(error)}`);
    }
  }
}
