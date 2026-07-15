"use client";

import { useEffect, useState } from "react";
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
import { Bot, Maximize2, Minimize2, X } from "lucide-react";
import { ChatInput } from "@/components/assistant/chat-input";
import {
  panelSheetClassName,
  panelOverlayClassName,
  type PanelDisplayMode,
} from "@/components/assistant/panel-geometry";
import {
  isAgentRunActive,
  launchAgentRunApi,
  steerAgentRunApi,
  type AgentRunSummary,
} from "@/lib/agent-api";
import {
  issueAgentRunsQueryKey,
  useIssueAgentRunsQuery,
} from "@/lib/use-agent-runs";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { ModelBadge } from "@/components/model-badge";
import { ModelCombobox } from "./model-combobox";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentStatusBadge } from "./agent-run-status";

/**
 * Modal conversationnelle de l'agent de code (MIN-46). Réutilise le shell du chat
 * Numo (Sheet flottant grand format + morph compact/étendu) en deux phases :
 *
 *  1. COMPOSE (aucun run) — le fil montre une intro, le composer est pré-écrit
 *     « Travaille sur MIN-42 » avec le picker de modèle dans sa barre. Envoyer
 *     lance le run (`launchAgentRunApi`) : la session commence, on bascule live.
 *  2. LIVE (run démarré / repris) — le fil devient le flux d'événements, le
 *     composer sert au steering (message injecté à la frontière de round).
 *
 * `initialRun` ouvre directement en phase live (bouton « Voir l'activité »).
 */
export function AgentChatModal({
  open,
  onOpenChange,
  issueId,
  issueIdentifier,
  initialRun = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  /** Identifiant lisible (MIN-42) — pré-écrit dans le prompt en phase compose. */
  issueIdentifier: string;
  /** Ouvre directement sur un run existant (phase live), sans compose. */
  initialRun?: AgentRunSummary | null;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  const ta = useTranslations("Assistant");
  const queryClient = useQueryClient();

  // Grand format par défaut (vrai modal centré) ; repliable en widget de coin.
  const [displayMode, setDisplayMode] = useState<PanelDisplayMode>("expanded");
  const isExpanded = displayMode === "expanded";
  const toggleDisplayMode = () =>
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));

  // Run courant : snapshot local (bascule live instantanée au lancement), dont
  // le statut est resynchronisé depuis la query tant que la modal est ouverte.
  const [run, setRun] = useState<AgentRunSummary | null>(initialRun);
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);
  const { runs } = useIssueAgentRunsQuery(open ? issueId : null);
  const liveRun = run ? runs.find((r) => r.id === run.id) ?? run : null;
  const active = liveRun ? isAgentRunActive(liveRun.status) : false;

  // Sélection de modèle (phase compose).
  const { provider, defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  const [launching, setLaunching] = useState(false);
  // Seul un BYOK générique sans défaut résoluble impose de choisir un modèle.
  const modelRequired = provider === "generic" && !defaultModel && !model;

  const launch = async (message: string) => {
    if (launching) return;
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    const prompt = message.trim();
    setLaunching(true);
    try {
      const { run: started } = await launchAgentRunApi(issueId, {
        prompt: prompt || undefined,
        model: model || undefined,
      });
      setRun(started);
      await queryClient.invalidateQueries({
        queryKey: issueAgentRunsQueryKey(issueId),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaunching(false);
    }
  };

  const steer = async (message: string) => {
    if (!liveRun) return;
    const text = message.trim();
    if (!text) return;
    try {
      await steerAgentRunApi(liveRun.id, text);
      await queryClient.invalidateQueries({
        queryKey: ["agent-run-events", liveRun.id],
      });
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
        <SheetTitle className="sr-only">{t("dialogTitle")}</SheetTitle>

        <div className="flex h-full flex-col overflow-hidden">
          {/* En-tête : en live, modèle + statut ; en compose, l'issue ciblée. */}
          <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
            {liveRun ? (
              <>
                <ModelBadge model={liveRun.model} className="min-w-0 shrink" />
                <AgentStatusBadge status={liveRun.status} />
              </>
            ) : (
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Bot className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {t("sectionTitle")}
                  <span className="text-muted-foreground">
                    {" · "}
                    {issueIdentifier}
                  </span>
                </span>
              </span>
            )}

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

          {/* Fil : intro (compose) ou flux d'événements du run (live). */}
          <div className="min-h-0 flex-1">
            {liveRun ? (
              <AgentEventFeed
                runId={liveRun.id}
                status={liveRun.status}
                className="h-full p-4"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
                  <Bot className="size-6 text-muted-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {t("dialogDescription")}
                </p>
              </div>
            )}
          </div>

          {/* Composer : steering (live) ou lancement pré-écrit (compose). */}
          <div className="shrink-0">
            {liveRun ? (
              <ChatInput
                key={liveRun.id}
                onSend={(message) => void steer(message)}
                disabled={!active}
                hideAttach
                placeholder={
                  liveRun.status === "needs_input"
                    ? t("replyPlaceholder")
                    : t("steerPlaceholder")
                }
              />
            ) : (
              <ChatInput
                key="compose"
                onSend={(message) => void launch(message)}
                disabled={launching}
                hideAttach
                initialValue={t("composeDefaultPrompt", { id: issueIdentifier })}
                placeholder={t("composePlaceholder")}
                leadingControls={
                  <ModelCombobox
                    variant="compact"
                    value={model}
                    onChange={setModel}
                    defaultLabel={t("modelDefault")}
                    defaultModelId={defaultModel ?? providerDefaultModel}
                    placeholder={t("modelSearchPlaceholder")}
                    emptyLabel={t("modelSearchEmpty")}
                    loadingLabel={t("modelSearchLoading")}
                    freeTextLabel={(q) => t("modelUseCustom", { model: q })}
                    disabled={launching}
                  />
                }
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
