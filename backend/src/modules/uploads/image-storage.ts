/** The subset of multer's `Express.Multer.File` this module needs. */
export interface UploadFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface StoredImage {
  /** Absolute URL for Cloudinary, API-relative path (`/uploads/…`) for local. */
  url: string;
  /** Provider handle used to delete the asset later. */
  publicId: string;
  provider: 'local' | 'cloudinary';
  width?: number;
  height?: number;
}

/**
 * Storage boundary for product images.
 *
 * Mongo stores only the resulting URL + publicId — never bytes. Swapping the
 * provider (local disk today, Cloudinary when credentials are configured) is a
 * module-level concern and changes nothing above this interface.
 */
export abstract class ImageStorage {
  abstract readonly provider: 'local' | 'cloudinary';

  abstract upload(file: UploadFileInput): Promise<StoredImage>;

  /** Best-effort: removing an already-missing asset must not fail a request. */
  abstract remove(publicId: string): Promise<void>;
}
