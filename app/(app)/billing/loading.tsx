import { Skeleton } from "mangue-ui";
import { AppContentHeader } from "@/components/app-content-header";

export default function BillingLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppContentHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
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
