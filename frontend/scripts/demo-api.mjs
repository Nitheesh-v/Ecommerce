/**
 * Demo storefront API (preview only — never shipped).
 *
 * The real NestJS API needs MongoDB, which the preview sandbox has no access to.
 * This tiny Node server answers the handful of **public** endpoints the storefront
 * renders from, with fixtures shaped exactly like the real contracts
 * (`frontend/src/types/*`), so the UI can be reviewed end to end.
 *
 * The **guest cart and guest checkout** routes are implemented for real (in memory,
 * per server run), because the whole point of that feature is a journey with no
 * account in it — it cannot be reviewed against static fixtures. They follow the
 * live API's contract exactly (`frontend/src/types/cart.ts`): the cart is addressed
 * by the `x-cart-id` header, and every amount is computed here, never sent by the
 * client. Anything else that would write still returns the real API's 404 envelope,
 * which is also what "not built" should look like.
 *
 * Restarting the server empties every cart. That is the correct behaviour for a
 * demo that owns no database, and it is stated on the cart page it feeds.
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


// ---------------------------------------------------------------- guest carts

/**
 * One cart per owner key (`guest:<token>` or `cart:<userId>`), in memory.
 *
 * The real API keys carts the same way; here the map is all there is, so a restart
 * forgets everything — see the header comment.
 */
const GUEST_CARTS = new Map();
const GUEST_ORDERS = new Map();
let guestOrderSequence = 0;

const MAX_QUANTITY = 10;

const apiError = (statusCode, message) => ({
  success: false,
  statusCode,
  error: statusCode === 400 ? "Bad Request" : statusCode === 401 ? "Unauthorized" : "Not Found",
  message,
});

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

/** The owner key for this request: an `Authorization` header wins, else `x-cart-id`. */
function cartOwner(request) {
  const authorized = Boolean(request.headers.authorization);

  if (authorized) {
    return { key: "cart:demo-customer", authenticated: true };
  }

  const guestId = String(request.headers["x-cart-id"] ?? "").trim();

  if (!/^[A-Za-z0-9_-]{24,64}$/.test(guestId)) {
    return null;
  }

  return { key: `guest:${guestId}`, authenticated: false };
}

function cartFor(owner) {
  if (!GUEST_CARTS.has(owner.key)) {
    GUEST_CARTS.set(owner.key, { lines: [], updatedAt: new Date().toISOString() });
  }

  return GUEST_CARTS.get(owner.key);
}

/**
 * Prices the cart the way the API does: live catalogue prices, tax and shipping from
 * store settings, and nothing trusted from the browser.
 */
function renderCart(owner) {
  const cart = cartFor(owner);
  const items = [];
  let goodsValue = 0;

  for (const line of cart.lines) {
    const product = PRODUCTS.find((item) => item.id === line.productId);

    if (!product) {
      continue;
    }

    const unitPrice = product.effectivePrice;
    const available = product.inStock && product.stock > 0;

    if (available) {
      goodsValue += unitPrice * line.quantity;
    }

    items.push({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      imageUrl: product.images?.[0]?.url ?? null,
      quantity: line.quantity,
      unitPrice,
      listPrice: product.price,
      lineTotal: unitPrice * line.quantity,
      stock: product.stock,
      available,
      unavailableReason: available ? null : "Out of stock",
    });
  }

  const freeShippingThreshold = 149_900;
  const shippingCharge = goodsValue === 0 || goodsValue >= freeShippingThreshold ? 0 : 9_900;
  const taxRatePercent = 5;
  const taxAmount = Math.round(goodsValue * (taxRatePercent / 100));

  return {
    items,
    totals: {
      itemCount: items.reduce((sum, item) => sum + (item.available ? item.quantity : 0), 0),
      subtotal: items.reduce((sum, item) => sum + item.listPrice * item.quantity, 0),
      goodsValue,
      discountTotal: items.reduce(
        (sum, item) => sum + (item.listPrice - item.unitPrice) * item.quantity,
        0,
      ),
      couponDiscount: 0,
      shippingCharge,
      taxAmount,
      taxRatePercent,
      total: goodsValue + shippingCharge + taxAmount,
      currency: "INR",
      freeShippingThreshold,
      freeShippingGap: Math.max(0, freeShippingThreshold - goodsValue),
    },
    coupon: null,
    couponIssue: null,
    unavailableCount: items.filter((item) => !item.available).length,
    updatedAt: cart.lines.length ? cart.updatedAt : null,
  };
}

