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
  isAgentRunActive,
  isAgentRunResumable,
  isAgentRunWorking,
  launchAgentRunApi,
  steerAgentRunApi,
  type AgentRunSummary,
} from "@/lib/agent-api";
import {
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
  useIssueAgentRunsQuery,
} from "@/lib/use-agent-runs";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { ModelBadge } from "@/components/model-badge";
import { ModelCombobox } from "./model-combobox";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentRunHistory } from "./agent-run-history";

/** Codes d'erreur bruts des routes agent (lancement ET reprise) → clés i18n Agent. */
const AGENT_ERROR_KEYS: Record<string, string> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  alreadyRunning: "errorAlreadyRunning",
  quotaExceeded: "errorQuotaExceeded",
  noModelForProvider: "errorNoModelForProvider",
  supersededRun: "errorSupersededRun",
};

/**
 * Cœur réutilisable de la conversation de l'agent de code (MIN-46 + MIN-68), extrait
 * de la modal pour être hébergé aussi bien dans le `Sheet` flottant (AgentChatModal)
 * que DIRECTEMENT dans la page Agents (liste/détail, sans modal).
 *
 * Une issue porte une SUITE de runs, dont une seule peut être active. Ce composant
 * tient les deux modes de (re)lancement, qui se distinguent par le POINT D'ENTRÉE :
 *
 *  • FROID (`compose`) — aucune run active, et aucune run explicitement ouverte :
 *    intro + composer pré-écrit « Travaille sur MIN-42 » + picker de modèle. Envoyer
 *    lance une run NEUVE, qui héritera côté serveur de la branche/PR de l'issue.
 *    C'est ce que voient la sidebar, le clic droit et « demander des changements ».
 *  • CHAUD (`live`) — une run est ouverte (active par défaut, ou choisie dans
 *    l'historique) : le fil est son flux d'événements et le composer lui parle
 *    DIRECTEMENT (`/steer`), dans son contexte. Même terminée, une run reste
 *    reprennable ainsi — c'est le seul chemin de reprise à chaud.
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
  initialRunId = null,
  active = true,
  headerTitle,
  headerActions,
  headerClassName,
}: {
  issueId: string;
  /** Identifiant lisible (MIN-42) — pré-écrit dans le prompt en phase compose. */
  issueIdentifier: string;
  /**
   * Ouvre CETTE run (le panneau d'issue et la page Agents désignent la dernière).
   * Absent → on ouvre la run ACTIVE de l'issue, et à défaut on compose une nouvelle
   * run froide : c'est ce que veut un point d'entrée « lancer un agent ».
   */
  initialRunId?: string | null;
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

  /** Traduit un code d'erreur d'API agent, ou laisse passer le message brut. */
  const agentErrorMessage = (err: unknown): string => {
    const msg = (err as Error).message;
    const key = AGENT_ERROR_KEYS[msg];
    return key ? t(key) : msg;
  };

  /**
   * Rafraîchit les runs de l'issue ET la liste globale des sessions (page Agents).
   * Cette liste ne poll QUE si une session travaille déjà — sans invalidation
   * explicite, lancer ou reprendre une run depuis la page la laisse figée sur le
   * statut de la run précédente jusqu'au prochain rechargement complet.
   */
  const refreshRuns = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) }),
      queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey }),
    ]);
  };

  // Run explicitement ouverte : `initialRunId`, une run choisie dans l'historique,
  // ou celle qu'on vient de lancer. `null` → on retombe sur la run ACTIVE de l'issue.
  const [selectedId, setSelectedId] = useState<string | null>(initialRunId);
  // Run tout juste lancée : la query ne l'a pas encore renvoyée, on l'affiche depuis
  // la réponse du POST → bascule live instantanée, sans flash de la phase compose.
  const [launched, setLaunched] = useState<AgentRunSummary | null>(null);
  // « Lancer un nouvel agent » demandé explicitement : force la phase compose même
  // si l'issue a des runs passées (sinon on rouvrirait la dernière).
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    setSelectedId(initialRunId);
    setComposing(false);
  }, [initialRunId]);

  const { runs, loading } = useIssueAgentRunsQuery(active ? issueId : null);
  // La run tout juste lancée est active mais pas encore dans `runs` : sans elle, on
  // proposerait « lancer un nouvel agent » sur une issue déjà occupée (→ 409).
  const knownRuns =
    launched && !runs.some((r) => r.id === launched.id) ? [launched, ...runs] : runs;
  const activeRun = knownRuns.find((r) => isAgentRunActive(r.status)) ?? null;
  // Résolution de la run affichée. Une run TERMINÉE n'est jamais reprise d'office :
  // sans run désignée ni run active, on compose une nouvelle run froide (MIN-68).
  const liveRun = composing
    ? null
    : selectedId
      ? knownRuns.find((r) => r.id === selectedId) ?? null
      : activeRun;
  const working = liveRun ? isAgentRunWorking(liveRun.status) : false;
  // `runs` arrive trié du plus récent au plus ancien : runs[0] est la dernière run.
  // La run qu'on vient de lancer compte AUSSI comme la dernière : entre le POST et
  // l'arrivée du refetch, `runs` est encore la liste d'AVANT, et la comparer à
  // runs[0] désignerait la run précédente → on afficherait « run passée, composer
  // désactivé » sur la run que l'utilisateur vient de démarrer.
  const isLatest = liveRun ? knownRuns[0]?.id === liveRun.id : false;
  // Le composer parle-t-il à cette run ? Oui même terminée (reprise à chaud) — seul
  // `failed` n'a rien à reprendre. Mais SEULE la dernière run est reprennable : les
  // runs d'une issue partagent la branche, et une run passée est restée sur un état
  // dépassé (son push serait rejeté). On la consulte ; pour continuer, on en lance
  // une nouvelle. Le serveur applique la même règle (409 `supersededRun`).
  const steerable = liveRun ? isAgentRunResumable(liveRun.status) && isLatest : false;

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
      // La run neuve devient la run ouverte → bascule live immédiate.
      setLaunched(started);
      setSelectedId(started.id);
      setComposing(false);
      await refreshRuns();
    } catch (err) {
      toast.error(agentErrorMessage(err));
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
        refreshRuns(),
        queryClient.invalidateQueries({ queryKey: ["agent-run-events", liveRun.id] }),
      ]);
    } catch (err) {
      // Course : une run plus récente a pu naître depuis le rendu (autre onglet,
      // coéquipier) → le serveur refuse la reprise, on le dit en clair.
      toast.error(agentErrorMessage(err));
    }
  };

  // Interrompt la réponse en cours du modèle ; la session revient au repos.
  const interrupt = async () => {
    if (!liveRun) return;
    try {
      await interruptAgentRunApi(liveRun.id);
      await refreshRuns();
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

  // PR dont la prochaine run froide héritera — miroir EXACT de
  // `inheritablePrForIssue` : on prend la PR la plus récente, et si elle est
  // fusionnée il n'y a rien à hériter (branche neuve). Surtout pas « la plus récente
  // non fusionnée » : on promettrait d'itérer sur une vieille PR que le serveur ne
  // touchera pas.
  const latestPrRun = runs.find((r) => r.pr_number != null) ?? null;
  const inheritedPr =
    latestPrRun && latestPrRun.pr_state !== "merged" ? latestPrRun.pr_number : null;

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

      {/* Historique : navigation entre les runs successives de l'issue (≥ 2 runs).
          « Lancer un nouvel agent » n'y figure que si aucune run n'est active. */}
      {phase !== "loading" ? (
        <AgentRunHistory
          runs={knownRuns}
          selectedId={liveRun?.id ?? null}
          onSelect={(picked) => {
            setComposing(false);
            setSelectedId(picked.id);
          }}
          onNewRun={
            activeRun || phase === "compose"
              ? undefined
              : () => {
                  setSelectedId(null);
                  setComposing(true);
                }
          }
          className="shrink-0 pb-1"
        />
      ) : null}

      {/* Fil : flux d'événements (live), spinner (chargement) ou intro (compose). */}
      <div className="min-h-0 flex-1">
        {phase === "live" && liveRun ? (
          <AgentEventFeed
            runId={liveRun.id}
            status={liveRun.status}
            prompt={liveRun.prompt}
            className="h-full py-4"
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
              {/* Une run froide part d'un contexte vierge, mais reprend la PR de
                  l'issue : on l'annonce, sinon « nouvel agent » laisse craindre de
                  repartir de zéro et de perdre le travail déjà en revue. */}
              {inheritedPr
                ? t("composeInheritsPr", { number: inheritedPr })
                : t("dialogDescription")}
            </p>
          </div>
        )}
      </div>

      {/* Composer : steering/interruption (live) ou lancement pré-écrit (compose).
          Borné à la même largeur max que le fil et centré. */}
      {phase !== "loading" && (
        <div className="shrink-0">
          <div className="mx-auto w-full max-w-[800px]">
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
                steerable
                  ? working
                    ? t("livePlaceholder")
                    : t("restPlaceholder")
                  : // Run passée : consultation seule (une run plus récente a repris
                    // la branche). Sinon : run `failed`, rien à reprendre.
                    isLatest
                    ? t("endedPlaceholder")
                    : t("pastRunPlaceholder")
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
        </div>
      )}
    </div>
  );
}
