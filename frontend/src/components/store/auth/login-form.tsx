"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/admin/ui/button";
import { Field, Input } from "@/components/admin/ui/input";
import { useCustomerAuthStore } from "@/store/customer-auth.store";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type Values = z.infer<typeof schema>;

/** Only same-site paths, never an absolute URL (open-redirect guard). */
export function safeNextPath(raw: string | null, fallback = "/account"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/api")) {
    return fallback;
  }

  return raw;
}

/**
 * Shopper sign-in.
 *
 * The token is kept in memory by the session module (see `lib/api/session.ts`); a
 * reload is recovered from the HttpOnly refresh cookie, so nothing sensitive is
 * ever written to storage by this page.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [showPassword, setShowPassword] = useState(false);

  const status = useCustomerAuthStore((state) => state.status);
  const user = useCustomerAuthStore((state) => state.user);
  const error = useCustomerAuthStore((state) => state.error);
  const login = useCustomerAuthStore((state) => state.login);
  const clearError = useCustomerAuthStore((state) => state.clearError);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (user && status === "authenticated") {
      router.replace(next);
    }
  }, [next, router, status, user]);

  const submit = handleSubmit(async (values) => {
    const signedIn = await login(values);

    if (signedIn) {
      router.replace(next);
    }
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your orders, keep your addresses and check out faster.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {error}
            </div>
          ) : null}

          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              invalid={Boolean(errors.email)}
              {...register("email")}
            />
          </Field>

          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                invalid={Boolean(errors.password)}
                className="pr-11"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </Field>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          New here?{" "}
          <Link
            href={`/register?next=${encodeURIComponent(next)}`}
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            Create an account
          </Link>
        </p>

        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Your password is never stored in the browser; the session lives in an
          HttpOnly cookie.
        </p>
      </div>
    </div>
  );
}
