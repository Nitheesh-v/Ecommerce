import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/auth/admin-login-form";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Loading sign in…
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
