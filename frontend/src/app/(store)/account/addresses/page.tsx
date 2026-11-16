// src/app/(store)/account/addresses/page.tsx

import type { Metadata } from "next";
import { AddressBook } from "@/components/store/account/address-book";
import { RequireCustomer } from "@/components/store/account/require-customer";

export const metadata: Metadata = {
  title: "Address book",
  description: "The delivery addresses saved to your Ecommerce26 account.",
  robots: { index: false, follow: false },
};

/** Signed-in only; the book is read in the browser with the session token. */
export default function AddressesPage() {
  return (
    <RequireCustomer>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="font-display text-2xl text-bark-950">Address book</h1>
          <p className="mt-1 text-sm text-bark-600">
            Saved addresses fill in at checkout. The API decides which one is the default —
            the first address you save takes that role.
          </p>
        </div>
        <AddressBook />
      </div>
    </RequireCustomer>
  );
}
