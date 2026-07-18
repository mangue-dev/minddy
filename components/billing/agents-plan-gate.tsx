"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";
import { Button } from "mangue-ui";
import { EmptyState } from "@/components/empty-state";
import { usePlanGates } from "@/lib/use-billing-query";

/**
 * Garde de plan des pages agents / pull requests (MIN-72, retours) : quand le
 * plan n'inclut pas les agents, la page entière est remplacée par un upsell —
 * l'accès est réellement bloqué, pas juste l'action de lancement.
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
