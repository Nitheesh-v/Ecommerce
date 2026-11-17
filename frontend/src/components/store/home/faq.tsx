// src/components/store/home/faq.tsx

import Link from "next/link";
import { Minus, Plus } from "lucide-react";

/**
 * Answers that follow from how the store is actually built.
 *
 * Native `<details>`: it opens without JavaScript, is keyboard operable, and is
 * announced correctly by screen readers. The plus/minus swap is pure CSS.
 */
export function Faq({
  codEnabled,
  supportEmail,
}: {
  codEnabled: boolean;
  supportEmail?: string;
}) {
  const items = [
    {
      question: "How is my total calculated?",
      answer:
        "The API totals every order: line prices come from the catalogue, offers and coupons are validated server-side, and tax and shipping are added by the store's own settings. The browser never does the arithmetic, so the number in your cart is the number you pay.",
    },
    {
      question: "Can I pay when the order arrives?",
      answer: codEnabled
        ? "Yes. Cash on delivery is enabled for this store and is offered at checkout on eligible orders; the cap and availability are decided by the store, not hidden in the interface."
        : "Cash on delivery is currently switched off. Online payment is taken at checkout and the order timeline records every status change.",
    },
    {
      question: "Where is my order?",
      answer:
        "Every order has a timeline in your account, from placement through payment, packing and dispatch to delivery. The same events that update the timeline also send your notifications.",
    },
    {
      question: "What can I do if something is wrong?",
      answer:
        "Open the order in your account and use the return option — each step is tracked, and refunds are recorded against the original payment. If you would rather talk to someone, the store's support details are in the footer.",
    },
    {
      question: "Are the reviews real?",
      answer:
        "Only a customer whose order was delivered can rate a product, and the rating you see is the mean of approved reviews — never imported, never seeded.",
    },
  ];

  return (
    <section className="reveal grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
      <div>
        <p className="text-[10px] font-medium tracking-[0.24em] text-bark-500 uppercase">
          Good to know
        </p>
        <h2 className="font-display mt-2 text-3xl leading-[1.1] text-bark-950 sm:text-[34px]">
          Questions,
          <br />
          answered plainly.
        </h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-bark-600">
          {supportEmail
            ? `Still unsure? Write to ${supportEmail} and a person will answer.`
            : "Still unsure? The store's support details are in the footer."}
        </p>
        <Link
          href="/offers"
          className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-bark-900 underline decoration-bark-300 underline-offset-4 hover:decoration-bark-900"
        >
          See current offers
        </Link>
      </div>

      <div className="divide-y divide-cream-300 border-y border-cream-300">
        {items.map(({ question, answer }) => (
          <details key={question} className="group px-1 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium text-bark-950">
                {question}
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cream-400 text-bark-600 transition-colors group-open:border-bark-900 group-open:bg-bark-900 group-open:text-cream-50">
                <Plus className="h-3.5 w-3.5 group-open:hidden" aria-hidden />
                <Minus
                  className="hidden h-3.5 w-3.5 group-open:block"
                  aria-hidden
                />
              </span>
            </summary>
            <p className="mt-2.5 max-w-prose pr-10 text-[13px] leading-relaxed text-bark-600">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
