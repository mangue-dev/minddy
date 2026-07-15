"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner, cn, toast } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import { ChatInput } from "@/components/assistant/chat-input";
import {
  heartbeatAgentRunApi,
  interruptAgentRunApi,
  isAgentRunResumable,
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

/** Codes d'erreur bruts renvoyés par la route de lancement → clés i18n Agent. */
const LAUNCH_ERROR_KEYS: Record<string, string> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  alreadyRunning: "errorAlreadyRunning",
  quotaExceeded: "errorQuotaExceeded",
  noModelForProvider: "errorNoModelForProvider",
};

/**
 * Cœur réutilisable de la conversation de l'agent de code (MIN-46), extrait de la
 * modal pour être hébergé aussi bien dans le `Sheet` flottant (AgentChatModal) que
 * DIRECTEMENT dans la page Agents (liste/détail, sans modal). La SESSION est
 * persistante et jamais fermée : elle repose entre les tours et se reprend à tout
 * moment (y compris pour redemander des changements sur une PR plus tard).
 *
 *  • COMPOSE (aucune session) — intro + composer pré-écrit « Travaille sur MIN-42 »,
 *    picker de modèle dans la barre. Envoyer LANCE la session.
 *  • LIVE — le fil devient le flux d'événements. L'agent TRAVAILLE (bouton
 *    « Interrompre la réponse en cours ») ou est AU REPOS (composer actif).
 *
 * Tant que le composant est `active`, un heartbeat rafraîchit l'horloge d'inactivité
 * du run pour que la sandbox ne soit pas coupée pendant qu'on lit ou écrit.
 *
 * L'en-tête est fourni par l'hôte : `headerTitle` (bloc de gauche — la modal laisse
 * le défaut : modèle en live / issue ciblée en compose ; la page passe son propre
 * titre) et `headerActions` (bloc de droite — expand/close pour la modal, retour /
 * lien PR pour la page).
 */
export function AgentConversation({
  issueId,
  issueIdentifier,
  initialRun = null,
  active = true,
  headerTitle,
  headerActions,
  headerClassName,
}: {
  issueId: string;
  /** Identifiant lisible (MIN-42) — pré-écrit dans le prompt en phase compose. */
  issueIdentifier: string;
  /** Pré-sélectionne une session existante (sinon on la déduit des runs). */
  initialRun?: AgentRunSummary | null;
  /** Le composant est-il visible/vivant ? Gate la query et le heartbeat. */
  active?: boolean;
  /** Bloc de gauche de l'en-tête (défaut : modèle en live / issue en compose). */
  headerTitle?: ReactNode;
  /** Bloc d'actions à droite de l'en-tête. */
  headerActions?: ReactNode;
  /** Classe additionnelle sur la barre d'en-tête (ex. `border-b` sur la page). */
  headerClassName?: string;
}) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();

  // Snapshot local du run (bascule live instantanée au lancement), resynchronisé
  // depuis la query. Sans snapshot, on reprend la session active de l'issue.
  const [run, setRun] = useState<AgentRunSummary | null>(initialRun);
  useEffect(() => {
    setRun(initialRun);
  }, [initialRun]);
  const { runs, loading } = useIssueAgentRunsQuery(active ? issueId : null);
  const liveRun = run
    ? runs.find((r) => r.id === run.id) ?? run
    : runs.find((r) => isAgentRunResumable(r.status)) ?? null;
  const working = liveRun ? isAgentRunWorking(liveRun.status) : false;
  // Steerable = la session est REPRENNABLE (travail, repos, OU terminée après PR).
  // On peut toujours relancer l'agent pour itérer — seul `failed` est bloqué.
  const steerable = liveRun ? isAgentRunResumable(liveRun.status) : false;

  // Heartbeat tant que le composant est actif sur une session : garde la sandbox
  // vivante pendant qu'on lit / écrit (le reaper ne coupe que les runs inactifs).
  useEffect(() => {
    if (!active || !liveRun) return;
    const id = liveRun.id;
    void heartbeatAgentRunApi(id);
    const timer = setInterval(() => void heartbeatAgentRunApi(id), 45_000);
    return () => clearInterval(timer);
  }, [active, liveRun?.id]);

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

  // Envoi depuis le composer live. Si l'agent TRAVAILLE : on met d'abord le message
  // en file PUIS on interrompt → le tour en cours s'arrête et reprend en traitant
  // ce message en priorité (steering). Au repos : simple relance.
  const sendLive = async (message: string) => {
    const text = message.trim();
    if (!text) return;
    await steer(text);
    if (working) await interrupt();
  };

  const phase: "live" | "loading" | "compose" = liveRun
    ? "live"
    : loading
      ? "loading"
      : "compose";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* En-tête : bloc de gauche fourni par l'hôte (défaut : modèle en live / issue
          ciblée en compose — la session n'est jamais « terminée ») + actions à droite. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 px-3 py-2.5",
          headerClassName,
        )}
      >
        {headerTitle ??
          (liveRun ? (
            <ModelBadge model={liveRun.model} className="min-w-0 shrink" />
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <NumoIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {t("sectionTitle")}
                <span className="text-muted-foreground">
                  {" · "}
                  {issueIdentifier}
                </span>
              </span>
            </span>
          ))}

        {headerActions ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>
        ) : null}
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
              <NumoIcon className="size-6 text-muted-foreground" />
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
              onSend={(message) => void sendLive(message)}
              onAbort={() => void interrupt()}
              isStreaming={working}
              sendWhileStreaming
              beam={working}
              disabled={!steerable}
              hideAttach
              placeholder={
                !steerable
                  ? t("endedPlaceholder")
                  : working
                    ? t("livePlaceholder")
                    : t("restPlaceholder")
              }
              leadingControls={
                // Modèle figé pour la session : picker verrouillé + tooltip.
                <ModelCombobox
                  variant="compact"
                  value={liveRun.model ?? ""}
                  onChange={() => {}}
                  defaultLabel={t("modelDefault")}
                  defaultModelId={liveRun.model}
                  placeholder={t("modelSearchPlaceholder")}
                  emptyLabel={t("modelSearchEmpty")}
                  loadingLabel={t("modelSearchLoading")}
                  freeTextLabel={(q) => t("modelUseCustom", { model: q })}
                  disabled
                  disabledTooltip={t("modelLocked")}
                />
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
  );
}
