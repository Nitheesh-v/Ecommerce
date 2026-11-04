"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ChartLine,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/admin/ui/button";
import { Field, Input } from "@/components/admin/ui/input";
import { useAuthStore } from "@/store/auth.store";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

/** Only same-console redirects, never an absolute URL (open-redirect guard). */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/admin") || raw.startsWith("/admin/login")) {
    return "/admin/dashboard";
  }

  return raw;
}

const HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Role-guarded API",
    description: "Every admin request is re-checked by the server, not the UI.",
  },
  {
    icon: ChartLine,
    title: "Live analytics",
    description: "Dashboard metrics aggregate straight from your store data.",
  },
  {
    icon: Store,
    title: "One console",
    description: "Catalog, orders, customers and payments in a single place.",
  },
];

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [showPassword, setShowPassword] = useState(false);

  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const error = useAuthStore((state) => state.error);
  const login = useAuthStore((state) => state.login);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const clearError = useAuthStore((state) => state.clearError);
  const logout = useAuthStore((state) => state.logout);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // A returning admin reloads here with only the refresh cookie: restore and go.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "admin") {
      router.replace(nextPath);
    }
  }, [status, user, nextPath, router]);

  const onSubmit = handleSubmit(async (values) => {
    clearError();
    const signedIn = await login(values);

    if (signedIn?.role === "admin") {
      router.replace(nextPath);
    }
  });

  const isCustomerSession = status === "authenticated" && user?.role !== "admin";
  const pending = isSubmitting || status === "loading";

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-slate-900 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Ecommerce26</p>
            <p className="text-xs text-slate-400">Admin console</p>
          </div>
        </div>

        <div className="max-w-sm">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            Run your store from one place.
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            Orders, inventory, customers and revenue — measured from the same
            database your storefront writes to.
          </p>

          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-indigo-300">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="text-xs text-slate-400">{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          Single-vendor store · Authorized staff only
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Store className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Ecommerce26</p>
              <p className="text-xs text-slate-500">Admin console</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Use an administrator account to open the console.
          </p>

          {isCustomerSession ? (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
            >
              <p>
                You are signed in as a customer ({user?.email}). Admin routes
                require an administrator account.
              </p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-2 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
              >
                Sign out and switch account
              </button>
            </div>
          ) : null}

          {error && !isCustomerSession ? (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <Field
                  label="Email"
                  htmlFor="admin-email"
                  error={errors.email?.message}
                >
                  <Input
                    {...field}
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    placeholder="admin@example.com"
                    invalid={Boolean(errors.email)}
                    disabled={pending}
                  />
                </Field>
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <Field
                  label="Password"
                  htmlFor="admin-password"
                  error={errors.password?.message}
                >
                  <div className="relative">
                    <Input
                      {...field}
                      id="admin-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pr-10"
                      invalid={Boolean(errors.password)}
                      disabled={pending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </Field>
              )}
            />

            <Button type="submit" className="w-full" loading={pending}>
              {pending ? "Signing in…" : "Sign in to console"}
            </Button>
          </form>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Sessions use short-lived tokens with HttpOnly refresh cookies.
          </p>

          <div className="mt-8 flex items-center gap-4 border-t border-slate-200 pt-5 text-xs text-slate-500">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to store
            </Link>
            {status === "idle" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Checking for an existing session…
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
