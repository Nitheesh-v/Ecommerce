import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/store/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Ecommerce26 account.",
};

export default function StoreLoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-md animate-pulse rounded-2xl bg-white" />}>
      <LoginForm />
    </Suspense>
  );
}
