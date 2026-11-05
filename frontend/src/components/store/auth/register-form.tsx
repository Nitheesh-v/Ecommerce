"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/admin/ui/button";
import { Field, Input } from "@/components/admin/ui/input";
import { useCustomerAuthStore } from "@/store/customer-auth.store";
import { safeNextPath } from "./login-form";

const schema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().max(80).optional(),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .regex(/^[\d+\-\s()]{6,20}$/, "Enter a phone number with 6–20 digits")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type Values = z.infer<typeof schema>;

/**
 * Storefront sign-up.
 *
 * The API signs the new account in immediately, so the customer lands back where
 * they were headed (checkout, a product, their account) instead of a dead end.
 */
export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const status = useCustomerAuthStore((state) => state.status);
  const user = useCustomerAuthStore((state) => state.user);
  const error = useCustomerAuthStore((state) => state.error);
  const registerUser = useCustomerAuthStore((state) => state.register);
  const clearError = useCustomerAuthStore((state) => state.clearError);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (user && status === "authenticated") {
      router.replace(next);
    }
  }, [next, router, status, user]);

  const submit = handleSubmit(async (values) => {
    const created = await registerUser({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
    });

    if (created) {
      router.replace(next);
    }
  });

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          One account for orders, reviews and support.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
              <Input
                id="firstName"
                autoComplete="given-name"
                invalid={Boolean(errors.firstName)}
                {...register("firstName")}
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
              <Input id="lastName" autoComplete="family-name" {...register("lastName")} />
            </Field>
          </div>

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

          <Field
            label="Phone"
            htmlFor="phone"
            hint="Optional — used for delivery questions only."
            error={errors.phone?.message}
          >
            <Input
              id="phone"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Password"
              htmlFor="password"
              hint="8+ characters, a letter and a number."
              error={errors.password?.message}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.password)}
                {...register("password")}
              />
            </Field>
            <Field
              label="Confirm password"
              htmlFor="confirmPassword"
              error={errors.confirmPassword?.message}
            >
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
            </Field>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-slate-900 underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>

        <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          We store a bcrypt hash of your password — never the password itself.
        </p>
      </div>
    </div>
  );
}
