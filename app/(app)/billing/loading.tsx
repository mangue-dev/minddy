import { Skeleton } from "@/components/ui/skeleton";
import { AppContentHeader } from "@/components/app-content-header";

export default function BillingLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppContentHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-content max-w-content px-4 py-6 app-desktop:px-6">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
