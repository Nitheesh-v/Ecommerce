import { FolderTree } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { resolveImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { CategoryImage, CategoryStatus } from "@/types/category";

/** Thumbnail for the table and detail view: image when present, initial otherwise. */
export function CategoryAvatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image: CategoryImage | null;
  size?: "sm" | "md" | "lg";
}) {
  const src = resolveImageUrl(image?.url);
  const dimensions = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-20 w-20 text-xl",
  }[size];

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-500",
        dimensions,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : name ? (
        name.trim().charAt(0).toUpperCase()
      ) : (
        <FolderTree className="h-4 w-4 text-slate-300" aria-hidden />
      )}
    </span>
  );
}

export function CategoryStatusBadge({ status }: { status: CategoryStatus }) {
  return (
    <Badge tone={status === "active" ? "success" : "neutral"}>
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );
}