function addToCart(owner, productId, quantity) {
  const product = PRODUCTS.find((item) => item.id === productId);

  if (!product) {
    return { error: "Product not found" };
  }

  if (!product.inStock || product.stock <= 0) {
    return { error: `${product.name} is out of stock` };
  }

  const cart = cartFor(owner);
  const existing = cart.lines.find((line) => line.productId === productId);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const capped = Math.min(wanted, product.stock, MAX_QUANTITY);

  if (capped < 1) {
    return { error: "That quantity is not available" };
  }

  if (existing) {
    existing.quantity = capped;
  } else {
    cart.lines.push({ productId, quantity: capped });
  }

  cart.updatedAt = new Date().toISOString();

  return { cart: renderCart(owner) };
}

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

    // ------------------------------------------------------------ guest cart

    if (api === "/cart" || api.startsWith("/cart/")) {
      const owner = cartOwner(request);

      if (!owner) {
        // The real guard's answer: neither a token nor a well-formed guest id.
        return send(401, apiError(401, "Sign in or send an x-cart-id header"));
      }

      if (request.method === "GET" && api === "/cart") {
        return send(200, ok(renderCart(owner)));
      }

      if (request.method === "DELETE" && api === "/cart") {
        cartFor(owner).lines = [];

        return send(200, ok(renderCart(owner)));
      }

      if (request.method === "POST" && api === "/cart/items") {
        const body = await readBody(request);
        const quantity = Number(body.quantity ?? 1);

        if (!Number.isInteger(quantity) || quantity < 1) {
          return send(400, apiError(400, "quantity must be a positive integer"));
        }

        const result = addToCart(owner, body.productId, quantity);

        return result.error
          ? send(400, apiError(400, result.error))
          : send(200, ok(result.cart));
      }

      const itemMatch = api.match(/^\/cart\/items\/([^/]+)$/);

      if (itemMatch) {
        const productId = decodeURIComponent(itemMatch[1]);
        const cart = cartFor(owner);
        const line = cart.lines.find((entry) => entry.productId === productId);

        if (!line) {
          return send(404, apiError(404, "That item is not in the cart"));
        }

        if (request.method === "DELETE") {
          cart.lines = cart.lines.filter((entry) => entry.productId !== productId);
          cart.updatedAt = new Date().toISOString();

          return send(200, ok(renderCart(owner)));
        }

        if (request.method === "PATCH") {
          const body = await readBody(request);
          const quantity = Number(body.quantity);

          if (!Number.isInteger(quantity) || quantity < 1) {
            return send(400, apiError(400, "quantity must be a positive integer"));
          }

          const product = PRODUCTS.find((item) => item.id === productId);
          const capped = Math.min(quantity, product?.stock ?? quantity, MAX_QUANTITY);

          line.quantity = capped;
          cart.updatedAt = new Date().toISOString();

          return send(200, ok(renderCart(owner)));
        }
      }

      if (request.method === "POST" && api === "/cart/merge") {
        // Nothing is merged here (there is only ever one demo account), but the
        // guest cart it points at is retired exactly like the real one.
        const body = await readBody(request);
        const guestId = String(body.guestCartId ?? "").trim();

        GUEST_CARTS.delete(`guest:${guestId}`);

        return send(200, ok(renderCart(owner)));
      }

      if (request.method === "POST" && api === "/cart/coupon") {
        // Coupons need the coupon module; the real API validates them. Say so plainly
        // instead of pretending the code applied.
        return send(400, apiError(400, "Coupons are not available in the demo"));
      }

      return send(404, apiError(404, `The demo API does not implement ${request.method} ${api}`));
    }

    // -------------------------------------------------------- guest checkout

    if (api === "/checkout/preview" || api === "/checkout/place") {
      const owner = cartOwner(request);

      if (!owner) {
        return send(401, apiError(401, "Sign in or send an x-cart-id header"));
      }

      const body = await readBody(request);
      const cart = renderCart(owner);

      if (cart.items.length === 0) {
        return send(400, apiError(400, "Your cart is empty"));
      }

      const guest = body.guestAddress;

      if (!guest) {
        return send(
          400,
          apiError(400, "This demo only checks out guest orders — fill in the delivery details"),
        );
      }

      const missing = ["recipientName", "phone", "line1", "city", "state", "postalCode"].filter(
        (field) => !String(guest[field] ?? "").trim(),
      );

      if (missing.length > 0) {
        return send(400, apiError(400, `Address is missing: ${missing.join(", ")}`));
      }

      const paymentMethod = body.paymentMethod === "cod" ? "cod" : "online";
      const address = {
        id: "guest-address",
        label: "Delivery",
        recipientName: guest.recipientName,
        phone: guest.phone,
        line1: guest.line1,
        line2: guest.line2 ?? null,
        city: guest.city,
        state: guest.state,
        postalCode: guest.postalCode,
        country: guest.country ?? "India",
      };
      const paymentOptions = {
        codAvailable: Boolean(SETTINGS.codEnabled),
        codMaxAmount: SETTINGS.codMaxAmount ?? 0,
        onlineAvailable: false,
        currency: SETTINGS.currency ?? "INR",
      };
      const estimatedDelivery = new Date(Date.now() + 4 * 86_400_000).toISOString();

      if (api === "/checkout/preview") {
        return send(
          200,
          ok({
            items: cart.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              slug: item.slug,
              sku: item.sku,
              imageUrl: item.imageUrl,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              listPrice: item.listPrice,
              lineTotal: item.lineTotal,
            })),
            totals: cart.totals,
            coupon: null,
            address,
            paymentMethod,
            paymentOptions,
            shippingMethod: "standard",
            estimatedDelivery,
          }),
        );
      }

      if (!String(body.guestEmail ?? "").trim()) {
        return send(400, apiError(400, "An email is needed for the confirmation"));
      }

      guestOrderSequence += 1;

      const orderId = `demo-order-${guestOrderSequence}`;
      const orderNumber = `ORD-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}-${String(guestOrderSequence).padStart(4, "0")}`;

      GUEST_ORDERS.set(orderId, {
        id: orderId,
        orderNumber,
        customerName: address.recipientName,
        customerEmail: String(body.guestEmail).trim(),
        items: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          slug: item.slug,
          sku: item.sku,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: cart.totals.subtotal,
        discountTotal: cart.totals.discountTotal,
        couponCode: null,
        couponDiscount: 0,
        shippingCharge: cart.totals.shippingCharge,
        taxAmount: cart.totals.taxAmount,
        taxRatePercent: cart.totals.taxRatePercent,
        total: cart.totals.total,
        currency: cart.totals.currency,
        shippingAddress: {
          recipientName: address.recipientName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        },
        shippingMethod: "standard",
        paymentMethod: paymentMethod === "cod" ? "cod" : "manual",
        paymentStatus: "pending",
        status: "pending",
        payment: { method: paymentMethod, paidAmount: 0, refunds: [] },
        returns: [],
        itemCount: cart.totals.itemCount,
        refundedAmount: 0,
        pendingRefundAmount: 0,
        balanceDue: cart.totals.total,
        allowedNextStatuses: [],
        canCancel: true,
        canRequestReturn: false,
        activeReturn: null,
        history: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // The real checkout clears the cart in the same operation as the order.
      cartFor(owner).lines = [];

      return send(
        201,
        ok({
          orderId,
          orderNumber,
          paymentMethod,
          status: "pending",
          paymentStatus: "pending",
          requiresPayment: false,
          paymentUrl: `/checkout/success?orderId=${orderId}`,
          totals: {
            subtotal: cart.totals.subtotal,
            couponDiscount: 0,
            discountTotal: cart.totals.discountTotal,
            taxAmount: cart.totals.taxAmount,
            shippingCharge: cart.totals.shippingCharge,
            total: cart.totals.total,
            currency: cart.totals.currency,
          },
          payment: null,
          created: true,
        }),
      );
    }

    if (api === "/orders/guest") {
      const orderNumber = url.searchParams.get("orderNumber") ?? "";
      const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
      const order = [...GUEST_ORDERS.values()].find(
        (entry) =>
          entry.orderNumber === orderNumber && entry.customerEmail.toLowerCase() === email,
      );

      return order
        ? send(200, ok(order))
        : send(404, apiError(404, "Order not found"));
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
