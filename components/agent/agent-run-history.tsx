"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import { Check, ChevronDown, Plus } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import {
  isAgentRunActive,
  isAgentRunAwaitingInput,
  type AgentRunSummary,
} from "@/lib/agent-api";

/**
 * Historique des runs d'une issue (MIN-68). Une issue n'a plus UNE session
 * permanente mais une SUITE de runs : celle qui tourne (ou la dernière terminée) est
 * affichée, les précédentes restent consultables ici — leur fil d'événements, leur
 * modèle et leur PR sont intacts.
 *
 * La barre s'affiche dès qu'il existe une run : elle est le seul chemin de RETOUR
 * vers une conversation depuis la phase compose. La masquer quand l'issue n'a qu'une
 * run enfermait l'utilisateur sur le composer vierge, sans rien pour revenir au fil
 * de cette run. Sur une issue SANS run, il n'y a rien à offrir → masquée.
 *
 * « Lancer un nouvel agent » n'apparaît que si AUCUNE run n'est active : une seule
 * run à la fois par issue. Tant qu'une run tourne (ou attend une réponse), la seule
 * action possible est de lui parler dans le composer. C'est aussi le seul point de
 * lancement de la page Agents, qui n'a pas la sidebar du ticket.
 */
export function AgentRunHistory({
  runs,
  selectedId,
  unreadRunIds,
  onSelect,
  onNewRun,
  className,
}: {
  /** Runs de l'issue, plus récente d'abord (ordre de l'API). */
  runs: AgentRunSummary[];
  selectedId: string | null;
  /** Runs terminées non consultées → bulle bleue (déclencheur + entrée). Absent = off. */
  unreadRunIds?: Set<string>;
  onSelect: (run: AgentRunSummary) => void;
  /** Passe en phase compose (nouvelle run froide). Absent → action masquée. */
  onNewRun?: () => void;
  className?: string;
}) {
  const t = useTranslations("Agent");
  const format = useFormatter();

  if (runs.length === 0) return null;

  // Au moins une run non consultée parmi celles listées → point bleu sur le déclencheur
  // (le dropdown est replié : sans ça la bulle serait invisible tant qu'il est fermé).
  const anyUnread = !!unreadRunIds && runs.some((r) => unreadRunIds.has(r.id));
  // Non-lu ET en attente d'une réponse (ask_user) → le point passe au JAUNE.
  const anyAwaiting =
    !!unreadRunIds &&
    runs.some((r) => unreadRunIds.has(r.id) && isAgentRunAwaitingInput(r));

  const fmt = (at: string): string =>
    format.dateTime(new Date(at), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  // Les runs arrivent triées du plus récent au plus ancien : « run 1 » = la plus
  // ancienne, pour que la numérotation se lise dans l'ordre du travail accompli.
  const numberOf = (run: AgentRunSummary): number =>
    runs.length - runs.findIndex((r) => r.id === run.id);

  const selected = runs.find((r) => r.id === selectedId) ?? null;

  return (
    <div className={cn("flex items-center justify-center gap-1.5", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground">
            <NumoIcon className="size-3.5" animated={false} />
            {selected
              ? t("runNumbered", { number: numberOf(selected), total: runs.length })
              : t("runHistory", { total: runs.length })}
            {anyUnread ? (
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  anyAwaiting ? "bg-yellow-500" : "bg-blue-500",
                )}
                aria-label={anyAwaiting ? t("awaitingRun") : t("unreadRun")}
              />
            ) : null}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("runHistory", { total: runs.length })}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {runs.map((run) => (
            <DropdownMenuItem
              key={run.id}
              onSelect={() => onSelect(run)}
              className="flex items-center gap-2"
            >
              <Check
                className={cn("size-3.5 shrink-0", run.id !== selectedId && "opacity-0")}
              />
              <span className="min-w-0 flex-1 truncate">
                {t("runNumbered", { number: numberOf(run), total: runs.length })}
                <span className="text-muted-foreground"> · {fmt(run.created_at)}</span>
              </span>
              {isAgentRunActive(run.status) ? (
                <span className="size-1.5 shrink-0 rounded-full bg-brand" />
              ) : unreadRunIds?.has(run.id) ? (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isAgentRunAwaitingInput(run) ? "bg-yellow-500" : "bg-blue-500",
                  )}
                  aria-label={
                    isAgentRunAwaitingInput(run) ? t("awaitingRun") : t("unreadRun")
                  }
                />
              ) : null}
            </DropdownMenuItem>
          ))}
          {onNewRun ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onNewRun}>
                <Plus className="size-3.5" />
                {t("newRun")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
