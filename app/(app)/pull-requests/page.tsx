"use client";

import { PullRequestsSkeleton } from "@/components/pull-requests/pr-loading-skeleton";
import { Suspense } from "react";
import { PullRequestsPage } from "@/components/pull-requests/pull-requests-page";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";

export default function PullRequestsRoute() {
  // PullRequestsPage reads deep-link parameters through useSearchParams.
  return (
    <AgentsPlanGate>
      <Suspense fallback={<PullRequestsSkeleton />}>
        <PullRequestsPage />
      </Suspense>
    </AgentsPlanGate>
  );
}
