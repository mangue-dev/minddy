"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Spinner, toast } from "mangue-ui";
import { NumoIcon } from "@/components/numo-icon";
import { ChatInput } from "@/components/assistant/chat-input";
import {
  heartbeatAgentRunApi,
  interruptAgentRunApi,
  isAgentRunActive,
  isAgentRunResumable,
  isAgentRunUnread,
  isAgentRunWorking,
  launchAgentRunApi,
  steerAgentRunApi,
  type AgentRunSummary,
} from "@/lib/agent-api";
import {
  agentRunQueryKey,
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
  useAgentRunQuery,
  useIssueAgentRunsQuery,
} from "@/lib/use-agent-runs";
import { useAgentReads } from "@/lib/use-agent-reads";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { ModelBadge } from "@/components/model-badge";
import { ModelCombobox } from "./model-combobox";
import { BranchCombobox } from "./branch-combobox";
import { AgentEventFeed } from "./agent-event-feed";
import { AgentRunHistory } from "./agent-run-history";
import { AgentChangesBar } from "./agent-changes-bar";

/** Codes d'erreur bruts des routes agent (lancement ET reprise) → clés i18n Agent. */
const AGENT_ERROR_KEYS: Record<string, string> = {
  noRepo: "errorNoRepo",
  unsupportedProvider: "errorUnsupportedProvider",
  alreadyRunning: "errorAlreadyRunning",
  quotaExceeded: "errorQuotaExceeded",
  noModelForProvider: "errorNoModelForProvider",
  supersededRun: "errorSupersededRun",
  prMerged: "errorPrMerged",
};

