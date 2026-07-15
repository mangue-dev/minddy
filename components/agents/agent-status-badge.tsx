"use client";

import { Badge, Spinner, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import type { AgentRunStatus } from "@/lib/agent-api";

/** Variante de badge par statut de session (repos hors « travaille »). */
const STATUS_VARIANT: Record<
  AgentRunStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "secondary",
  running: "secondary",
  needs_input: "outline",
  completed: "default",
  failed: "destructive",
  canceled: "secondary",
};

const STATUS_KEY: Record<AgentRunStatus, string> = {
  queued: "statusWorking",
  running: "statusWorking",
  needs_input: "statusWaiting",
  completed: "statusDone",
  failed: "statusFailed",
  canceled: "statusCanceled",
};

/**
 * Badge de statut d'une session d'agent, partagé par la liste et le détail de la
 * page Agents. `working` (un run de l'issue TRAVAILLE) prime sur le statut du
 * représentant et affiche un spinner + « En cours ».
 */
export function AgentStatusBadge({
  status,
  working,
  className,
}: {
  status: AgentRunStatus;
  working?: boolean;
  className?: string;
}) {
  const t = useTranslations("Agents");
  const isWorking = working ?? (status === "queued" || status === "running");

  if (isWorking) {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Spinner className="size-3" />
        {t("statusWorking")}
      </Badge>
    );
  }

  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {t(STATUS_KEY[status])}
    </Badge>
  );
}
