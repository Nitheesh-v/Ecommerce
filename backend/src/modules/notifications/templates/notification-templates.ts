// src/modules/notifications/templates/notification-templates.ts
import type {
  NotificationAudience,
  NotificationCategory,
  NotificationData,
  NotificationType,
} from '../schemas/notification.schema.js';

/**
 * Everything a template may read.
 *
 * Templates are pure functions of this input: no database, no clock, no
 * `SettingsService`. That makes every message in the storefront and in the inbox
 * reproducible from a stored row — which is exactly what the admin console shows
 * when an operator opens one.
 */
export interface TemplateInput {
  type: NotificationType;
  audience: NotificationAudience;
  data: NotificationData;
  storeName: string;
  /** Absolute storefront origin (from `FRONTEND_URL`), used for email links. */
  storeUrl: string;
  supportEmail: string;
  recipientName?: string | null;
}

export interface RenderedNotification {
  category: NotificationCategory;
  title: string;
  /** One or two sentences, shown in the in-app feed and as the email's opening line. */
  body: string;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
  /** Relative app path, or `null` when the message has nowhere to go. */
  link: string | null;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes interpolated values; nothing a customer typed may become markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * Formats integer minor units for display.
 *
 * Money is stored in paise (and formatted only here), exactly like the API: a
 * template that multiplied by 100 again would produce a hundred-fold invoice.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const amountMajor = minorUnits / 100;
  const code = /^[A-Z]{3}$/.test(currency) ? currency : 'INR';

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amountMajor);
  } catch {
    return `${code} ${amountMajor.toFixed(2)}`;
  }
}

const text = (value: NotificationData[string], fallback = ''): string => {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
};

const money = (value: NotificationData[string], currency: NotificationData[string]): string =>
  formatMoney(typeof value === 'number' ? value : Number(value ?? 0), text(currency, 'INR'));

const orderLink = (data: NotificationData, audience: NotificationAudience): string | null => {
  const orderId = text(data.orderId);

  if (!orderId) {
    return null;
  }

  return audience === 'admin' ? `/admin/orders/${orderId}` : `/account/orders/${orderId}`;
};

const trackingLink = (data: NotificationData): string | null => {
  const orderId = text(data.orderId);

  return orderId ? `/account/orders/${orderId}/tracking` : null;
};

interface Message {
  category: NotificationCategory;
  title: string;
  body: string;
  subject: string;
  link: string | null;
  lines: string[];
}