/**
 * Cœur réutilisable de la conversation de l'agent de code (MIN-46 + MIN-68), extrait
 * de la modal pour être hébergé aussi bien dans le `Sheet` flottant (AgentChatModal)
 * que DIRECTEMENT dans la page Agents (liste/détail, sans modal).
 *
 * Une issue porte une SUITE de sessions, dont une seule peut TRAVAILLER à la fois.
 * Ce composant tient les deux modes, qui se distinguent par le POINT D'ENTRÉE :
 *
 *  • CHAUD (`live`) — LE MODE PAR DÉFAUT dès qu'une session existe : on ouvre la
 *    dernière session de l'issue (ou celle choisie dans le sélecteur) ; le fil est
 *    son flux d'événements et le composer lui parle DIRECTEMENT (`/steer`), dans
 *    son contexte. Au repos, la conversation se POURSUIT ainsi, naturellement —
 *    comme un chat.
 *  • FROID (`compose`) — aucune session sur l'issue, ou « Lancer un nouvel agent »
 *    explicitement demandé : composer VIERGE (l'utilisateur dit ce qu'il veut, pas
 *    de but pré-écrit) + picker de modèle. Envoyer lance une session NEUVE, qui
 *    héritera côté serveur de la branche/PR de l'issue.
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
  noteRunId = null,
  initialRunId = null,
  initialCompose = false,
  active = true,
  headerTitle,
  headerActions,
  onLaunched,
  initialComposeText,
  showUnread = false,
}: {
  /** Issue d'ancrage — null pour une session CARNET (passer `noteRunId`). */
  issueId?: string | null;
  /** Identifiant lisible (MIN-42) — affiché dans l'en-tête en phase compose. */
  issueIdentifier?: string;
  /**
   * Session CARNET (MIN-84) : le run EST la session — conversation d'UN run,
   * sans historique d'issue ni phase compose (le run existe déjà ; le compose
   * carnet vit dans NoteCompose, avant toute run).
   */
  noteRunId?: string | null;
  /**
   * Ouvre CETTE run (le panneau d'issue et la page Agents désignent la dernière).
   * Absent → on ouvre la session qui TRAVAILLE, à défaut la DERNIÈRE session de
   * l'issue (la conversation se poursuit), et sans aucune session on compose.
   */
  initialRunId?: string | null;
  /**
   * Force la phase compose à l'ouverture (« Lancer un NOUVEL agent ») même si
   * l'issue a déjà des sessions au repos.
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
   * Marque les runs terminées non consultées d'une bulle bleue dans le sélecteur de
   * sessions (page Agents). Hors /agents (ex. modal de reprise), laissé à false.
   */
  showUnread?: boolean;
}) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();
  const router = useRouter();

  /** Traduit un code d'erreur d'API agent, ou laisse passer le message brut. */
  const agentErrorMessage = (err: unknown): string => {
    const msg = (err as Error).message;
    const key = AGENT_ERROR_KEYS[msg];
    return key ? t(key) : msg;
  };

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
  const [pendingMessages, setPendingMessages] = useState<string[]>([]);
  // 1er message d'une session en cours de création : le POST de lancement fait les
  // pré-checks (dépôt, quota, modèle) avant de rendre la session, et pendant ce
  // temps il n'y a rien à afficher — le message a quitté le composer et n'existe
  // encore nulle part. On le tient ici pour le montrer tout de suite.
  const [launchText, setLaunchText] = useState<string | null>(null);
  // Demande « créer la PR » envoyée : désactive le bouton le temps que l'agent
  // reparte (working) ou que la PR apparaisse. Remise à zéro par l'effet plus bas.
  const [requestingPr, setRequestingPr] = useState(false);
  // L'utilisateur a explicitement choisi une session ou ouvert le composer : les
  // props ne reprennent plus la main. Sans ce garde, un changement d'`initialRunId`
  // (le représentant de l'issue bouge — ex. un coéquipier lance une run, le poll la
  // fait remonter) écraserait sa sélection ou jetterait le brouillon en cours de
  // frappe dans le composer.
  const userOverrodeRef = useRef(false);
  useEffect(() => {
    if (userOverrodeRef.current) return;
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

  // Bulles bleues du sélecteur de sessions (page Agents) : runs terminées après la
  // dernière consultation de la session. Réactif — le mark-read différé de la page
  // les efface. Hors /agents (`showUnread=false`), aucun suivi.
  const { reads } = useAgentReads();
  const unreadRunIds =
    showUnread && issueId
      ? new Set(
          knownRuns.filter((r) => isAgentRunUnread(r, reads[issueId])).map((r) => r.id),
        )
      : undefined;
  const activeRun = knownRuns.find((r) => isAgentRunActive(r.status)) ?? null;
  // Résolution de la session affichée : celle désignée, sinon celle qui travaille,
  // sinon la DERNIÈRE session NON `failed` de l'issue — une conversation au repos
  // se POURSUIT (modèle conversationnel), elle ne retombe plus sur un composer
  // vierge. Une run `failed` (morte à l'amorçage) n'a ni fil ni composer : la
  // prendre par défaut ouvrirait une conversation morte sans action visible — on
  // compose à la place (elle reste consultable via le sélecteur de sessions).
  const liveRun = composing
    ? null
    : selectedId
      ? knownRuns.find((r) => r.id === selectedId) ?? null
      : activeRun ?? knownRuns.find((r) => r.status !== "failed") ?? null;
  const working = liveRun ? isAgentRunWorking(liveRun.status) : false;
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
  // « Créer une pull request » a du sens quand la session est reprennable ET qu'aucune
  // PR n'existe encore : la barre de changements montre alors le bouton (si du travail
  // a été poussé). Sinon l'en-tête porte déjà « ouvrir la PR ».
  const canCreatePr = steerable && liveRun?.pr_number == null;
  // Une PR existe → les fichiers des blocs de diff mènent à sa vue diff in-app.
  const openPrFile =
    liveRun && liveRun.pr_number != null
      ? () => router.push(`/pull-requests?run=${liveRun.id}`)
      : undefined;

  // Changer de run vide les bulles optimistes : elles appartiennent à la
  // conversation qu'on quitte, pas à celle qu'on ouvre. `launchText` part avec :
  // la session lancée existe désormais et son prompt vient du serveur.
  useEffect(() => {
    setPendingMessages([]);
    setLaunchText(null);
    setRequestingPr(false);
  }, [liveRun?.id]);

  // La demande de PR a « pris » dès que l'agent repart (working) ou que la PR existe :
  // on réactive le bouton (il disparaîtra de lui-même via `canCreatePr`).
  useEffect(() => {
    if (working || liveRun?.pr_number != null) setRequestingPr(false);
  }, [working, liveRun?.pr_number]);

  // Un tour qui se termine émet ses DERNIERS events (résumé + `files_changed`) juste
  // avant de passer `completed` : le polling à 2 s s'arrête dès que le statut n'est
  // plus « travaille » et peut donc les manquer. On refetch une fois au passage
  // travail → repos pour que le bloc de fichiers settled et le bouton PR arrivent sans
  // attendre un remontage.
  const wasWorkingRef = useRef(working);
  useEffect(() => {
    const runId = liveRun?.id;
    if (wasWorkingRef.current && !working && runId) {
      void queryClient.invalidateQueries({ queryKey: ["agent-run-events", runId] });
    }
    wasWorkingRef.current = working;
  }, [working, liveRun?.id, queryClient]);

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
  // Branche de BASE (phase compose, lignée neuve) : "" = le défaut du dépôt.
  // Comme le modèle, le choix ne se fait qu'au lancement — figée ensuite.
  const [baseBranch, setBaseBranch] = useState("");
  const [launching, setLaunching] = useState(false);
  // Seul un BYOK générique sans défaut résoluble impose de choisir un modèle.
  const modelRequired = provider === "generic" && !defaultModel && !model;

  const launch = async (message: string) => {
    // La phase compose n'existe que pour un ancrage ISSUE (le compose carnet vit
    // dans NoteCompose, avant toute run) : sans issue, rien à lancer ici.
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
    try {
      const { run: started } = await launchAgentRunApi(issueId, {
        prompt: prompt || undefined,
        model: model || undefined,
        // Le serveur l'ignore si la lignée hérite déjà d'une branche (le picker
        // est alors verrouillé — ceinture et bretelles côté course).
        baseBranch: baseBranch || undefined,
      });
      // La session neuve devient la session ouverte → bascule live immédiate. Son
      // `prompt` porte le même texte : le fil affiche la MÊME bulle, sans coupure.
      setLaunched(started);
      setSelectedId(started.id);
      setComposing(false);
      onLaunched?.(started);
      await refreshRuns();
    } catch (err) {
      // Refusé (quota, pas de dépôt, une session tourne déjà…) : la session n'existe
      // pas → on retire la bulle plutôt que de laisser croire au lancement.
      setLaunchText(null);
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  // Message au repos : poursuit la conversation (nouveau tour dans le même contexte).
  const steer = async (message: string) => {
    if (!liveRun) return;
    const text = message.trim();
    if (!text) return;
    // Affichage OPTIMISTE : la bulle ne reviendrait du serveur qu'au drainage de la
    // boucle (réveil de sandbox compris, plusieurs secondes) — d'ici là l'utilisateur
    // aurait l'impression d'avoir tapé dans le vide. Le feed la retire dès que son
    // écho arrive. En cas d'échec, on la retire nous-mêmes (le message n'existe pas).
    setPendingMessages((p) => [...p, text]);
    try {
      await steerAgentRunApi(liveRun.id, text);
      await Promise.all([
        refreshRuns(),
        queryClient.invalidateQueries({ queryKey: ["agent-run-events", liveRun.id] }),
      ]);
    } catch (err) {
      // Refusé (PR fusionnée, run dépassée, course avec une run plus récente lancée
      // dans un autre onglet…) : le message n'existe nulle part → on retire sa bulle
      // plutôt que de laisser croire qu'il est parti.
      setPendingMessages((p) => {
        const i = p.indexOf(text);
        return i === -1 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
      });
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

  // « Créer une pull request » (note MIN-46) : on n'ouvre PAS la PR nous-mêmes — on
  // INJECTE un message qui le demande à l'agent, qui l'ouvre via son tool `create_pr`
  // et itère ensuite dessus comme sur n'importe quelle consigne. Le bouton n'apparaît
  // qu'au repos sans PR (cf. `canCreatePr`), donc un simple steer suffit.
  const createPr = async () => {
    if (!liveRun || requestingPr) return;
    setRequestingPr(true);
    await steer(t("createPrPrompt"));
  };

  // Session carnet introuvable / pas encore chargée → spinner, jamais de compose
  // (le run existe forcément : la session est née d'un lancement).
  const phase: "live" | "loading" | "compose" = liveRun
    ? "live"
    : loading || noteRunId
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

  return (
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

        {headerActions ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>
        ) : null}
      </div>

      {/* Historique : navigation entre les runs successives de l'issue. « Lancer un
          nouvel agent » n'y figure que si aucune run n'est active. La barre se
          décolle de l'en-tête (`pt-3`) — sans quoi elle touche sa bordure sur la
          page Agents et se lit comme une partie de l'en-tête plutôt que du fil.
          Session CARNET : un seul run, pas de lignée — aucune barre. */}
      {phase !== "loading" && !noteRunId ? (
        <AgentRunHistory
          runs={knownRuns}
          selectedId={liveRun?.id ?? null}
          unreadRunIds={unreadRunIds}
          onSelect={(picked) => {
            userOverrodeRef.current = true;
            setComposing(false);
            setSelectedId(picked.id);
          }}
          onNewRun={
            activeRun || phase === "compose"
              ? undefined
              : () => {
                  userOverrodeRef.current = true;
                  setSelectedId(null);
                  setComposing(true);
                }
          }
          className="shrink-0 pt-3 pb-1"
        />
      ) : null}

      {/* Fil : flux d'événements (live), lancement en vol, spinner ou intro. */}
      <div className="min-h-0 flex-1">
        {phase === "live" && liveRun ? (
          <AgentEventFeed
            runId={liveRun.id}
            status={liveRun.status}
            prompt={liveRun.prompt}
            pendingUserMessages={pendingMessages}
            onOpenFile={openPrFile}
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
            pendingUserMessages={[launchText]}
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
          Borné à la même largeur max que le fil et centré. */}
      {phase !== "loading" && (
        <div className="shrink-0">
          <div className="mx-auto w-full max-w-[800px]">
          {/* Fichiers changés : bloc LIVE du tour épinglé au-dessus du composer pendant
              le travail, ou bouton « créer la PR » au repos. Passe SOUS la réponse (dans
              le fil) une fois le tour fini — c'est l'event `files_changed` qui prend le
              relais là-bas. */}
          {liveRun ? (
            <AgentChangesBar
              runId={liveRun.id}
              working={working}
              canCreatePr={canCreatePr}
              requestingPr={requestingPr}
              onCreatePr={() => void createPr()}
            />
          ) : null}
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
                  {/* Branche copiée au lancement, figée elle aussi pour la session. */}
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
                  />
                </>
              }
            />
          ) : (
            <ChatInput
              key="compose"
              onSend={(message) => void launch(message)}
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
                </>
              }
            />
          )}
          </div>
        </div>
      )}
    </div>
  );
}
