import {
  BarChart3,
  Bell,
  Boxes,
  CreditCard,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Tags,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * `false` while the module's backend + page do not exist yet. Rendered as a
   * non-clickable row with a "Soon" hint instead of a link that would 404.
   */
  available: boolean;
}

export interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin/dashboard",
        icon: LayoutDashboard,
        available: true,
      },
    ],
  },
  {
    label: "Catalog",
    items: [
      {
        label: "Products",
        href: "/admin/products",
        icon: Package,
        available: true,
      },
      {
        label: "Categories",
        href: "/admin/categories",
        icon: Tags,
        available: true,
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        icon: Boxes,
        available: true,
      },
    ],
  },
  {
    label: "Sales",
    items: [
      {
        label: "Orders",
        href: "/admin/orders",
        icon: ShoppingCart,
        available: true,
      },
      {
        label: "Payments",
        href: "/admin/payments",
        icon: CreditCard,
        available: false,
      },
      {
        label: "Coupons",
        href: "/admin/coupons",
        icon: TicketPercent,
        available: false,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Customers",
        href: "/admin/customers",
        icon: Users,
        available: false,
      },
      {
        label: "Reviews",
        href: "/admin/reviews",
        icon: Star,
        available: false,
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        label: "Reports",
        href: "/admin/reports",
        icon: BarChart3,
        available: false,
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Notifications",
        href: "/admin/notifications",
        icon: Bell,
        available: false,
      },
      {
        label: "Settings",
        href: "/admin/settings",
        icon: Settings,
        available: false,
      },
    ],
  },
];

const FALLBACK_LABELS: Record<string, string> = {
  admin: "Admin",
  dashboard: "Dashboard",
  products: "Products",
  categories: "Categories",
  inventory: "Inventory",
  orders: "Orders",
  payments: "Payments",
  coupons: "Coupons",
  customers: "Customers",
  reviews: "Reviews",
  reports: "Reports",
  notifications: "Notifications",
  settings: "Settings",
  new: "New",
  invoice: "Invoice",
  create: "New",
  edit: "Edit",
};

/** A Mongo ObjectId in a URL is a record, not a page name. */
const OBJECT_ID_SEGMENT = /^[0-9a-f]{24}$/i;

function segmentLabel(segment: string) {
  // A record id is never a page name; the page's own title identifies it.
  if (OBJECT_ID_SEGMENT.test(segment)) {
    return "Details";
  }

  return (
    FALLBACK_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

export interface Breadcrumb {
  label: string;
  href: string;
  isCurrent: boolean;
}

/** `/admin/products/new` → Admin / Products / New */
export function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: Breadcrumb[] = [];

  segments.forEach((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;

    breadcrumbs.push({
      label: segmentLabel(segment),
      href,
      isCurrent: index === segments.length - 1,
    });
  });

  return breadcrumbs;
}

/** Page title = label of the last segment, or "Dashboard" at `/admin`. */
export function titleForPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments.at(-1);

  if (!last || last === "admin") {
    return "Dashboard";
  }

  return segmentLabel(last);
}
