import type { NextConfig } from "next";

/**
 * Product imagery lives on the API origin (`/uploads/…` for the local store) or on
 * Cloudinary when the backend is configured with a cloud account. `next/image`
 * needs both allow-listed up front, and the API origin is derived from the same
 * variable the browser client uses, so a deployment only has to set one thing.
 */
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"
).replace(/\/+$/, "");
const apiOrigin = new URL(API_BASE_URL);

/**
 * Next 16 will not fetch images from private addresses unless asked to. A local
 * API on `localhost:5000` needs it; a deployed store on a real hostname must not
 * have it, so it follows the API origin instead of being hard-coded on.
 */
const isLocalApi = ["localhost", "127.0.0.1", "::1"].includes(apiOrigin.hostname);

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    dangerouslyAllowLocalIP: isLocalApi,
    remotePatterns: [
      {
        protocol: apiOrigin.protocol === "https:" ? "https" : "http",
        hostname: apiOrigin.hostname,
        port: apiOrigin.port || undefined,
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
