import { randomUUID } from 'node:crypto';
import type {
  ImageStorage,
  StoredImage,
  UploadFileInput,
} from '../../src/modules/uploads/image-storage.js';

/** Records uploads/deletions without touching disk or the network. */
export class FakeImageStorage implements ImageStorage {
  readonly provider = 'local' as const;

  readonly uploads: UploadFileInput[] = [];
  readonly removed: string[] = [];

  async upload(file: UploadFileInput): Promise<StoredImage> {
    this.uploads.push(file);

    const publicId = `test-${randomUUID()}`;

    return {
      url: `/uploads/${publicId}.png`,
      publicId,
      provider: 'local',
    };
  }

  async remove(publicId: string): Promise<void> {
    this.removed.push(publicId);
  }
}