/** The copy for one notification type, before the shared HTML shell wraps it. */
function compose(input: TemplateInput): Message {
  const { type, data, audience } = input;
  const orderNumber = text(data.orderNumber, 'your order');
  const order = orderLink(data, audience);

  switch (type) {
    case 'order_placed': {
      const total = money(data.total, data.currency);

      return audience === 'admin'
        ? {
            category: 'order',
            title: `New order ${orderNumber}`,
            body: `${text(data.customerName, 'A customer')} placed ${orderNumber} for ${total}.`,
            subject: `New order ${orderNumber} — ${total}`,
            link: order,
            lines: [
              `${text(data.customerName, 'A customer')} placed order ${orderNumber}.`,
              `Items: ${text(data.itemCount, '0')} · Total: ${total}`,
              `Payment: ${text(data.paymentMethod, 'unknown')}`,
            ],
          }
        : {
            category: 'order',
            title: `Order ${orderNumber} received`,
            body: `We have your order for ${total}. We will email you again as soon as it ships.`,
            subject: `Order ${orderNumber} received — ${total}`,
            link: order,
            lines: [
              `Thanks for your order ${orderNumber}.`,
              `Items: ${text(data.itemCount, '0')} · Total: ${total}`,
              `Payment method: ${text(data.paymentMethod, 'unknown')}`,
            ],
          };
    }

    case 'order_confirmed':
      return {
        category: 'order',
        title: `Order ${orderNumber} confirmed`,
        body:
          text(data.paymentMethod) === 'cod'
            ? 'We are preparing your order. Please keep the exact amount ready for delivery.'
            : 'Your payment is confirmed and we are preparing your order.',
        subject: `Order ${orderNumber} confirmed`,
        link: order,
        lines: [
          `Order ${orderNumber} is confirmed.`,
          `Total: ${money(data.total, data.currency)}`,
          `Estimated delivery: ${text(data.estimatedDelivery, 'we will confirm shortly')}`,
        ],
      };

    case 'order_shipped':
      return {
        category: 'shipping',
        title: `Order ${orderNumber} has shipped`,
        body: `Your parcel is on its way with ${text(data.courier, 'our courier partner')}.`,
        subject: `Order ${orderNumber} has shipped`,
        link: trackingLink(data) ?? order,
        lines: [
          `Order ${orderNumber} has shipped.`,
          `Courier: ${text(data.courier, 'to be assigned')}`,
          `Tracking number: ${text(data.trackingNumber, 'available shortly')}`,
          `Estimated delivery: ${text(data.estimatedDelivery, 'we will confirm shortly')}`,
        ],
      };

    case 'order_out_for_delivery':
      return {
        category: 'shipping',
        title: `Order ${orderNumber} is out for delivery`,
        body: 'Your parcel is with the delivery agent and should arrive today.',
        subject: `Order ${orderNumber} is out for delivery`,
        link: trackingLink(data) ?? order,
        lines: [`Order ${orderNumber} is out for delivery today.`],
      };

    case 'order_delivered':
      return {
        category: 'shipping',
        title: `Order ${orderNumber} delivered`,
        body: 'Your parcel was delivered. We would love to hear what you think of it.',
        subject: `Order ${orderNumber} delivered`,
        link: order,
        lines: [
          `Order ${orderNumber} was delivered.`,
          'You can review what you bought from your order page once the return window opens.',
        ],
      };

    case 'order_cancelled':
      return {
        category: 'order',
        title: `Order ${orderNumber} cancelled`,
        body: text(data.reason)
          ? `The order was cancelled: ${text(data.reason)}`
          : 'The order was cancelled. Any payment made will be refunded to the original method.',
        subject: `Order ${orderNumber} cancelled`,
        link: order,
        lines: [
          `Order ${orderNumber} has been cancelled.`,
          text(data.reason) ? `Reason: ${text(data.reason)}` : 'No reason was recorded.',
          'If money was captured, the refund is issued to the original payment method.',
        ],
      };

    case 'payment_failed':
      return {
        category: 'payment',
        title: `Payment failed for ${orderNumber}`,
        body: text(data.reason)
          ? `The payment did not go through: ${text(data.reason)}. Your order is saved.`
          : 'The payment did not go through. Your order is saved.',
        subject: `Payment failed — ${orderNumber}`,
        link: order,
        lines: [
          `We could not confirm the payment for order ${orderNumber}.`,
          text(data.reason) ? `Reason: ${text(data.reason)}` : 'No reason was reported.',
          'Your order is still saved — you can retry the payment from your orders page.',
        ],
      };

    case 'refund_processed':
      return {
        category: 'payment',
        title: `Refund issued for ${orderNumber}`,
        body: `${money(data.amount, data.currency)} has been refunded to your original payment method.`,
        subject: `Refund issued — ${orderNumber}`,
        link: order,
        lines: [
          `A refund of ${money(data.amount, data.currency)} was issued for order ${orderNumber}.`,
          text(data.reference) ? `Reference: ${text(data.reference)}` : '',
          'Depending on your bank, it can take 5–7 working days to appear.',
        ].filter(Boolean),
      };

    case 'delivery_failed':
      return {
        category: 'shipping',
        title: `Delivery attempt failed for ${orderNumber}`,
        body: text(data.reason)
          ? `We could not deliver your parcel: ${text(data.reason)}. We will try again.`
          : 'We could not deliver your parcel today. We will try again.',
        subject: `Delivery attempt failed — ${orderNumber}`,
        link: trackingLink(data) ?? order,
        lines: [
          `The delivery attempt for order ${orderNumber} failed.`,
          text(data.reason) ? `Reason: ${text(data.reason)}` : '',
          'The courier will re-attempt; you can also check the tracking page for the latest status.',
        ].filter(Boolean),
      };

    case 'inventory_low':
    case 'inventory_out': {
      const outOfStock = type === 'inventory_out';

      return {
        category: 'inventory',
        title: outOfStock
          ? `${text(data.productName, 'A product')} is out of stock`
          : `${text(data.productName, 'A product')} is running low`,
        body: outOfStock
          ? `${text(data.productName)} (${text(data.sku)}) has no stock left.`
          : `${text(data.productName)} (${text(data.sku)}) has ${text(data.quantity, '0')} left.`,
        subject: outOfStock
          ? `Out of stock: ${text(data.productName)} (${text(data.sku)})`
          : `Low stock: ${text(data.productName)} (${text(data.sku)})`,
        link: '/admin/inventory',
        lines: [
          outOfStock
            ? `${text(data.productName)} (${text(data.sku)}) is out of stock.`
            : `${text(data.productName)} (${text(data.sku)}) has ${text(data.quantity, '0')} units left.`,
          `Alert threshold: ${text(data.lowStockThreshold, '0')}`,
          'Restock from the inventory console.',
        ],
      };
    }

    case 'review_submitted':
      return {
        category: 'review',
        title: `New review awaiting moderation`,
        body: `${text(data.customerName, 'A customer')} reviewed ${text(data.productName, 'a product')} (${text(data.rating, '0')}★).`,
        subject: `New review for ${text(data.productName, 'a product')}`,
        link: '/admin/reviews',
        lines: [
          `${text(data.customerName, 'A customer')} left a ${text(data.rating, '0')}★ review for ${text(data.productName, 'a product')}.`,
          text(data.comment) ? `“${text(data.comment)}”` : '',
          'Nothing appears on the storefront until it is approved.',
        ].filter(Boolean),
      };

    case 'welcome':
      return {
        category: 'account',
        title: `Welcome to ${input.storeName}`,
        body: 'Your account is ready. Browse the catalogue and track every order from your account page.',
        subject: `Welcome to ${input.storeName}`,
        link: '/products',
        lines: [
          `Thanks for creating an account at ${input.storeName}.`,
          'Your orders, addresses and notifications all live under your account.',
        ],
      };

    default: {
      // Exhaustiveness guard: a new type without copy is a compile error, not a blank email.
      const unreachable: never = type;

      return {
        category: 'account',
        title: 'Notification',
        body: String(unreachable),
        subject: 'Notification',
        link: null,
        lines: [],
      };
    }
  }
}

