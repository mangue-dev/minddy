"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { BotIcon } from "@hugeicons/core-free-icons";
import Link from "@/components/app-link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { usePurchasesHidden } from "@/lib/native-app";
import { usePlanGates } from "@/lib/use-billing-query";

/**
 * Plan guard of agent pages / pull requests (MIN-72, returns): when the
 * plan does not include agents, entire page is replaced by an upsell —
 * access is actually blocked, not just the launch action.
 *
 * In the mobile apps (MIN-907) the page says the plan does not include the
 * feature and stops there: no button and no link toward a purchase.
 */
export function AgentsPlanGate({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Billing");
  const { loading, agentsAllowed } = usePlanGates();
  const purchasesHidden = usePurchasesHidden();

  if (loading || agentsAllowed) return <>{children}</>;

  return (
    <div className="mx-auto w-full max-w-[calc(var(--content-width)+3rem)] px-6 py-16">
      <EmptyState
        icon={<HugeiconsIcon icon={BotIcon} className="size-6" />}
        title={t("agentsGateTitle")}
        description={purchasesHidden ? t("notOnPlan") : t("agentsGateDescription")}
        action={
          purchasesHidden ? undefined : (
            <Button asChild size="sm">
              <Link href="/billing">{t("agentsGateCta")}</Link>
            </Button>
          )
        }
      />
    </div>
  );
}
