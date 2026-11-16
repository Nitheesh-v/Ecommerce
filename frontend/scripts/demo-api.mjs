/**
 * Demo storefront API (preview only — never shipped).
 *
 * The real NestJS API needs MongoDB, which the preview sandbox has no access to.
 * This tiny Node server answers the handful of **public** endpoints the storefront
 * renders from, with fixtures shaped exactly like the real contracts
 * (`frontend/src/types/*`), so the UI can be reviewed end to end.
 *
 * It deliberately implements no writes: the cart, checkout and admin flows are
 * already covered by the repo's own test suite. Anything unhandled returns a 404
 * in the real API's error envelope, which is also what "not built" should look like.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT ?? 5000);
const PUBLIC_DIR = join(process.cwd(), "public");

const CATEGORIES = [
  {
    id: "cat-apparel",
    name: "Apparel",
    slug: "apparel",
    description: "Slow-made basics in natural fibres.",
    image: { url: "/uploads/linen-shirt.jpg" },
    displayOrder: 1,
    productCount: 2,
  },
  {
    id: "cat-bags",
    name: "Bags & Leather",
    slug: "bags-leather",
    description: "Full-grain leather that ages rather than wears out.",
    image: { url: "/uploads/leather-tote.jpg" },
    displayOrder: 2,
    productCount: 1,
  },
  {
    id: "cat-home",
    name: "Home & Table",
    slug: "home-table",
    description: "Hand-glazed stoneware for everyday use.",
    image: { url: "/uploads/ceramic-mug.jpg" },
    displayOrder: 3,
    productCount: 1,
  },
  {
    id: "cat-paper",
    name: "Paper & Desk",
    slug: "paper-desk",
    description: "Things worth writing in.",
    image: { url: "/uploads/leather-journal.jpg" },
    displayOrder: 4,
    productCount: 1,
  },
  {
    id: "cat-footwear",
    name: "Footwear",
    slug: "footwear",
    description: "Quiet canvas, gum soles.",
    image: { url: "/uploads/canvas-sneakers.jpg" },
    displayOrder: 5,
    productCount: 1,
  },
];

const categoryRef = (slug) => {
  const found = CATEGORIES.find((category) => category.slug === slug);

  return found
    ? { id: found.id, name: found.name, slug: found.slug }
    : null;
};

const PRODUCTS = [
  {
    id: "prod-01",
    name: "Roma Linen Shirt",
    slug: "roma-linen-shirt",
    shortDescription:
      "A relaxed camp-collar shirt cut from 100% European linen that softens with every wash.",
    description:
      "Cut from a mid-weight European linen that starts crisp and softens into something you will reach for all summer.\n\nCamp collar, mother-of-pearl buttons, and a straight hem that sits untucked. Pre-washed, so it will not shrink on you — and it only gets better from here.",
    sku: "RM-LIN-CRM-M",
    brand: "Atelier Nord",
    category: categoryRef("apparel"),
    price: 449000,
    salePrice: 349000,
    stock: 12,
    isFeatured: true,
    ratingAverage: 4.6,
    ratingCount: 48,
    images: [{ url: "/uploads/linen-shirt.jpg", alt: "Roma Linen Shirt", isPrimary: true }],
  },
  {
    id: "prod-02",
    name: "Everyday Leather Tote",
    slug: "everyday-leather-tote",
    shortDescription:
      "Vegetable-tanned full-grain leather, unlined, with a pocket exactly where you need it.",
    description:
      "Vegetable-tanned full-grain leather from a small tannery in Kanpur, left unlined so you can see how it is built.\n\nIt fits a 14-inch laptop, a water bottle and a paperback, and it develops a patina rather than scuffs. Solid brass hardware, stitched by hand.",
    sku: "WD-TOTE-TAN",
    brand: "Welden",
    category: categoryRef("bags-leather"),
    price: 1299000,
    salePrice: null,
    stock: 4,
    isFeatured: true,
    ratingAverage: 4.9,
    ratingCount: 112,
    images: [
      { url: "/uploads/leather-tote.jpg", alt: "Everyday Leather Tote", isPrimary: true },
    ],
  },
  {
    id: "prod-03",
    name: "Oatmeal Stoneware Mug",
    slug: "oatmeal-stoneware-mug",
    shortDescription: "Hand-glazed, 320ml, dishwasher-safe. Made to be the one you reach for.",
    description:
      "Thrown and glazed by hand in a two-person studio in Auroville, so no two mugs are identical.\n\nHolds 320ml, keeps heat well thanks to the thick wall, and goes in the dishwasher. The oatmeal glaze is food-safe and lead-free.",
    sku: "AV-MUG-OAT",
    brand: "Clay & Kiln",
    category: categoryRef("home-table"),
    price: 89000,
    salePrice: 69000,
    stock: 26,
    isFeatured: true,
    ratingAverage: 4.4,
    ratingCount: 67,
    images: [
      { url: "/uploads/ceramic-mug.jpg", alt: "Oatmeal Stoneware Mug", isPrimary: true },
    ],
  },
  {
    id: "prod-04",
    name: "Lambswool Scarf",
    slug: "lambswool-scarf",
    shortDescription: "Brushed lambswool, generous length, finished with a hand-knotted fringe.",
    description:
      "Spun from British lambswool and brushed twice for softness, so it warms without the itch.\n\nTwo metres long — enough for a proper wrap — with a hand-knotted fringe. Dry clean, or hand wash cold and dry flat.",
    sku: "AN-SCF-OAT",
    brand: "Atelier Nord",
    category: categoryRef("apparel"),
    price: 259000,
    salePrice: null,
    stock: 9,
    isFeatured: true,
    ratingAverage: 4.7,
    ratingCount: 21,
    images: [{ url: "/uploads/wool-scarf.jpg", alt: "Lambswool Scarf", isPrimary: true }],
  },
  {
    id: "prod-05",
    name: "Refillable Leather Journal",
    slug: "refillable-leather-journal",
    shortDescription: "A6, 192 pages of cream 100gsm paper, with a replaceable insert.",
    description:
      "A slim leather cover that takes an A6 insert, so the notebook can be replaced and the cover kept for years.\n\n192 pages of cream 100gsm paper — thick enough for fountain pen ink. Lies flat, has a fabric bookmark and an elastic closure.",
    sku: "PD-JRN-BRN",
    brand: "Paper Union",
    category: categoryRef("paper-desk"),
    price: 179000,
    salePrice: 149000,
    stock: 0,
    isFeatured: true,
    ratingAverage: 4.8,
    ratingCount: 54,
    images: [
      { url: "/uploads/leather-journal.jpg", alt: "Refillable Leather Journal", isPrimary: true },
    ],
  },
  {
    id: "prod-06",
    name: "Court Canvas Sneaker",
    slug: "court-canvas-sneaker",
    shortDescription: "Organic cotton canvas, gum sole, no logos. Sized true to fit.",
    description:
      "The plainest shoe we could make: organic cotton canvas over a vulcanised gum sole, with a cork-and-latex footbed that moulds to your foot.\n\nNo logos, no synthetic lining. Sized true — take your usual.",
    sku: "FL-CRT-WHT-42",
    brand: "Harbour",
    category: categoryRef("footwear"),
    price: 399000,
    salePrice: 299000,
    stock: 7,
    isFeatured: true,
    ratingAverage: 4.3,
    ratingCount: 89,
    images: [
      { url: "/uploads/canvas-sneakers.jpg", alt: "Court Canvas Sneaker", isPrimary: true },
    ],
  },
].map((product) => ({
  ...product,
  effectivePrice: product.salePrice ?? product.price,
  inStock: product.stock > 0,
  seoTitle: undefined,
  seoDescription: product.shortDescription,
  createdAt: "2026-10-02T09:00:00.000Z",
  updatedAt: "2026-11-10T09:00:00.000Z",
}));

const SETTINGS = {
  storeName: "Ecommerce26",
  supportEmail: "care@ecommerce26.example",
  supportPhone: "+91 44 4000 1234",
  address: {
    line1: "12 Pantheon Road",
    line2: "Egmore",
    city: "Chennai",
    state: "Tamil Nadu",
    postalCode: "600008",
    country: "India",
  },
  currency: "INR",
  locale: "en-IN",
  codEnabled: true,
  codMaxAmount: 500000,
};

const CATEGORY_TREE = CATEGORIES.map((category) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  description: category.description,
  image: category.image,
  displayOrder: category.displayOrder,
  productCount: category.productCount,
  children: [],
}));

const FACETS = {
  total: PRODUCTS.length,
  price: {
    min: Math.min(...PRODUCTS.map((product) => product.effectivePrice)),
    max: Math.max(...PRODUCTS.map((product) => product.effectivePrice)),
  },
  ratings: [
    { min: 4, count: 5 },
    { min: 3, count: 6 },
    { min: 2, count: 6 },
    { min: 1, count: 6 },
  ],
  inStock: PRODUCTS.filter((product) => product.inStock).length,
  onSale: PRODUCTS.filter((product) => product.salePrice).length,
  categories: CATEGORIES.map((category) => {
    const members = PRODUCTS.filter((product) => product.category?.slug === category.slug);

    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      count: members.length,
      minPrice: members.length ? Math.min(...members.map((p) => p.effectivePrice)) : 0,
      maxPrice: members.length ? Math.max(...members.map((p) => p.effectivePrice)) : 0,
    };
  }).filter((category) => category.count > 0),
};

/** The envelope every real endpoint uses. */
const ok = (data, meta) => ({ success: true, data, ...(meta ? { meta } : {}) });

