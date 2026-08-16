import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AgentsPage } from "@/components/agents/agents-page";
import { AgentsPlanGate } from "@/components/billing/agents-plan-gate";

export default async function AgentsRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const routine = Array.isArray(params.routine) ? params.routine[0] : params.routine;
  if (tab === "routines" || routine) {
    redirect(routine ? `/routines?routine=${encodeURIComponent(routine)}` : "/routines");
  }

  // <Suspense> requis : AgentsPage lit ?issue= via useSearchParams.
  return (
    <AgentsPlanGate>
      <Suspense fallback={null}>
        <AgentsPage />
      </Suspense>
    </AgentsPlanGate>
  );
}
