import { apiClient, requestData } from "@/lib/api/client";
import type { UploadedImage } from "@/types/product";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export const uploadsService = {
  uploadImage(file: File) {
    const body = new FormData();
    body.append("file", file);

    return requestData<UploadedImage>(
      apiClient.post("/admin/uploads/images", body, {
        // Let the browser set the multipart boundary.
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
};
