"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  cn,
  Spinner,
  toast,
} from "mangue-ui";
import { GitPullRequest } from "lucide-react";
import { cumulativeBranchFiles, changeTotals } from "@/lib/agent-changed-files";
import { NumoIcon } from "@/components/numo-icon";
import { ChatInput } from "@/components/assistant/chat-input";
import { AskUserCard } from "@/components/assistant/ask-user-card";
import { parseAskUserQuestions, type AskUserQuestion } from "@/lib/ask-user";
import { unechoedMessages } from "@/lib/agent-pending";
import type { AgentComposeIntent } from "@/lib/agent-compose-draft";
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
  agentRunDiffQueryKey,
  agentRunQueryKey,
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
  useAgentRunDiffStatQuery,
  useAgentRunEventsQuery,
  useAgentRunQuery,
  useIssueAgentRunsQuery,
} from "@/lib/use-agent-runs";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { ModelBadge } from "@/components/model-badge";
import { ModelCombobox } from "./model-combobox";
import { BranchCombobox } from "./branch-combobox";
import { ReasoningCombobox } from "./reasoning-combobox";
import {
  EnvironmentCombobox,
  LOCAL_REPO_ERROR_KEYS,
  type AgentEnvironment,
} from "./environment-combobox";
import { useLocalRepo } from "@/lib/use-local-repo";
import { playLocalRunHere } from "@/lib/local-run-here";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentDiffSheet } from "./agent-diff-sheet";
import { SubagentActivityBar } from "./subagent-activity-bar";
import { PlanActivityBar } from "./plan-activity-bar";
import { turnSubagents } from "@/lib/agent-subagents";
import { livePlan } from "@/lib/agent-plan";
import { useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import type { AssistantMention } from "@/lib/assistant-types";
import { MentionLinksProvider } from "@/components/mention-links";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Cœur réutilisable de la conversation de l'agent de code (MIN-46 + MIN-68), extrait
 * de la modal pour être hébergé aussi bien dans le `Sheet` flottant (AgentChatModal)
 * que DIRECTEMENT dans la page Agents (liste/détail, sans modal).
 *
 * Ce composant montre UN run — la conversation, c'est lui. Une issue en porte
 * plusieurs, successifs, dont un seul peut TRAVAILLER à la fois ; ils ne se
 * choisissent plus ici (le sélecteur du milieu de l'en-tête a disparu) mais dans
 * la LISTE de la page Agents, où chacun a sa ligne et son titre. L'hôte désigne
 * donc celui qu'on ouvre, et deux modes se distinguent par le POINT D'ENTRÉE :
 *
 *  • CHAUD (`live`) — le run désigné (`initialRunId` / `noteRunId`), ou à défaut
 *    celui qui travaille, sinon le dernier de l'issue : le fil est son flux
 *    d'événements et le composer lui parle DIRECTEMENT (`/steer`), dans son
 *    contexte. Au repos, la conversation se POURSUIT ainsi, naturellement — comme
 *    un chat. Seul le DERNIER run de l'issue est reprennable ; les précédents se
 *    consultent (le serveur applique la même règle).
 *  • FROID (`compose`) — aucun run sur l'issue, ou brouillon de lancement :
 *    composer VIERGE (l'utilisateur dit ce qu'il veut, pas de but pré-écrit) +
 *    picker de modèle. Envoyer lance un run NEUF, qui héritera côté serveur de la
 *    branche/PR de l'issue.
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
  issueId = null,
  issueIdentifier = "",
  projectId = null,
  noteRunId = null,
  initialRunId = null,
  initialCompose = false,
  active = true,
  headerTitle,
  headerActions,
  onLaunched,
  initialComposeText,
  composeIntent = "implement",
}: {
  /** Issue d'ancrage — null pour une session CARNET (passer `noteRunId`). */
  issueId?: string | null;
  /** Identifiant lisible (MIN-42) — affiché dans l'en-tête en phase compose. */
  issueIdentifier?: string;
  /** Project scope for @ mention suggestions and page resolution. */
  projectId?: string | null;
  /**
   * Session SANS TICKET (MIN-84) : le run EST la session — conversation d'UN
   * run, sans historique d'issue ni phase compose (le run existe déjà ; le
   * compose de ces sessions vit dans SessionCompose, avant toute run).
   */
  noteRunId?: string | null;
  /**
   * Ouvre CE run — celui de la ligne cliquée sur la page Agents, celui que le
   * panneau d'issue rouvre. Absent → le run qui TRAVAILLE, à défaut le DERNIER
   * run non `failed` de l'issue, et sans aucun run on compose.
   */
  initialRunId?: string | null;
  /**
   * Force la phase compose à l'ouverture (brouillon de lancement) même si l'issue
   * a déjà des runs au repos.
   */
  initialCompose?: boolean;
  /** Le composant est-il visible/vivant ? Gate la query et le heartbeat. */
  active?: boolean;
  /** Bloc de gauche de l'en-tête (défaut : modèle en live / issue en compose). */
  headerTitle?: ReactNode;
  /** Bloc d'actions à droite de l'en-tête. */
  headerActions?: ReactNode;
  /**
   * Appelé dès qu'une run NEUVE vient d'être lancée depuis la phase compose (avant
   * même que la liste des sessions ne l'ait rattrapée). La page Agents s'en sert
   * pour retenir l'id de la run le temps de la transition compose → live.
   */
  onLaunched?: (run: AgentRunSummary) => void;
  /**
   * Prompt pré-écrit qui amorce le composer en phase compose (demande
   * d'implémentation adaptée à l'issue). One-shot : lu au montage du composer, puis
   * librement éditable. Sans lui, le composer démarre vide (« New run », modal).
   */
  initialComposeText?: string;
  /**
   * Ce que le point d'entrée demandait à l'agent : `plan` (« Générer un plan » /
   * « Vérifier le plan ») CADRE le ticket sans le commencer — le serveur ne le
   * passe alors pas « en cours ». Suit le brouillon, pas le texte du composer :
   * l'utilisateur reste libre de réécrire la consigne.
   */
  composeIntent?: AgentComposeIntent;
}) {
  const t = useTranslations("Agent");
  const tToolCall = useTranslations("ToolCall");
  const queryClient = useQueryClient();
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId);

  /**
   * Le FAB de Numo s'efface tant que cette conversation est à l'écran : son
   * composer est épinglé en bas à droite, et le FAB tombe pile sur son bouton
   * d'envoi. C'est déclaré ICI, par le composant qui porte ce composer, plutôt
   * que par une liste de routes — la page Agents nous monte sous son onglet
   * Conversations mais pas sous son onglet Routines, à la même URL, et une
   * routine ouverte sur l'un de ses passages nous remonte à nouveau.
   */
  useSuppressAssistantFab(active);

  /** Traduit un code d'erreur d'API agent, ou laisse passer le message brut. */
  const agentErrorMessage = useAgentErrorMessage();

  /**
   * Rafraîchit les runs de l'ancrage (issue OU run carnet) ET la liste globale des
   * sessions (page Agents). Cette liste ne poll QUE si une session travaille déjà —
   * sans invalidation explicite, lancer ou reprendre une run depuis la page la
   * laisse figée sur le statut de la run précédente jusqu'au prochain rechargement.
   */
  const refreshRuns = async (): Promise<void> => {
    await Promise.all([
      issueId
        ? queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) })
        : Promise.resolve(),
      noteRunId
        ? queryClient.invalidateQueries({ queryKey: agentRunQueryKey(noteRunId) })
        : Promise.resolve(),
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
  const [composing, setComposing] = useState(initialCompose);
  // Messages envoyés dont l'écho serveur n'est pas encore arrivé (bulles optimistes).
  const [pendingMessages, setPendingMessages] = useState<
    Array<{ text: string; mentions: AssistantMention[] }>
  >([]);
  // 1er message d'une session en cours de création : le POST de lancement fait les
  // pré-checks (dépôt, quota, modèle) avant de rendre la session, et pendant ce
  // temps il n'y a rien à afficher — le message a quitté le composer et n'existe
  // encore nulle part. On le tient ici pour le montrer tout de suite.
  const [launchText, setLaunchText] = useState<string | null>(null);
  const [launchMentions, setLaunchMentions] = useState<AssistantMention[]>([]);
  // Demande « créer la PR » envoyée : désactive le bouton le temps que l'agent
  // reparte (working) ou que la PR apparaisse. Remise à zéro par l'effet plus bas.
  const [requestingPr, setRequestingPr] = useState(false);
  // Vue diff de la session (Sheet par-dessus la conversation) : ouverte en
  // cliquant un fichier des blocs « fichiers changés », PR ou pas.
  const [diffOpen, setDiffOpen] = useState(false);
  // Le fichier par lequel on est entré : la vue s'ouvre DESSUS. Cliquer une
  // ligne pour atterrir en haut d'un diff de quarante fichiers, c'est arriver à
  // côté de ce qu'on a demandé. `null` quand l'entrée ne désigne rien (les deux
  // nombres de l'en-tête) — la vue s'ouvre alors normalement, en haut.
  const [diffFocus, setDiffFocus] = useState<string | null>(null);
  // La conversation suit ce que l'hôte désigne. Il n'y a plus de sélecteur de
  // runs ici pour lui disputer la main : ce que l'utilisateur choisit, il le
  // choisit dans la LISTE, et l'hôte nous le passe en prop.
  useEffect(() => {
    setSelectedId(initialRunId);
    setComposing(initialCompose);
  }, [initialRunId, initialCompose]);

  const { runs: issueRuns, loading: issueLoading } = useIssueAgentRunsQuery(
    active && issueId ? issueId : null,
  );
  // Session CARNET : un seul run, interrogé directement (il EST la session).
  const { run: noteRun, loading: noteLoading } = useAgentRunQuery(
    active && noteRunId ? noteRunId : null,
  );
  const runs = noteRunId ? (noteRun ? [noteRun] : []) : issueRuns;
  const loading = noteRunId ? noteLoading : issueLoading;
  // La run tout juste lancée est active mais pas encore dans `runs` : sans elle, on
  // proposerait « lancer un nouvel agent » sur une issue déjà occupée (→ 409).
  const knownRuns =
    launched && !runs.some((r) => r.id === launched.id) ? [launched, ...runs] : runs;

  const activeRun = knownRuns.find((r) => isAgentRunActive(r.status)) ?? null;
  // Résolution de la run affichée : celle désignée, sinon celle qui travaille,
  // sinon la DERNIÈRE run NON `failed` de l'issue — une conversation au repos se
  // POURSUIT (modèle conversationnel), elle ne retombe pas sur un composer vierge.
  // Une run `failed` (morte à l'amorçage) n'a ni fil ni composer : la prendre par
  // défaut ouvrirait une conversation morte sans action visible — on compose à la
  // place. Le repli ne sert plus qu'aux appelants SANS run désignée (la modal de
  // reprise) : la page Agents, elle, ouvre toujours le run de la ligne cliquée.
  const liveRun = composing
    ? null
    : selectedId
      ? knownRuns.find((r) => r.id === selectedId) ?? null
      : activeRun ?? knownRuns.find((r) => r.status !== "failed") ?? null;
  /**
   * Ce que le SERVEUR fait — la vérité des requêtes (polling du fil, du diff,
   * décision d'interrompre). À distinguer de `working`, qui est ce que
   * l'INTERFACE raconte : « stopper » ne fait que poser un drapeau, que la boucle
   * ne lit qu'à la frontière de son round, soit plusieurs secondes plus tard
   * (parfois bien plus, si elle est en plein appel au modèle). Pendant ce temps,
   * rien ne bougeait à l'écran : le bouton restait « stopper », le tour continuait
   * de compter, et on recliquait en croyant que ça n'avait pas marché.
   */
  const serverWorking = liveRun ? isAgentRunWorking(liveRun.status) : false;
  const [stopping, setStopping] = useState(false);
  const working = serverWorking && !stopping;
  // `runs` arrive trié du plus récent au plus ancien : runs[0] est la dernière run.
  // La run qu'on vient de lancer compte AUSSI comme la dernière : entre le POST et
  // l'arrivée du refetch, `runs` est encore la liste d'AVANT, et la comparer à
  // runs[0] désignerait la run précédente → on afficherait « run passée, composer
  // désactivé » sur la run que l'utilisateur vient de démarrer.
  const isLatest = liveRun ? knownRuns[0]?.id === liveRun.id : false;
  // Sa PR est fusionnée → run LIVRÉE : la réveiller pousserait sur une branche déjà
  // dans la base et rouvrirait un cycle de PR sur du travail fini (409 `prMerged`).
  const delivered = liveRun?.pr_state === "merged";
  // Le composer parle-t-il à cette run ? Oui même terminée (reprise à chaud) — seul
  // `failed` n'a rien à reprendre. Mais SEULE la dernière run est reprennable : les
  // runs d'une issue partagent la branche, et une run passée est restée sur un état
  // dépassé (son push serait rejeté). On la consulte ; pour continuer, on en lance
  // une nouvelle. Le serveur applique les mêmes règles (409 `supersededRun` /
  // `prMerged`).
  const steerable = liveRun
    ? isAgentRunResumable(liveRun.status) && isLatest && !delivered
    : false;

  // Question ask_user ACTIVE (MIN-86) : le dernier event significatif du fil est
  // une `question` (aucun message user ni résumé après) et l'agent est au repos,
  // steerable, sans réponse déjà en vol. La carte vivante remplace alors le
  // composer ; le feed masque la bulle correspondante. Même query react-query que
  // le feed (clé partagée) → aucune requête supplémentaire.
  const { events: liveEvents } = useAgentRunEventsQuery(
    liveRun?.id ?? null,
    serverWorking
  );

  /**
   * Ce que CETTE session a changé dans le dépôt, cumulé sur tous ses tours (union
   * des events `files_changed`, compteurs réels de git). C'est l'information que
   * portait la barre au-dessus du composer ; elle vit maintenant dans l'EN-TÊTE,
   * réduite à ses deux nombres — la liste des fichiers, elle, reste à un clic
   * (vue diff) et sous chaque réponse dans le fil.
   *
   * Aucune requête de plus : ce sont les events que le fil charge déjà.
   */
  const sessionFiles = useMemo(
    () => cumulativeBranchFiles(liveEvents).files,
    [liveEvents],
  );
  /**
   * LES MÊMES DEUX NOMBRES, MAIS PENDANT LE TOUR (MIN-266).
   *
   * `files_changed` n'est émis qu'en FIN de tour : tant que l'agent travaillait,
   * l'en-tête ne bougeait pas d'un chiffre — et au premier tour d'une session il
   * n'affichait rien du tout, alors que c'est exactement le moment où l'on veut
   * savoir ce qui est en train d'arriver au dépôt. Ce résumé-là est lu dans la
   * microVM (`git diff`, sans les patches) et avance donc avec le travail.
   *
   * Il ne tourne que pendant le tour ; au repos les events reprennent la main,
   * et ils sont déjà chargés.
   */
  const { files: liveDiffFiles } = useAgentRunDiffStatQuery(liveRun?.id ?? null, working);
  const sessionTotals = useMemo(
    // Le direct FAIT FOI dès qu'il a quelque chose : il contient tout ce que
    // portent les events (les commits des tours passés) PLUS le tour en cours.
    () => changeTotals(liveDiffFiles.length > 0 ? liveDiffFiles : sessionFiles),
    [liveDiffFiles, sessionFiles],
  );
  /**
   * Les sous-agents du tour en cours (MIN-112) → carte au-dessus du composer.
   * Lus sur les MÊMES events que le fil (clé react-query partagée) : aucune
   * requête de plus. Vide dès que l'agent est au repos — plus rien ne tourne, et
   * une carte qui resterait affichée dirait le contraire.
   */
  const subagents = useMemo(
    () => (working ? turnSubagents(liveEvents) : []),
    [liveEvents, working],
  );
  /**
   * La checklist du tour en cours (`update_plan`) → carte au-dessus du composer.
   * Mêmes events que le fil, aucune requête de plus. Vide dès que l'agent est au
   * repos, comme la carte des sous-agents : un plan qui reste affiché après la
   * réponse décrit un travail déjà rendu, juste au-dessus de l'input où l'on tape
   * la question suivante. Il revient dès que le nouveau tour en repose un.
   */
  const planSteps = useMemo(
    () => (working ? livePlan(liveEvents) : []),
    [liveEvents, working],
  );
  /**
   * LA CARTE DE QUESTIONS, ET LE TOUR N'EST PLUS FORCÉMENT FINI (MIN-364, D7).
   *
   * Sur la machine de l'utilisateur, `ask_user` SUSPEND le tour au lieu de le
   * terminer : le modèle attend, l'agent reste `running`, et l'event `question`
   * porte alors `blocking: true`. Exiger le repos ferait exactement le contraire
   * de ce qu'on veut — un composer désarmé face à un modèle qui attend une
   * réponse, et un tour qui ne repart que sur la deadline.
   *
   * Le repos reste exigé pour une question NON bloquante (le chemin microVM) :
   * là, la carte ne doit s'ouvrir qu'une fois le tour rangé, sinon elle
   * apparaîtrait le temps du push et de l'export du journal.
   */
  const activeQuestion = useMemo((): {
    eventId: string;
    questions: AskUserQuestion[];
    /** Le tour ATTEND cette réponse : y répondre ne relance rien, ça le dénoue. */
    blocking: boolean;
  } | null => {
    if (!liveRun || !steerable) return null;
    const ordered = [...liveEvents].sort((a, b) => a.seq - b.seq);
    // Réponse déjà en vol ? `pendingMessages` n'est JAMAIS purgée en cas de succès
    // (cf. lib/agent-pending.ts — la soustraction multi-ensemble en dépend) : on ne
    // compte que les envois SANS écho serveur, sinon le premier steering de la
    // session supprimerait la carte jusqu'au rechargement de la page.
    const echoed = ordered
      .filter((e) => e.type === "user_message")
      .map((e) => (typeof e.payload?.text === "string" ? e.payload.text : ""));
    if (liveRun.prompt?.trim()) echoed.push(liveRun.prompt);
    if (unechoedMessages(pendingMessages.map((message) => message.text), echoed).length > 0) {
      return null;
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const e = ordered[i];
      if (e.type === "user_message" || e.type === "summary") return null;
      if (e.type === "question") {
        const questions = parseAskUserQuestions(
          (e.payload ?? {}) as Record<string, unknown>
        );
        if (questions.length === 0) return null;
        const blocking = e.payload?.blocking === true;
        // Une question qui ne bloque pas a terminé son tour : tant que l'agent
        // travaille, ce qu'on voit à l'écran est le tour SUIVANT.
        if (working && !blocking) return null;
        return { eventId: e.id, questions, blocking };
      }
    }
    return null;
  }, [liveRun, working, steerable, pendingMessages, liveEvents]);
  // « Créer une pull request » a du sens quand la session est reprennable ET qu'aucune
  // PR n'existe encore : la barre de changements montre alors le bouton (si du travail
  // a été poussé). Sinon l'en-tête porte déjà « ouvrir la PR ».
  // Une session de RELECTURE n'a rien à livrer : elle n'écrit pas dans le dépôt
  // et n'a pas `create_pr`. Lui proposer le bouton enverrait à l'agent une
  // consigne qu'il ne peut que refuser.
  const canCreatePr =
    steerable && liveRun?.pr_number == null && liveRun?.pull_request_id == null;
  // Les fichiers des blocs « fichiers changés » ouvrent la vue diff de la session
  // DANS la conversation (note scratchpad : voir le diff pendant que l'agent
  // modifie, sans attendre la PR) — le Sheet montre le travail poussé, PR ou pas.
  //
  // STABLE (useCallback) : ce callback descend jusqu'aux blocs du fil, qui sont
  // mémoïsés. Recréé à chaque rendu, il les réveillerait tous à chaque poussée du
  // direct — soit quatre fois par seconde pendant que l'agent écrit.
  const openDiffSheet = useCallback(() => {
    setDiffFocus(null);
    setDiffOpen(true);
  }, []);
  const openDiffAt = useCallback((path: string) => {
    setDiffFocus(path);
    setDiffOpen(true);
  }, []);
  const openDiff = liveRun ? openDiffAt : undefined;

  // Changer de run vide les bulles optimistes : elles appartiennent à la
  // conversation qu'on quitte, pas à celle qu'on ouvre. `launchText` part avec :
  // la session lancée existe désormais et son prompt vient du serveur.
  useEffect(() => {
    setPendingMessages([]);
    setLaunchText(null);
    setRequestingPr(false);
    // L'arrêt demandé vaut pour la session qu'on quitte, pas pour celle qu'on ouvre.
    setStopping(false);
    // La vue diff appartient à la session qu'on quitte.
    setDiffOpen(false);
  }, [liveRun?.id]);

  // Le serveur a rattrapé l'arrêt — ou le tour s'est terminé de lui-même juste
  // après le clic : l'état optimiste n'a plus rien à couvrir. Il doit repartir,
  // sinon le tour SUIVANT (relancé par un message) s'afficherait au repos.
  useEffect(() => {
    if (!serverWorking) setStopping(false);
  }, [serverWorking]);

  // La demande de PR a « pris » dès que l'agent repart (working) ou que la PR existe :
  // on réactive le bouton (il disparaîtra de lui-même via `canCreatePr`).
  useEffect(() => {
    if (working || liveRun?.pr_number != null) setRequestingPr(false);
  }, [working, liveRun?.pr_number]);

  // Un tour qui se termine émet ses DERNIERS events (résumé + `files_changed`) juste
  // avant de passer `completed` : le polling à 2 s s'arrête dès que le statut n'est
  // plus « travaille » et peut donc les manquer. On refetch une fois au passage
  // travail → repos pour que le bloc de fichiers settled et le bouton PR arrivent sans
  // attendre un remontage. Même raison pour le diff de la session : le push final du
  // tour arrive à cet instant, une vue diff ouverte doit le refléter sans re-poll.
  //
  // Sur le SERVEUR, et pas sur ce que l'interface affiche : un arrêt optimiste
  // fait passer `working` à faux des secondes avant que le tour ne rende ses
  // derniers events, et c'est justement eux qu'on vient chercher ici.
  const wasWorkingRef = useRef(serverWorking);
  useEffect(() => {
    const runId = liveRun?.id;
    if (wasWorkingRef.current && !serverWorking && runId) {
      void queryClient.invalidateQueries({ queryKey: ["agent-run-events", runId] });
      void queryClient.invalidateQueries({ queryKey: agentRunDiffQueryKey(runId) });
    }
    wasWorkingRef.current = serverWorking;
  }, [serverWorking, liveRun?.id, queryClient]);

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
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  // Branche de BASE (phase compose, lignée neuve) : "" = le défaut du dépôt.
  // Comme le modèle, le choix ne se fait qu'au lancement — figée ensuite.
  const [baseBranch, setBaseBranch] = useState("");
  // Niveau de raisonnement (MIN-122), figé au lancement lui aussi. `null` = pas
  // encore touché → on suit le défaut perso, qui peut arriver après le montage.
  const [reasoningOverride, setReasoningOverride] = useState<ReasoningLevel | null>(null);
  // Les paliers du MODÈLE qui va tourner (override choisi, sinon défaut perso,
  // sinon défaut du provider) : ce que le sélecteur liste dépend de lui, et le
  // niveau affiché est rabattu sur ce qu'il accepte.
  const reasoningLevels = useReasoningLevelsFor(model || defaultModel || providerDefaultModel);
  const reasoningLevel = nearestReasoningLevel(
    reasoningOverride ?? defaultReasoningLevel,
    reasoningLevels,
  );
  const [launching, setLaunching] = useState(false);
  // Seul un BYOK générique sans défaut résoluble impose de choisir un modèle.
  const modelRequired = provider === "generic" && !defaultModel && !model;

  // OÙ LA CONVERSATION TOURNE (MIN-359), figé au lancement comme ses trois
  // voisins. Le chip n'existe que dans l'app de bureau ET quand un dossier est
  // attaché à ce projet sur CETTE machine : ailleurs, il n'y a pas de choix à
  // offrir, et un chip grisé promettrait une bascule qui n'existe pas.
  const localRepo = useLocalRepo(projectId);

  /**
   * LE TOUR LOCAL PART D'ICI (MIN-293), et un refus se DIT.
   *
   * Un tour local qui ne démarre pas est la panne la plus silencieuse du
   * chantier : la conversation s'ouvre, le fil attend, et rien n'arrive. Le
   * message vient du lanceur — il nomme le geste qui répare (attacher un
   * dossier, installer Node, mettre l'app à jour).
   */
  const playHere = async (runId: string, local: boolean | undefined) => {
    const result = await playLocalRunHere(runId, local);
    if (result && !result.ok) toast.error(result.message);
  };
  const [environment, setEnvironment] = useState<AgentEnvironment>("cloud");
  // Le dossier a disparu sous l'attachement (déplacé, disque démonté, dépôt
  // re-lié) : on retombe sur le cloud plutôt que de lancer vers un chemin mort.
  useEffect(() => {
    if (!localRepo.ready) setEnvironment("cloud");
  }, [localRepo.ready]);

  const launch = async (message: string, _attachments: unknown[] = [], mentions: AssistantMention[] = []) => {
    // La phase compose n'existe que pour un ancrage ISSUE (celui des sessions
    // sans ticket vit dans SessionCompose, avant toute run) : sans issue, rien
    // à lancer ici.
    if (launching || !issueId) return;
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    const prompt = message.trim();
    setLaunching(true);
    // Affichage OPTIMISTE du 1er message, comme pour un follow-up : le POST enchaîne
    // les pré-checks (issue, dépôt, quota, résolution du modèle) avant de rendre la
    // session, et pendant ce temps le message n'existe nulle part — ni dans le
    // composer (vidé à l'envoi), ni dans le fil (aucune session à afficher).
    if (prompt) setLaunchText(prompt);
    setLaunchMentions(mentions);
    try {
      const { run: started } = await launchAgentRunApi(issueId, {
        prompt: prompt || undefined,
        model: model || undefined,
        // Le serveur l'ignore si la lignée hérite déjà d'une branche (le picker
        // est alors verrouillé — ceinture et bretelles côté course).
        baseBranch: baseBranch || undefined,
        reasoningLevel,
        intent: composeIntent,
        mentions,
        // `ready` et pas seulement l'état du chip : entre le choix et l'envoi,
        // le dossier a pu disparaître.
        localExec: environment === "local" && localRepo.ready,
      });
      // La session neuve devient la session ouverte → bascule live immédiate. Son
      // `prompt` porte le même texte : le fil affiche la MÊME bulle, sans coupure.
      setLaunched(started);
      setSelectedId(started.id);
      setComposing(false);
      onLaunched?.(started);
      // LE TOUR PART SUR CETTE MACHINE (MIN-293), et c'est ici que ça se décide :
      // le drain laisse les runs locaux tranquilles, donc sans cet appel le run
      // resterait `queued` sans que personne le joue — et sans un mot pour le
      // dire. `started.local_exec` et non le chip : le serveur revalide la
      // demande, et un run refusé pour sa nature repart dans le cloud.
      await playHere(started.id, started.local_exec);
      await refreshRuns();
    } catch (err) {
      // Refusé (quota, pas de dépôt, une session tourne déjà…) : la session n'existe
      // pas → on retire la bulle plutôt que de laisser croire au lancement.
      setLaunchText(null);
      setLaunchMentions([]);
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  // Message au repos : poursuit la conversation (nouveau tour dans le même contexte).
  const steer = async (message: string, mentions: AssistantMention[] = []) => {
    if (!liveRun) return;
    const text = message.trim();
    if (!text) return;
    // Affichage OPTIMISTE : la bulle ne reviendrait du serveur qu'au drainage de la
    // boucle (réveil de sandbox compris, plusieurs secondes) — d'ici là l'utilisateur
    // aurait l'impression d'avoir tapé dans le vide. Le feed la retire dès que son
    // écho arrive. En cas d'échec, on la retire nous-mêmes (le message n'existe pas).
    setPendingMessages((p) => [...p, { text, mentions }]);
    try {
      await steerAgentRunApi(liveRun.id, text, mentions);
      // Un message au repos REMET le run en file : le tour suivant a besoin du
      // même coup de pouce que le premier (cf. `playLocalRunHere`).
      await playHere(liveRun.id, liveRun.local_exec);
      await Promise.all([
        refreshRuns(),
        queryClient.invalidateQueries({ queryKey: ["agent-run-events", liveRun.id] }),
      ]);
    } catch (err) {
      // Refusé (PR fusionnée, run dépassée, course avec une run plus récente lancée
      // dans un autre onglet…) : le message n'existe nulle part → on retire sa bulle
      // plutôt que de laisser croire qu'il est parti.
      setPendingMessages((p) => {
        const i = p.findIndex((message) => message.text === text);
        return i === -1 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
      toast.error(agentErrorMessage(err));
    }
  };

  // Interrompt la réponse en cours du modèle ; la session revient au repos.
  //
  // L'interface s'arrête AU CLIC (`stopping`), sans attendre que le serveur ait
  // pris le drapeau : le bouton redevient « envoyer », le tour se replie sur sa
  // durée. Ce n'est pas un mensonge sur ce qui se passe côté machine — le tour
  // s'arrêtera bel et bien, et s'il conclut entre-temps son résumé prend la place
  // de tout ça — c'est un accusé de réception, la seule chose qui manquait.
  const interrupt = async () => {
    if (!liveRun) return;
    setStopping(true);
    try {
      await interruptAgentRunApi(liveRun.id);
      await refreshRuns();
    } catch (err) {
      // Refusé (réseau, session disparue) : le tour continue → on rend la main au
      // bouton plutôt que de laisser l'interface prétendre qu'il s'est arrêté.
      setStopping(false);
      toast.error((err as Error).message);
    }
  };

  // Envoi depuis le composer live. Si l'agent TRAVAILLE : on met d'abord le message
  // en file PUIS on interrompt → le tour en cours s'arrête et reprend en traitant
  // ce message en priorité (steering). Au repos : simple relance.
  //
  // SAUF QUAND LE TOUR ATTEND UNE RÉPONSE (MIN-364, D7) : le message n'est alors
  // pas du steering, il DÉNOUE le tool `question` sur lequel le round est
  // suspendu. Le harness le reconnaît de toute façon (`pendingQuestion`, cf.
  // supervisor.ts) et consomme le drapeau d'arrêt sans le jouer ; ne pas l'envoyer
  // du tout évite simplement de demander l'arrêt de ce qu'on vient de débloquer.
  const sendLive = async (
    message: string,
    _attachments: unknown[] = [],
    mentions: AssistantMention[] = [],
    opts: { answersBlockingQuestion?: boolean } = {},
  ) => {
    const text = message.trim();
    if (!text) return;
    await steer(text, mentions);
    if (opts.answersBlockingQuestion) return;
    // Sur ce que fait le SERVEUR, pas sur ce que l'interface montre : un arrêt
    // déjà demandé mais pas encore pris laisse le tour tourner, et le message
    // doit quand même le couper.
    if (serverWorking) await interrupt();
  };

  // « Créer une pull request » (note MIN-46) : on n'ouvre PAS la PR nous-mêmes — on
  // INJECTE un message qui le demande à l'agent, qui l'ouvre via son tool `create_pr`
  // et itère ensuite dessus comme sur n'importe quelle consigne. Le bouton n'apparaît
  // qu'au repos sans PR (cf. `canCreatePr`), donc un simple steer suffit.
  const createPr = async () => {
    if (!liveRun || requestingPr) return;
    setRequestingPr(true);
    await steer(t("createPrPrompt"));
  };

  // Run introuvable / pas encore chargé → spinner, jamais de compose : le run
  // existe forcément (une conversation naît d'un lancement), il n'est pas encore
  // arrivé. Vaut pour un run carnet comme pour un run DÉSIGNÉ par l'appelant
  // (`initialRunId`) — sans ce cas, la conversation qu'on vient d'ouvrir depuis la
  // liste clignotait en composer vierge le temps que la requête réponde.
  const phase: "live" | "loading" | "compose" = liveRun
    ? "live"
    : loading || noteRunId || (selectedId && !composing)
      ? "loading"
      : "compose";

  // Travail dont la prochaine run froide héritera — miroir EXACT de
  // `inheritableWorkForIssue` : la lignée est indexée sur la BRANCHE (la création
  // de PR est optionnelle). Run la plus récente avec une branche ; mergée → rien à
  // hériter (branche neuve). Surtout pas « la plus récente non fusionnée » : on
  // promettrait d'itérer sur une vieille lignée que le serveur ne touchera pas.
  const latestWorkRun = runs.find((r) => r.branch_name != null) ?? null;
  const inheritedWork =
    latestWorkRun && latestWorkRun.pr_state !== "merged" ? latestWorkRun : null;

  /**
   * Actions de la session, à gauche de celles de l'hôte (le lien vers la pull
   * request) : ce que la session a changé, puis — s'il n'y a pas encore de PR — de
   * quoi la demander. Les deux vivaient dans une barre au-dessus du composer, qui
   * grandissait à chaque fichier touché et poussait l'input sous les doigts.
   *
   * Le diff est le PREMIER de la grappe, et la grappe est collée à droite : ses
   * nombres s'allongent donc vers la GAUCHE, sans jamais déplacer le bouton de PR.
   */
  const sessionActions =
    liveRun && (sessionFiles.length > 0 || liveDiffFiles.length > 0) ? (
      <>
        {sessionTotals.additions > 0 || sessionTotals.deletions > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openDiffSheet}
                className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{sessionTotals.additions}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  −{sessionTotals.deletions}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("diffTitle")}</TooltipContent>
          </Tooltip>
        ) : null}
        {/* Du travail poussé, aucune PR, et l'agent est au repos : c'est le moment
            de la proposer. Pendant qu'il travaille, non — le tour en cours pousse
            encore, et la demande partirait sur un état qui bouge. */}
        {canCreatePr && !working ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={requestingPr}
            onClick={() => void createPr()}
          >
            <GitPullRequest className="size-3.5" />
            {t("createPullRequest")}
          </Button>
        ) : null}
      </>
    ) : null;

  return (
    <MentionLinksProvider value={links}>
      <div className="flex h-full flex-col overflow-hidden">
      {/* En-tête : bloc de gauche fourni par l'hôte (défaut : modèle de la session en
          live / issue ciblée en compose) + actions à droite. Sans bordure : le fil
          respire jusqu'en haut, et l'en-tête ne se lit pas comme une barre séparée.
          Bas volontairement plus serré que le haut (`pb-2.5`) : l'espace sous le
          titre est déjà donné par le `pt-3` de la barre de sessions juste dessous. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2.5">
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

        {sessionActions || headerActions ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {sessionActions}
            {headerActions}
          </div>
        ) : null}
      </div>

      {/* Fil : flux d'événements (live), lancement en vol, spinner ou intro. */}
      <div className="min-h-0 flex-1">
        {phase === "live" && liveRun ? (
          <AgentEventFeed
            runId={liveRun.id}
            status={liveRun.status}
            stopping={stopping}
            prompt={liveRun.prompt}
            promptMentions={liveRun.prompt_mentions}
            pendingUserMessages={pendingMessages}
            onOpenFile={openDiff}
            hiddenQuestionEventId={activeQuestion?.eventId}
            localExec={liveRun.local_exec === true}
            className="h-full py-4"
          />
        ) : launchText ? (
          // Session en cours de création : pas encore de session à interroger, mais
          // le MÊME fil, qui n'affiche que la bulle du 1er message + « travaille ».
          // Réutiliser le feed (plutôt qu'une bulle ad hoc) garantit qu'au moment où
          // la session prend le relais, la bulle ne bouge pas d'un pixel.
          <AgentEventFeed
            runId={null}
            status="queued"
            pendingUserMessages={[{ text: launchText, mentions: launchMentions }]}
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
              {/* Une run froide part d'un contexte vierge, mais reprend la lignée
                  du ticket (branche, et PR si une existe) : on l'annonce, sinon
                  « nouvel agent » laisse craindre de repartir de zéro et de perdre
                  le travail déjà poussé. */}
              {inheritedWork
                ? inheritedWork.pr_number != null
                  ? t("composeInheritsPr", { number: inheritedWork.pr_number })
                  : t("composeInheritsBranch")
                : t("dialogDescription")}
            </p>
          </div>
        )}
      </div>

      {/* Composer : steering/interruption (live) ou lancement pré-écrit (compose).
          Borné à la même largeur max que le fil et centré. Sur la PAGE Agents il
          se pose juste au-dessus de la barre de navigation mobile, donc dans le
          dégradé qu'elle projette : `dock-above-nav` l'en sort (cf. globals.css).
          Dans la modal, la classe ne coûte rien — le Sheet est son propre
          contexte d'empilement. */}
      {phase !== "loading" && (
        <div className="dock-above-nav shrink-0">
          <div className="mx-auto w-full max-w-[800px]">
          {/* Ce qui s'intercale entre le fil et le composer tient sur UNE ligne,
              de hauteur fixe, repliée. La barre « fichiers changés » vivait ici :
              elle grandissait d'une ligne à chaque fichier touché et faisait
              descendre l'input pendant qu'on écrivait. Ce qu'elle disait est passé
              dans l'EN-TÊTE (les deux nombres du diff, et la demande de pull
              request), où rien ne bouge. Le détail par tour, lui, est resté dans le
              fil, sous la réponse qui l'a produit.
              Ce qui reprend la place, ce sont les deux choses que le fil dit MAL :
              le plan, qu'il pose une fois et laisse remonter hors de l'écran alors
              qu'on le consulte tout du long ; et les sous-agents, pendant lesquels
              le parent attend et n'émet plus rien du tout. Le plan d'abord, les
              sous-agents ensuite : du plus durable au plus fugace, l'éphémère au
              contact de l'input. */}
          {liveRun ? <PlanActivityBar steps={planSteps} /> : null}
          {liveRun && subagents.some((s) => !s.endedAt) ? (
            <SubagentActivityBar subagents={subagents} />
          ) : null}
          {/* Question active : la carte prend la PLACE du composer (pattern
              Claude Code/Codex). Le ChatInput reste MONTÉ, masqué en CSS — le
              brouillon de l'utilisateur survit et réapparaît après la réponse. */}
          {liveRun && activeQuestion ? (
            <div className="pb-3">
              <AskUserCard
                key={activeQuestion.eventId}
                questions={activeQuestion.questions}
                onAnswer={(text) =>
                  void sendLive(text, [], [], {
                    answersBlockingQuestion: activeQuestion.blocking,
                  })
                }
                onSkip={() =>
                  void sendLive(tToolCall("skippedQuestions"), [], [], {
                    answersBlockingQuestion: activeQuestion.blocking,
                  })
                }
              />
            </div>
          ) : null}
          {liveRun ? (
            <div className={cn(activeQuestion && "hidden")}>
              <ChatInput
              key={liveRun.id}
                onSend={(message, attachments, mentions) =>
                  void sendLive(message, attachments, mentions)
                }
              onAbort={() => void interrupt()}
              isStreaming={working}
              sendWhileStreaming
                beam={working}
                disabled={!steerable}
                hideAttach
                mentionables={mentionables}
                onMentionQuery={onMentionQuery}
                placeholder={
                steerable
                  ? working
                    ? t("livePlaceholder")
                    : t("restPlaceholder")
                  : delivered
                    ? // Travail livré : on ne rouvre pas un cycle de PR dessus.
                      t("mergedRunPlaceholder")
                    : // Run passée : consultation seule (une run plus récente a
                      // repris la branche). Sinon : run `failed`, rien à reprendre.
                      isLatest
                      ? t("endedPlaceholder")
                      : t("pastRunPlaceholder")
              }
              leadingControls={
                <>
                  {/* Modèle figé pour la session : picker verrouillé + tooltip. */}
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
                  {/* Niveau de raisonnement, figé au lancement comme le modèle. */}
                  <ReasoningCombobox
                    value={liveRun.reasoning_level ?? "off"}
                    onChange={() => {}}
                    disabled
                    disabledTooltip={t("reasoningLocked")}
                  />
                  {/* Branche copiée au lancement, figée elle aussi pour la session.
                      Dès que la branche de travail est stampée (`branch_name`), le
                      chip se dédouble en « origine → branche de session » pour
                      montrer où l'agent pousse réellement. */}
                  <BranchCombobox
                    issueId={issueId}
                    value=""
                    onChange={() => {}}
                    defaultLabel={t("branchDefault")}
                    defaultHint={t("branchDefaultHint")}
                    placeholder={t("branchSearchPlaceholder")}
                    emptyLabel={t("branchSearchEmpty")}
                    loadingLabel={t("branchSearchLoading")}
                    disabled
                    disabledTooltip={t("branchLocked")}
                    lockedBranch={liveRun.base_branch}
                    workBranch={liveRun.branch_name}
                    workBranchTooltip={
                      liveRun.branch_name
                        ? t("branchSessionLocked", {
                            origin: liveRun.base_branch ?? t("branchDefault"),
                            branch: liveRun.branch_name,
                          })
                        : undefined
                    }
                  />
                  {/* L'environnement, figé pour la conversation (MIN-359) — et
                      le seul des quatre chips qui ne se montre que s'il vaut
                      autre chose que le défaut : sur les milliers de runs cloud,
                      un chip « dans le cloud » n'apprend rien à personne. */}
                  {liveRun.local_exec ? (
                    <EnvironmentCombobox
                      value="local"
                      onChange={() => {}}
                      disabled
                      disabledTooltip={t("environmentLocked")}
                    />
                  ) : null}
                </>
              }
              />
            </div>
          ) : (
            <ChatInput
              key="compose"
              onSend={(message, attachments, mentions) =>
                void launch(message, attachments, mentions)
              }
              mentionables={mentionables}
              onMentionQuery={onMentionQuery}
              disabled={launching}
              hideAttach
              initialValue={initialComposeText}
              placeholder={t("composePlaceholder")}
              leadingControls={
                <>
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
                  <ReasoningCombobox
                    value={reasoningLevel}
                    onChange={setReasoningOverride}
                    disabled={launching}
                    levels={reasoningLevels}
                  />
                  {/* Branche que l'agent COPIE pour son espace de travail. Choix
                      possible seulement ici (au lancement) et seulement pour une
                      lignée NEUVE : quand la session hérite d'une branche
                      existante, sa base ne se rechoisit pas — chip verrouillé. */}
                  <BranchCombobox
                    issueId={issueId}
                    value={baseBranch}
                    onChange={setBaseBranch}
                    defaultLabel={t("branchDefault")}
                    defaultHint={t("branchDefaultHint")}
                    placeholder={t("branchSearchPlaceholder")}
                    emptyLabel={t("branchSearchEmpty")}
                    loadingLabel={t("branchSearchLoading")}
                    disabled={launching || inheritedWork != null}
                    disabledTooltip={inheritedWork ? t("branchInherited") : undefined}
                    lockedBranch={inheritedWork?.base_branch}
                  />
                  {/* Où le tour part (MIN-359). Rendu SEULEMENT quand un dossier
                      est attaché à ce projet sur cette machine : dans un
                      navigateur, ou pour un membre qui n'a rien attaché, le
                      choix n'existe pas et il ne doit rien y avoir à lire. */}
                  {localRepo.state ? (
                    <EnvironmentCombobox
                      value={environment}
                      onChange={setEnvironment}
                      folder={
                        localRepo.state.status === "ready" ? localRepo.state.folder : null
                      }
                      needsAttach={localRepo.state.status !== "ready"}
                      onAttach={() => {
                        void localRepo.attach().then((next) => {
                          if (next?.status === "ready") setEnvironment("local");
                          else if (next && next.status === "invalid") {
                            toast.error(t(LOCAL_REPO_ERROR_KEYS[next.reason]));
                          }
                        });
                      }}
                      disabled={launching || localRepo.busy}
                    />
                  ) : null}
                </>
              }
            />
          )}
          </div>
        </div>
      )}

      {/* Vue diff de la session : Sheet par-dessus la conversation, alimentée par
          le diff vivant du run (PR ou compare de branche). Montée dès qu'une
          session est ouverte — la query ne part qu'à l'ouverture. */}
      {liveRun ? (
        <AgentDiffSheet
          runId={liveRun.id}
          open={diffOpen}
          onOpenChange={setDiffOpen}
          focusPath={diffFocus}
          // Le vrai statut : c'est lui qui cadence le rafraîchissement du diff, et
          // le tour pousse encore pendant les secondes qui suivent l'arrêt demandé.
          working={serverWorking}
          baseBranch={liveRun.base_branch}
          branchName={liveRun.branch_name}
        />
      ) : null}
      </div>
    </MentionLinksProvider>
  );
}
