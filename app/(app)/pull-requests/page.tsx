"use client";

import { Suspense } from "react";
import { PullRequestsPage } from "@/components/pull-requests/pull-requests-page";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";

export default function PullRequestsRoute() {
  // <Suspense> requis : PullRequestsPage lit ?run= via useSearchParams.
  return (
    <AgentsPlanGate>
      <Suspense fallback={null}>
        <PullRequestsPage />
      </Suspense>
    </AgentsPlanGate>
  );
}