const REVIEWS = [
  {
    id: "rev-1",
    productId: "prod-01",
    authorName: "Meera S.",
    rating: 5,
    title: "Softened after one wash",
    body: "Fits well and the linen lost its stiffness after the first wash. Sized up for a looser fit and it was the right call.",
    verifiedPurchase: true,
    createdAt: "2026-10-21T10:00:00.000Z",
  },
  {
    id: "rev-2",
    productId: "prod-01",
    authorName: "Arun K.",
    rating: 4,
    title: "Good, runs slightly short",
    body: "Nice fabric and the collar holds its shape. A little short in the body for a camp collar, so keep that in mind.",
    verifiedPurchase: true,
    createdAt: "2026-10-11T10:00:00.000Z",
  },
];

/** Query-string paging/filtering, matching the public products endpoint's contract. */
function paginate(list, searchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 12)));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    items: list.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

function filterProducts(searchParams) {
  const search = (searchParams.get("search") ?? "").toLowerCase();
  const category = searchParams.get("category");

  return PRODUCTS.filter((product) => {
    if (search && !`${product.name} ${product.brand}`.toLowerCase().includes(search)) {
      return false;
    }

    if (category && product.category?.slug !== category) {
      return false;
    }

    return true;
  });
}

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ico": "image/x-icon",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const send = (status, body, headers = {}) => {
    const payload = JSON.stringify(body);

    response.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    });
    response.end(payload);
  };

  // Cross-origin for the storefront's dev origin and the preview host.
  response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "*");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,x-request-id",
    });
    response.end();

    return;
  }

  // Static images, served from where the real API serves them (`/uploads/<file>`),
  // which is the one path `next.config.ts` allow-lists for `next/image`.
  if (path.startsWith("/uploads/")) {
    const file = join(PUBLIC_DIR, "demo", normalize(path.slice("/uploads/".length)));

    try {
      const bitmap = await readFile(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      });
      response.end(bitmap);
    } catch {
      response.writeHead(404).end();
    }

    return;
  }

  if (_isApiPath(path)) {
    const api = path.replace(/^\/api/, "");

    if (api === "/products/facets") {
      return send(200, ok(FACETS));
    }

    if (api === "/products") {
      const { items, meta } = paginate(filterProducts(url.searchParams), url.searchParams);

      return send(200, ok(items, meta));
    }

    const reviewMatch = api.match(/^\/products\/([^/]+)\/reviews$/);

    if (reviewMatch) {
      const product = PRODUCTS.find(
        (item) => item.slug === decodeURIComponent(reviewMatch[1]) || item.id === reviewMatch[1],
      );

      return send(200, ok(REVIEWS.filter((review) => review.productId === product?.id)));
    }

    const summaryMatch = api.match(/^\/products\/([^/]+)\/reviews\/summary$/);

    if (summaryMatch) {
      const product = PRODUCTS.find(
        (item) => item.slug === decodeURIComponent(summaryMatch[1]) || item.id === summaryMatch[1],
      );

      return send(
        200,
        ok({
          average: product?.ratingAverage ?? 0,
          count: product?.ratingCount ?? 0,
          distribution: [
            { stars: 5, count: 31 },
            { stars: 4, count: 12 },
            { stars: 3, count: 4 },
            { stars: 2, count: 1 },
            { stars: 1, count: 0 },
          ],
        }),
      );
    }

    const productMatch = api.match(/^\/products\/([^/]+)$/);

    if (productMatch) {
      const slug = decodeURIComponent(productMatch[1]);
      const product = PRODUCTS.find((item) => item.slug === slug || item.id === slug);

      return product
        ? send(200, ok(product))
        : send(404, {
            success: false,
            statusCode: 404,
            error: "Not Found",
            message: "Product not found",
          });
    }

    if (api === "/categories") {
      return send(200, ok(CATEGORY_TREE));
    }

    const categoryMatch = api.match(/^\/categories\/([^/]+)$/);

    if (categoryMatch) {
      const slug = decodeURIComponent(categoryMatch[1]);
      const node = CATEGORY_TREE.find((category) => category.slug === slug);

      return node
        ? send(200, ok({ ...node, breadcrumb: [], siblings: [] }))
        : send(404, {
            success: false,
            statusCode: 404,
            error: "Not Found",
            message: "Category not found",
          });
    }

    if (api === "/store/settings") {
      return send(200, ok(SETTINGS));
    }

    if (api === "/offers/active" || api === "/offers") {
      return send(200, ok([]));
    }

    if (api === "/health") {
      return send(200, { status: "ok", demo: true });
    }

    return send(404, {
      success: false,
      statusCode: 404,
      error: "Not Found",
      message: `The demo API does not implement ${api}`,
    });
  }

  send(404, { success: false, message: "Not found" });
});

function _isApiPath(path) {
  return path === "/api" || path.startsWith("/api/");
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Demo storefront API on http://0.0.0.0:${PORT}/api (${PRODUCTS.length} products)`);
});
