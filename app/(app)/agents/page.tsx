import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AgentsPage } from "@/components/agents/agents-page";
import { NumoPage } from "@/components/assistant/numo-page";
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

  // Existing work and launch deep links keep their detail surface until they
  // are folded into the common conversation timeline by MIN-524 and MIN-525.
  const usesLegacyAgentSurface = ["run", "issue", "compose"].some(
    (key) => params[key] !== undefined,
  );

  return (
    <Suspense fallback={null}>
      {usesLegacyAgentSurface ? (
        <AgentsPlanGate>
          <AgentsPage />
        </AgentsPlanGate>
      ) : (
        <NumoPage />
      )}
    </Suspense>
  );
}
