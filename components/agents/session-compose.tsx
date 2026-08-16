"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Check, ChevronLeft, ChevronsUpDown, MessageSquare } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ChatInput } from "@/components/assistant/chat-input";
import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import {
  EnvironmentCombobox,
  LOCAL_REPO_ERROR_KEYS,
  type AgentEnvironment,
} from "@/components/agent/environment-combobox";
import { useLocalRepo } from "@/lib/use-local-repo";
import { launchGeneralAgentApi, type AgentRunSummary } from "@/lib/agent-api";
import { agentRunQueryKey, allAgentSessionsQueryKey } from "@/lib/use-agent-runs";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentErrorMessage } from "@/lib/use-agent-error-message";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAuth } from "@/lib/auth-context";
import {
  defaultAgentProjectId,
  lastAgentProjectId,
  rememberAgentProject,
} from "@/lib/last-agent-project";
import { authDisplayName, type AuthNameMeta } from "@/lib/display-name";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { isLocalAgentProvider } from "@/lib/agent-providers";
import type { Project } from "@/lib/types";
import { useSuppressAssistantFab } from "@/lib/assistant-panel-context";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import { MentionLinksProvider } from "@/components/mention-links";
import type { AssistantMention } from "@/lib/assistant-types";
import type { ResourceInput } from "@/lib/types";

/**
 * Sélecteur du PROJET de la conversation. Obligatoire : sans ticket, seul le
 * projet dit quel dépôt cloner. Pas de filtre « a un dépôt lié » côté client :
 * le serveur refuse proprement (`noRepo`) et le toast l'explique.
 *
 * Un SELECT, pas un combobox : le même menu déroulant que le sélecteur de projet
 * du fil d'Ariane (orbe + nom, `ChevronsUpDown`), et pour la même raison — on
 * choisit parmi ses projets, une liste qu'on connaît et qu'on parcourt du
 * regard. Un champ de recherche par-dessus ne servait qu'à retarder le clic.
 */
