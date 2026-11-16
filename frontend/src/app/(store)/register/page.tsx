import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageSkeleton } from "@/components/store/skeletons";
import { RegisterForm } from "@/components/store/auth/register-form";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an Ecommerce26 account to track orders and check out faster.",
};

export default function StoreRegisterPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
      <RegisterForm />
    </Suspense>
  );
}
