"use client";

import { Suspense } from "react";
import { AgentsPage } from "@/components/agents/agents-page";

export default function AgentsRoute() {
  // <Suspense> requis : AgentsPage lit ?issue= via useSearchParams.
  return (
    <Suspense fallback={null}>
      <AgentsPage />
    </Suspense>
  );
}