function ProjectSelect({
  projects,
  value,
  onChange,
  placeholder,
  emptyLabel,
  disabled,
}: {
  projects: Project[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 shrink items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent/50 disabled:opacity-50"
        >
          {selected ? (
            <ProjectOrb
              seed={projectOrbSeed(selected)}
              iconUrl={selected.icon_url}
              className="size-3.5 shrink-0"
            />
          ) : null}
          <span className="max-w-[10rem] truncate">{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onChange(p.id)}>
            <ProjectOrb seed={projectOrbSeed(p)} iconUrl={p.icon_url} className="size-4 shrink-0" />
            <span className="flex-1 truncate">{p.name}</span>
            <Check
              className={cn("size-4 shrink-0", p.id === value ? "opacity-100" : "opacity-0")}
            />
          </DropdownMenuItem>
        ))}
        {projects.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Composer de LANCEMENT d'une conversation d'agent — la phase d'avant toute
 * run, pendant de celle d'AgentConversation pour un ticket.
 *
 * C'est la VUE PAR DÉFAUT de la page Agents : y arriver, c'est ouvrir une
 * conversation vierge. Le sujet est LIBRE — ce qu'on écrit ici part comme
 * instruction, et la seule chose obligatoire est le PROJET, dont l'agent clone
 * le dépôt. Le texte peut arriver pré-écrit (une note du carnet — MIN-84 —, un
 * prompt d'intégration) ou vide (arrivée sur la page, bouton « Nouveau »), et
 * reste éditable dans les deux cas. Modèle, niveau de raisonnement et branche de
 * base sont facultatifs — ils partent sur les défauts perso, comme depuis un
 * ticket.
 *
 * Une conversation ANCRÉE à un ticket ne passe pas par ici : elle se lance
 * DEPUIS LE TICKET (carte ou panneau) — la page Agents n'offre aucun sélecteur
 * de ticket — et ouvre le composer d'AgentConversation, qui sait ce qu'un ticket
 * demande de plus : branche héritée, statut à faire avancer.
 *
 * Envoyer POSTe /api/agent-runs ; la run rendue est remontée à la page
 * (`onLaunched`), qui bascule sur sa session réelle.
 */
export function SessionCompose({
  initialText,
  initialProjectId,
  onLaunched,
  onBack,
}: {
  /** Texte pré-écrit dans le composer (librement éditable), vide par défaut. */
  initialText?: string;
  /**
   * Projet pré-choisi quand le brouillon en désigne un (prompt d'intégration
   * feedback, lancé depuis les réglages d'un projet) — le picker reste ouvert.
   */
  initialProjectId?: string;
  /** Une run vient d'être lancée — la page bascule sur sa session. */
  onLaunched: (run: AgentRunSummary) => void;
  /**
   * Retour à la liste sous `md`, où liste et détail se relaient en plein écran.
   * Même bouton que l'en-tête d'une conversation (`AgentSessionDetail`) : sans
   * lui, la conversation vierge — la vue par DÉFAUT de la page — serait un
   * cul-de-sac sur mobile.
   */
  onBack?: () => void;
}) {
  const t = useTranslations("Agent");
  const tAgents = useTranslations("Agents");
  const tNav = useTranslations("Nav");

  /**
   * Le FAB de Numo s'efface ici comme dans une conversation ouverte : ce volet
   * porte le MÊME composer épinglé en bas, et le FAB tombe pile sur son bouton
   * d'envoi. `AgentConversation` le déclarait déjà pour lui-même — mais la vue
   * PAR DÉFAUT de la page Agents est cet écran-ci, pas une conversation, et le
   * FAB y revenait donc dès qu'on arrivait sur la page.
   */
  useSuppressAssistantFab();

  const agentErrorMessage = useAgentErrorMessage();
  const queryClient = useQueryClient();
  const { projects } = useProjects();
  // Le compte est nommé ici comme partout ailleurs (barre latérale, menu
  // mobile) : son nom d'affichage entier, jamais l'e-mail brut.
  const { user } = useAuth();
  const name = authDisplayName(
    user?.user_metadata as AuthNameMeta | undefined,
    user?.email ?? null,
    tNav("accountFallback"),
  );

  /**
   * Les projets où l'agent peut travailler : ceux qui ont un DÉPÔT lié. Les
   * autres ne sont pas proposés — l'agent y échouerait à sa première seconde
   * (`noRepo`), une fois la consigne écrite et envoyée. Mieux vaut ne pas les
   * offrir que refuser après coup.
   */
  const { projectIds: gitLinked, loading: gitLinkedLoading } =
    useGitLinkedProjectsQuery();
  const launchable = useMemo(
    () => projects.filter((p) => gitLinked.has(p.id)),
    [projects, gitLinked],
  );
  /** Aucun dépôt nulle part : il n'y a aucune conversation à lancer d'ici. */
  const noRepoAnywhere = !gitLinkedLoading && launchable.length === 0;

  // Le projet part PRÉ-CHOISI : celui que le brouillon désigne, sinon le dernier
  // où un agent a été lancé (à défaut, le projet touché le plus récemment). Il
  // reste librement modifiable — c'est un défaut, pas un verrou.
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  // Résolu dans un effet, pas à l'initialisation : les projets et leurs liens
  // arrivent par react-query et peuvent être encore vides au montage (le composer
  // resterait alors sans projet pour toujours), et lire localStorage pendant le
  // rendu ferait diverger une hydratation.
  //
  // L'effet repasse aussi sur un choix DÉJÀ fait s'il ne tient plus : un projet
  // pré-choisi par un brouillon (ou par le « + » d'un projet dont le dépôt a été
  // délié depuis) n'est plus dans la liste, et le sélecteur afficherait alors un
  // vide en prétendant qu'un projet est choisi.
  useEffect(() => {
    if (gitLinkedLoading || launchable.length === 0) return;
    if (projectId && launchable.some((p) => p.id === projectId)) return;
    setProjectId(defaultAgentProjectId(launchable, lastAgentProjectId()) ?? "");
  }, [launchable, projectId, gitLinkedLoading]);
  const { provider, defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();
  const [model, setModel] = useState("");
  // Niveau de raisonnement du lancement (MIN-122), figé sur la run côté serveur :
  // tant qu'on n'y touche pas, c'est le défaut perso qui part — comme dans le
  // composer d'un ticket.
  const [reasoningOverride, setReasoningOverride] = useState<ReasoningLevel | null>(null);
  // Le MODÈLE effectif de ce lancement — celui dont on affiche les paliers de
  // raisonnement. `model` vide = on part sur le défaut perso, sinon celui du
  // provider : c'est celui-là qui tournera, donc c'est le sien qu'il faut lire.
  const effectiveModel = model || defaultModel || providerDefaultModel;
  const reasoningLevels = useReasoningLevelsFor(effectiveModel);
  // Rabattu sur ce que ce modèle accepte : un défaut perso à `xhigh` sur un
  // modèle qui n'en veut pas doit s'afficher sur son plus proche voisin, pas
  // laisser le chip nommer un palier absent de la liste.
  const reasoningLevel = nearestReasoningLevel(
    reasoningOverride ?? defaultReasoningLevel,
    reasoningLevels,
  );
  const [baseBranch, setBaseBranch] = useState("");
  const [launching, setLaunching] = useState(false);
  // Bulle optimiste du 1er message pendant le POST (mêmes raisons que le launch
  // d'AgentConversation : les pré-checks serveur prennent quelques secondes).
  const [launchText, setLaunchText] = useState<string | null>(null);
  const [launchMentions, setLaunchMentions] = useState<AssistantMention[]>([]);
  // Même information que la run rendue, mais disponible dès le premier rendu
  // optimiste : sans elle, la page Agents nommait une sandbox pour un tour qui
  // attendait en réalité le harness local.
  const [launchLocalExec, setLaunchLocalExec] = useState(false);
  const localEndpoint = isLocalAgentProvider(provider);
  const modelRequired = (provider === "generic" || localEndpoint) && !defaultModel && !model;
  const selectedProject = launchable.find((p) => p.id === projectId) ?? null;
  const { mentionables, links, onMentionQuery } = useNumoMentionables(projectId || null);

  // OÙ LA CONVERSATION TOURNE (MIN-359) — même règle que dans une conversation
  // de ticket : le chip n'existe que si un dossier est attaché à CE projet sur
  // cette machine. Le projet changeant ici (le composer en propose plusieurs),
  // le hook suit `projectId` et l'environnement retombe au cloud dès que le
  // dossier du projet choisi n'est pas prêt.
  const localRepo = useLocalRepo(projectId || null);

  const [environment, setEnvironment] = useState<AgentEnvironment>("cloud");
  useEffect(() => {
    setEnvironment(localEndpoint || localRepo.ready ? "local" : "cloud");
  }, [localEndpoint, localRepo.ready]);

  const launch = async (
    message: string,
    attachments: ResourceInput[] = [],
    mentions: AssistantMention[] = [],
  ) => {
    if (launching) return;
    const prompt = message.trim();
    if (!prompt) return;
    if (!projectId) {
      toast.error(t("composeProjectRequired"));
      return;
    }
    if (modelRequired) {
      toast.error(t("modelRequired"));
      return;
    }
    const localExec = environment !== "cloud" && localRepo.ready;
    const localWorktree = localExec && environment === "worktree";
    setLaunching(true);
    setLaunchText(prompt);
    setLaunchMentions(mentions);
    setLaunchLocalExec(localExec);
    try {
      const { run } = await launchGeneralAgentApi({
        projectId,
        prompt,
        model: model || undefined,
        reasoningLevel,
        baseBranch: baseBranch || undefined,
        mentions,
        attachments,
        // `ready` et pas seulement l'état du chip : entre le choix et l'envoi,
        // le dossier a pu disparaître (ou le projet changer).
        localExec,
        localWorktree,
      });
      /**
       * Amorce le cache de la session AVANT de rendre la main.
       *
       * Le volet de conversation qui prend le relais dans une seconde interroge
       * cette clé-là (`useAgentRunQuery`). Sans données, il se rend en phase
       * « chargement » : un spinner À LA PLACE du message et du composer, le temps
       * d'un aller-retour, en plein milieu du lancement. Or la session est ICI,
       * telle que le serveur vient de la rendre — il n'y a rien à aller chercher.
       * La conversation s'ouvre donc directement sur son fil.
       */
      queryClient.setQueryData(agentRunQueryKey(run.id), { run });
      onLaunched(run);
      // Ce projet devient le défaut du prochain composer (mémoire d'appareil).
      rememberAgentProject(projectId);
      // La liste des sessions ne poll pas au repos : sans invalidation, la page
      // ne rattraperait la session neuve qu'au prochain rechargement.
      await queryClient.invalidateQueries({ queryKey: allAgentSessionsQueryKey });
    } catch (err) {
      // Refusé (pas de dépôt lié, quota…) : la run n'existe pas → on retire la
      // bulle plutôt que de laisser croire au lancement.
      setLaunchText(null);
      setLaunchMentions([]);
      setLaunchLocalExec(false);
      toast.error(agentErrorMessage(err));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* En-tête, à la MÊME géométrie que celle d'une conversation ouverte
          (`AgentConversation` : `px-4 pt-4 pb-2.5`, retour mobile · icône · titre).
          Ce n'est pas de la décoration : quand la session réelle prend le relais —
          quelques secondes après l'envoi —, la page échange ce volet contre celui
          de la conversation. Sans en-tête ici, le fil démarrait 50 px plus haut et
          le message déjà écrit sautait vers le bas au moment de la relève.
          Le titre suit le même sort : « Nouvelle conversation » cède la place au
          titre que l'agent lui donne, sans que rien ne bouge. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2.5">
        {/* Sous `md` seulement : la colonne des conversations est cachée derrière
            ce volet, il faut un chemin de retour. Au-dessus, les deux cohabitent. */}
        {onBack ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tAgents("backToList")}
            className="md:hidden"
            onClick={onBack}
          >
            <ChevronLeft />
          </Button>
        ) : null}
        {/* L'orbe du projet choisi, comme dans l'en-tête d'une conversation
            ouverte. Tant qu'aucun projet n'est choisi, une icône neutre tient sa
            place — même taille, donc rien ne bouge quand il arrive. */}
        {selectedProject ? (
          <ProjectOrb
            seed={projectOrbSeed(selectedProject)}
            iconUrl={selectedProject.icon_url}
            className="size-4 shrink-0"
          />
        ) : (
          <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-sm font-medium">{tAgents("newButton")}</span>
      </div>
      <div className="min-h-0 flex-1">
        {launchText ? (
          /* Les pilules de mention MÈNENT QUELQUE PART, ici comme dans la
             conversation ([agent-conversation.tsx]) : sans ce fournisseur, la
             bulle optimiste affiche `@MIN-42` et le clic ne fait rien — alors
             que la même pilule est cliquable partout ailleurs. */
          <MentionLinksProvider value={links}>
            <AgentEventFeed
              runId={null}
              status="queued"
              pendingUserMessages={[{ text: launchText, mentions: launchMentions }]}
              localExec={launchLocalExec}
              className="h-full py-4"
            />
          </MentionLinksProvider>
        ) : (
          /* La conversation n'a pas encore de fil : sa place accueille le seul
             choix qui manque avant de lancer — le PROJET, dont l'agent clonera
             le dépôt. Il est dit dans une phrase plutôt que posé en chip dans
             le composer : c'est la question de l'écran, pas un réglage de
             l'envoi (le modèle, le raisonnement et la branche, eux, le sont). */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-lg font-medium">{t("composeGreeting", { name })}</p>
            {noRepoAnywhere ? (
              /* Aucun projet n'a de dépôt : il n'y a pas de choix à offrir, et
                 l'agent n'a rien à cloner. On le dit ici plutôt que de laisser
                 un sélecteur vide faire croire à un chargement. */
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("composeNoRepo")}
              </p>
            ) : (
              <p className="max-w-sm text-sm text-muted-foreground">
                {t("composeGreetingPrompt")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Même pied que la conversation : ancré au bas de la page, donc sorti du
          dégradé de la barre mobile par `dock-above-nav` (cf. globals.css). */}
      <div className="dock-above-nav shrink-0">
        <div className="mx-auto w-full max-w-[800px]">
          <ChatInput
            key="session-compose"
            onSend={(message, attachments, mentions) => void launch(message, attachments, mentions)}
            mentionables={mentionables}
            onMentionQuery={onMentionQuery}
            disabled={launching}
            // Sans projet, rien à cloner : l'envoi est bloqué (le texte reste
            // librement éditable) et le tooltip du bouton dit ce qui manque —
            // choisir un projet, ou en connecter un à un dépôt s'il n'y en a
            // aucun où lancer l'agent.
            sendDisabled={!projectId}
            sendDisabledTooltip={
              noRepoAnywhere ? t("composeNoRepo") : t("composeProjectTooltip")
            }
            initialValue={initialText}
            placeholder={t("composePlaceholderFree")}
            contextSlot={
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                <ProjectSelect
                  projects={launchable}
                  value={projectId}
                  onChange={(id) => {
                    setProjectId(id);
                    // La branche appartient au dépôt du projet : changer de
                    // projet invalide le choix précédent.
                    setBaseBranch("");
                  }}
                  placeholder={t("composeProjectPlaceholder")}
                  emptyLabel={t("composeProjectEmpty")}
                  disabled={launching}
                />
                {projectId ? (
                  <>
                    {localRepo.linked ? (
                      <EnvironmentCombobox
                        value={environment}
                        onChange={setEnvironment}
                        localAvailable={localRepo.available}
                        cloudAvailable={!localEndpoint}
                        folder={localRepo.state?.status === "ready" ? localRepo.state.folder : null}
                        needsAttach={localRepo.state?.status !== "ready"}
                        onAttach={() => {
                          void localRepo.attach().then((next) => {
                            if (next?.status === "ready") setEnvironment("local");
                            else if (next && next.status === "invalid") {
                              toast.error(t(LOCAL_REPO_ERROR_KEYS[next.reason]));
                            }
                          });
                        }}
                        disabled={launching || localRepo.busy}
                        bare
                      />
                    ) : null}
                    <BranchCombobox
                      projectId={projectId}
                      value={baseBranch}
                      onChange={setBaseBranch}
                      defaultLabel={t("branchDefault")}
                      defaultHint={t("branchDefaultHint")}
                      placeholder={t("branchSearchPlaceholder")}
                      emptyLabel={t("branchSearchEmpty")}
                      loadingLabel={t("branchSearchLoading")}
                      disabled={launching}
                      localBranches={environment !== "cloud" ? localRepo.branches : undefined}
                      localLabel={t("branchLocalGroup")}
                      cloudLabel={t("branchCloudGroup")}
                      bare
                    />
                  </>
                ) : null}
              </div>
            }
            contextPlacement="above"
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
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
