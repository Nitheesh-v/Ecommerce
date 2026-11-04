import { Card, CardBody, CardHeader } from "@/components/admin/ui/card";
import { Skeleton } from "@/components/admin/ui/states";

/** Placeholder while the product/categories are being fetched. */
export function ProductFormSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        {[0, 1].map((card) => (
          <Card key={card}>
            <CardHeader
              title={<Skeleton className="h-4 w-36" />}
              description={<Skeleton className="mt-1 h-3 w-64" />}
            />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`${card}-${index}`} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-[38px] w-full rounded-lg" />
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-20" />} />
          <CardBody>
            <Skeleton className="aspect-square w-full rounded-lg" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
