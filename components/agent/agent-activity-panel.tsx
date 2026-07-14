"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "mangue-ui";
import { Maximize2, Minimize2, X } from "lucide-react";
import { ChatInput } from "@/components/assistant/chat-input";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import { isAgentRunActive, steerAgentRunApi, type AgentRunSummary } from "@/lib/agent-api";
import { ModelBadge } from "@/components/model-badge";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentStatusBadge } from "./agent-run-status";

/**
 * Modal d'activité d'un run de l'agent de code (MIN-46). Réutilise le shell du
 * chat Numo (même Sheet flottant + morph compact/étendu) mais pour un agent EN
 * DIRECT : pas d'historique de conversations, juste l'en-tête (statut + modèle),
 * le flux d'événements, et un composer de STEERING — orienter le run à chaud ou
 * répondre à un `ask_user` (le message est injecté à la frontière de round).
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
  const queryClient = useQueryClient();

  const [displayMode, setDisplayMode] = useState<PanelDisplayMode>("compact");
  const isExpanded = displayMode === "expanded";
  const toggleDisplayMode = () =>
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));

  const active = isAgentRunActive(run.status);
  const sendSteer = async (message: string) => {
    const text = message.trim();
    if (!text) return;
    try {
      await steerAgentRunApi(run.id, text);
      await queryClient.invalidateQueries({ queryKey: ["agent-run-events", run.id] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

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
          {/* En-tête : modèle (identité) + statut, puis expand/close.
              (Pas d'historique ni de nouvelle conversation — agent en direct.) */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
            <ModelBadge model={run.model} className="min-w-0 shrink" />
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
          <div className="min-h-0 flex-1">
            <AgentEventFeed
              runId={run.id}
              status={run.status}
              className="h-full p-4"
            />
          </div>

          {/* Composer de steering : actif tant que le run tourne (queued/running/
              needs_input). Le message rejoint la file et est injecté au round suivant. */}
          <div className="shrink-0">
            <ChatInput
              onSend={(message) => void sendSteer(message)}
              disabled={!active}
              hideAttach
              placeholder={run.status === "needs_input" ? t("replyPlaceholder") : t("steerPlaceholder")}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
