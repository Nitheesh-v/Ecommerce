import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPageSkeleton } from "@/components/store/skeletons";
import { LoginForm } from "@/components/store/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Ecommerce26 account.",
};

export default function StoreLoginPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
