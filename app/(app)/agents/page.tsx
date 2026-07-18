"use client";

import { Suspense } from "react";
import { AgentsPage } from "@/components/agents/agents-page";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";

export default function AgentsRoute() {
  // <Suspense> requis : AgentsPage lit ?issue= via useSearchParams.
  return (
    <AgentsPlanGate>
      <Suspense fallback={null}>
        <AgentsPage />
      </Suspense>
    </AgentsPlanGate>
  );
}
