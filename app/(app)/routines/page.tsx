"use client";

import { Suspense } from "react";
import { RoutinesPage } from "@/components/routines/routines-page";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";

export default function RoutinesRoute() {
  // <Suspense> requis : RoutinesPage lit ?routine via useSearchParams.
  return (
    <AgentsPlanGate>
      <Suspense fallback={null}>
        <RoutinesPage />
      </Suspense>
    </AgentsPlanGate>
  );
}
