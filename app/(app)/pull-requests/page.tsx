"use client";

import { Suspense } from "react";
import { PullRequestsPage } from "@/components/pull-requests/pull-requests-page";

export default function PullRequestsRoute() {
  // <Suspense> requis : PullRequestsPage lit ?run= via useSearchParams.
  return (
    <Suspense fallback={null}>
      <PullRequestsPage />
    </Suspense>
  );
}
