"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  Spinner,
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
  heartbeatAgentRunApi,
  interruptAgentRunApi,
  isAgentRunActive,
  isAgentRunWorking,
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

/** Codes d'erreur bruts renvoyés par la route de lancement → clés i18n Agent. */
const LAUNCH_ERROR_KEYS: Record<string, string> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  alreadyRunning: "errorAlreadyRunning",
  quotaExceeded: "errorQuotaExceeded",
  noModelForProvider: "errorNoModelForProvider",
};

/**
 * Modal conversationnelle de l'agent de code (MIN-46). Réutilise le shell du chat
 * Numo (Sheet flottant grand format + morph compact/étendu). La SESSION est
 * persistante et jamais fermée : elle repose entre les tours et se reprend à tout
 * moment (y compris pour redemander des changements sur une PR plus tard).
 *
 *  • COMPOSE (aucune session) — intro + composer pré-écrit « Travaille sur MIN-42 »,
 *    picker de modèle dans la barre. Envoyer LANCE la session.
 *  • LIVE — le fil devient le flux d'événements. L'agent TRAVAILLE (bouton
 *    « Interrompre la réponse en cours ») ou est AU REPOS (composer actif : le
 *    message relance l'agent / répond à un `ask_user`).
 *
 * Tant que la modal est ouverte, un heartbeat rafraîchit l'horloge d'inactivité
 * du run pour que la sandbox ne soit pas coupée pendant qu'on lit ou écrit.
 * `initialRun` pré-sélectionne la session (bouton « Ouvrir la conversation »).
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
  /** Pré-sélectionne une session existante (sinon on la déduit des runs). */
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

  // Snapshot local du run (bascule live instantanée au lancement), resynchronisé
  // depuis la query. Sans snapshot, on reprend la session active de l'issue.
  const [run, setRun] = useState<AgentRunSummary | null>(initialRun);
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);
  const { runs, loading } = useIssueAgentRunsQuery(open ? issueId : null);
  const liveRun = run
    ? runs.find((r) => r.id === run.id) ?? run
    : runs.find((r) => isAgentRunActive(r.status)) ?? null;
  const working = liveRun ? isAgentRunWorking(liveRun.status) : false;
  // Steerable = la session accepte un message (travail ou repos). Un run terminal
  // (failed / ancien completed-canceled) ne l'est pas → composer désactivé.
  const steerable = liveRun ? isAgentRunActive(liveRun.status) : false;

  // Heartbeat tant que la modal est ouverte sur une session : garde la sandbox
  // vivante pendant qu'on lit / écrit (le reaper ne coupe que les runs inactifs).
  useEffect(() => {
    if (!open || !liveRun) return;
    const id = liveRun.id;
    void heartbeatAgentRunApi(id);
    const timer = setInterval(() => void heartbeatAgentRunApi(id), 45_000);
    return () => clearInterval(timer);
  }, [open, liveRun?.id]);

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
      const msg = (err as Error).message;
      const key = LAUNCH_ERROR_KEYS[msg];
      toast.error(key ? t(key) : msg);
    } finally {
      setLaunching(false);
    }
  };

  // Message au repos : relance l'agent (nouveau tour) ou répond à un `ask_user`.
  const steer = async (message: string) => {
    if (!liveRun) return;
    const text = message.trim();
    if (!text) return;
    try {
      await steerAgentRunApi(liveRun.id, text);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) }),
        queryClient.invalidateQueries({ queryKey: ["agent-run-events", liveRun.id] }),
      ]);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Interrompt la réponse en cours du modèle ; la session revient au repos.
  const interrupt = async () => {
    if (!liveRun) return;
    try {
      await interruptAgentRunApi(liveRun.id);
      await queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const phase: "live" | "loading" | "compose" = liveRun
    ? "live"
    : loading
      ? "loading"
      : "compose";

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
          {/* En-tête : en live, modèle + statut ; sinon l'issue ciblée. */}
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

          {/* Fil : flux d'événements (live), spinner (chargement) ou intro (compose). */}
          <div className="min-h-0 flex-1">
            {phase === "live" && liveRun ? (
              <AgentEventFeed
                runId={liveRun.id}
                status={liveRun.status}
                className="h-full p-4"
              />
            ) : phase === "loading" ? (
              <div className="flex h-full items-center justify-center">
                <Spinner className="size-5 text-muted-foreground" />
              </div>
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

          {/* Composer : steering/interruption (live) ou lancement pré-écrit (compose). */}
          {phase !== "loading" && (
            <div className="shrink-0">
              {liveRun ? (
                <ChatInput
                  key={liveRun.id}
                  onSend={(message) => void steer(message)}
                  onAbort={() => void interrupt()}
                  isStreaming={working}
                  beam={working}
                  disabled={working || !steerable}
                  hideAttach
                  placeholder={
                    working
                      ? t("workingPlaceholder")
                      : steerable
                        ? t("continuePlaceholder")
                        : t("endedPlaceholder")
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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
