import { createHash } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ImageStorage, StoredImage, UploadFileInput } from './image-storage.js';

interface CloudinaryUploadResponse {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  error?: { message?: string };
}

const API_ROOT = 'https://api.cloudinary.com/v1_1';
const FOLDER = 'ecommerce26/products';

/**
 * Cloudinary storage over its REST API — deliberately without the SDK.
 *
 * The upload is a signed multipart POST: every signed parameter (`folder`,
 * `timestamp`) is sorted, concatenated and hashed with the API secret. Keeping
 * this to `fetch` avoids pulling a large client library in for two calls.
 *
 * Secrets stay in the backend environment; the browser only ever receives the
 * resulting `secure_url`.
 */
@Injectable()
export class CloudinaryImageStorage implements ImageStorage {
  readonly provider = 'cloudinary' as const;

  private readonly logger = new Logger(CloudinaryImageStorage.name);

  constructor(
    private readonly cloudName: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async upload(file: UploadFileInput): Promise<StoredImage> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ folder: FOLDER, timestamp });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }));
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', FOLDER);
    form.append('signature', signature);

    const response = await fetch(`${API_ROOT}/${this.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });

    const payload = (await response.json()) as CloudinaryUploadResponse;

    if (!response.ok || !payload.secure_url || !payload.public_id) {
      this.logger.error(`Cloudinary upload failed: ${payload.error?.message ?? response.status}`);

      throw new ServiceUnavailableException(
        'Image storage is unavailable. Please try again shortly.',
      );
    }

    return {
      url: payload.secure_url,
      publicId: payload.public_id,
      provider: 'cloudinary',
      width: payload.width,
      height: payload.height,
    };
  }

  async remove(publicId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: publicId, timestamp });

    const form = new FormData();
    form.append('public_id', publicId);
    form.append('api_key', this.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    try {
      const response = await fetch(`${API_ROOT}/${this.cloudName}/image/destroy`, {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        this.logger.warn(`Could not destroy ${publicId}: HTTP ${response.status}`);
      }
    } catch (error) {
      // Deleting an orphaned asset is not worth failing the user's request.
      this.logger.warn(`Could not destroy ${publicId}: ${String(error)}`);
    }
  }

  /** sha1 of the sorted signed params followed by the API secret. */
  private sign(params: Record<string, string | number>): string {
    const toSign = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');

    return createHash('sha1').update(`${toSign}${this.apiSecret}`).digest('hex');
  }
}