/**
 * The one HTML shell every message shares.
 *
 * Inline styles only: email clients strip `<style>` blocks and know nothing about
 * your design system. No images, no tracking pixels, no scripts.
 */
function renderHtml(input: TemplateInput, message: Message): string {
  const link = message.link ? `${input.storeUrl}${message.link}` : input.storeUrl;
  const greeting = input.recipientName?.trim()
    ? `Hi ${escapeHtml(input.recipientName.trim())},`
    : 'Hello,';
  const paragraphs = message.lines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(line)}</p>`,
    )
    .join('');

  return [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;',
    'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;',
    'background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">',
    '<tr><td style="padding:24px 24px 8px;">',
    `<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(input.storeName)}</p>`,
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${escapeHtml(message.title)}</h1>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(greeting)}</p>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(message.body)}</p>`,
    paragraphs,
    `<p style="margin:20px 0 24px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;`,
    'background:#2563eb;color:#ffffff;border-radius:8px;font-size:14px;text-decoration:none;">Open in store</a></p>',
    '</td></tr>',
    '<tr><td style="padding:16px 24px 24px;border-top:1px solid #e2e8f0;">',
    `<p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">You are receiving this because you have an account at `,
    `${escapeHtml(input.storeName)}. Questions? Reply to ${escapeHtml(input.supportEmail)}.</p>`,
    '</td></tr></table></body></html>',
  ].join('');
}

/**
 * Builds the in-app and email copy for one notification.
 *
 * The in-app text and the email come from the same `Message`, so the feed and the
 * inbox can never disagree about what happened.
 */
export function renderNotification(input: TemplateInput): RenderedNotification {
  const message = compose(input);
  const greeting = input.recipientName?.trim()
    ? `Hi ${input.recipientName.trim()},`
    : 'Hello,';
  const emailText = [greeting, '', message.body, '', ...message.lines, '', `— ${input.storeName}`]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return {
    category: message.category,
    title: message.title,
    body: message.body,
    emailSubject: message.subject,
    emailText,
    emailHtml: renderHtml(input, message),
    link: message.link,
  };
}
