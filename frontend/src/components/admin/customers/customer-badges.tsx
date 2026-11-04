import { Badge } from "@/components/admin/ui/badge";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/types/customer";

const STATUS_TONES: Record<CustomerStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  suspended: "warning",
  deactivated: "neutral",
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{CUSTOMER_STATUS_LABELS[status]}</Badge>;
}

/** Initials avatar — customers have no uploaded image yet, so this stays honest. */
export function CustomerAvatar({
  name,
  imageUrl,
  size = "md",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dimensions =
    size === "lg" ? "h-14 w-14 text-base" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (imageUrl) {
    return (
      // avatars may be served from any configured origin
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`${dimensions} shrink-0 rounded-full border border-slate-200 object-cover`}
      />
    );
  }

  return (
    <span
      className={`${dimensions} flex shrink-0 items-center justify-center rounded-full bg-slate-900 font-semibold text-white`}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
