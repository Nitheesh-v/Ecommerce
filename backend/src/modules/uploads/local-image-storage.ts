import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { ImageStorage, StoredImage, UploadFileInput } from './image-storage.js';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

/**
 * Development / single-server storage: files land in `UPLOAD_DIR` (default
 * `backend/uploads`) and are served read-only from `/uploads/<file>`.
 *
 * Not for multi-instance deployments — that is what the Cloudinary provider is
 * for. Either way Mongo only keeps the URL.
 */
@Injectable()
export class LocalImageStorage implements ImageStorage {
  readonly provider = 'local' as const;

  private readonly logger = new Logger(LocalImageStorage.name);
  private readonly directory: string;

  constructor(directory = 'uploads') {
    this.directory = resolve(process.cwd(), directory);
  }

  async upload(file: UploadFileInput): Promise<StoredImage> {
    await mkdir(this.directory, { recursive: true });

    const extension =
      EXTENSION_BY_MIME[file.mimetype] ??
      extname(file.originalname).toLowerCase() ??
      '.bin';

    const filename = `${randomUUID()}${extension}`;
    const target = join(this.directory, filename);

    await writeFile(target, file.buffer);

    return {
      url: `/uploads/${filename}`,
      publicId: filename,
      provider: 'local',
    };
  }

  async remove(publicId: string): Promise<void> {
    // Reject path traversal: only a bare filename is ever deletable.
    const filename = publicId.replace(/^.*[\\/]/, '');

    try {
      await unlink(join(this.directory, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not remove ${filename}: ${String(error)}`);
      }
    }
  }
}
