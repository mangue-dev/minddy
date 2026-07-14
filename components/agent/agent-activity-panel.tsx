"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { Maximize2, Minimize2, X } from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import { ChatInput } from "@/components/assistant/chat-input";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import { isAgentRunActive, type AgentRunSummary } from "@/lib/agent-api";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentStatusBadge } from "./agent-run-status";

/**
 * Modal d'activité d'un run de l'agent de code (MIN-46). Réutilise le shell du
 * chat Numo (même Sheet flottant + morph compact/étendu) mais pour un agent EN
 * DIRECT : pas d'historique de conversations ni de « nouvelle conversation »,
 * juste l'en-tête (statut + modèle), le flux d'événements, et un composer
 * présent mais non branché (la réponse à l'agent arrivera plus tard).
 */
export function AgentActivityPanel({
  open,
  onOpenChange,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: AgentRunSummary;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  const ta = useTranslations("Assistant");

  const [displayMode, setDisplayMode] = useState<PanelDisplayMode>("compact");
  const isExpanded = displayMode === "expanded";
  const toggleDisplayMode = () =>
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));

  const active = isAgentRunActive(run.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName={panelOverlayClassName(displayMode)}
        data-mode={displayMode}
        className={panelSheetClassName(displayMode)}
      >
        <SheetTitle className="sr-only">{t("activityTitle")}</SheetTitle>

        <div className="flex h-full flex-col overflow-hidden">
          {/* En-tête : icône Numo + titre + statut/modèle, puis expand/close.
              (Pas d'historique ni de nouvelle conversation — agent en direct.) */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
            <NumoIcon
              state={active ? "thinking" : "idle"}
              className="size-5 shrink-0 text-foreground"
            />
            <span className="truncate text-sm font-medium">{t("activityTitle")}</span>
            <AgentStatusBadge status={run.status} />

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hidden md:inline-flex"
                    aria-label={isExpanded ? ta("collapse") : ta("expand")}
                    onClick={toggleDisplayMode}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {isExpanded ? ta("collapse") : ta("expand")}
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={tc("close")}
                    onClick={() => onOpenChange(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6} align="end">
                  {tc("close")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Flux d'événements du run. */}
          <div className="min-h-0 flex-1 border-t border-border">
            <AgentEventFeed
              runId={run.id}
              status={run.status}
              className="h-full p-4"
            />
          </div>

          {/* Composer présent mais NON branché pour l'instant (répondre à
              l'agent en direct arrivera plus tard). */}
          <div className="shrink-0">
            <ChatInput
              onSend={() => {}}
              disabled
              hideAttach
              placeholder={t("replyPlaceholder")}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
