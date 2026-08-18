"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { Button } from "mangue-ui";
import { EmptyState } from "@/components/empty-state";
import { usePlanGates } from "@/lib/use-billing-query";

/**
 * Plan guard of agent pages / pull requests (MIN-72, returns): when the
 * plan does not include agents, entire page is replaced by an upsell —
 * access is actually blocked, not just the launch action.
 */
export function AgentsPlanGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Billing");
  const { loading, agentsAllowed } = usePlanGates();

  if (loading || agentsAllowed) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <EmptyState
        icon={<Bot className="size-6" />}
        title={t("agentsGateTitle")}
        description={t("agentsGateDescription")}
        action={
          <Button asChild size="sm">
            <Link href="/billing">{t("agentsGateCta")}</Link>
          </Button>
        }
      />
    </div>
  );
}
