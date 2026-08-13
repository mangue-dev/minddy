"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { AgentSessionDetail } from "@/components/agents/agent-session-detail";
import { EmptyScene } from "@/components/empty-scene";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { SessionCompose } from "@/components/agents/session-compose";
import { PrIssuePanel } from "@/components/pull-requests/pr-issue-panel";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { RoutinesPanel } from "@/components/routines/routines-panel";
import {
  PROJECT_GROUP_INDENT,
  PROJECT_GROUP_LIMIT,
  SidebarProjectGroup,
  groupByProject,
  toggledSet,
  type ProjectGroup,
} from "@/components/sidebar-project-group";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useProjects } from "@/lib/projects-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAgentReads } from "@/lib/use-agent-reads";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { issueIdentifier } from "@/lib/issue-constants";
import {
  FREE_COMPOSE_PARAM,
  setAgentComposeDraft,
  useAgentComposeDraft,
} from "@/lib/agent-compose-draft";
import {
  deleteAgentRunApi,
  isAgentSessionUnread,
  renameAgentRunApi,
  type AgentRunSummary,
  type AgentSessionListItem,
} from "@/lib/agent-api";
import { agentSessionTitle } from "@/lib/agent-session-title";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Vrai dès que le volet détail est rendu par le layout (breakpoint md = 768px, le
 * volet passe en `md:flex`). Sert à savoir si la conversation SÉLECTIONNÉE est
 * réellement affichée (desktop) ou seulement présélectionnée derrière la liste
 * (mobile). Uniquement lu dans un effet → pas de souci d'hydratation (valeur `false`
 * au 1er rendu serveur/client, corrigée juste après).
 */
function useIsWideViewport(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/**
 * Clé d'une conversation dans la liste : SON RUN, toujours. Les runs successifs
 * d'un ticket partageaient autrefois la clé de l'issue et se rangeaient sous une
 * même ligne, derrière un sélecteur ; ce sont maintenant des conversations à part
 * entière, distinguées à l'écran par leur titre et l'identifiant du ticket.
 */
function sessionKey(s: AgentSessionListItem): string {
  return s.runId;
}

type SessionGroup = ProjectGroup<AgentSessionListItem>;

/**
 * Une conversation dans la liste : SON TITRE, sur une ligne, et rien d'autre —
 * au plus un point ou un spinner en bout de ligne, pour ce qui ne peut pas
 * attendre le survol (l'agent travaille, il a fini, il attend une réponse).
 *
 * Tout le reste — de quoi la conversation parle (ticket, sujet libre, relecture
 * de PR), son état exact, sa date, son projet — vit dans le TOOLTIP. Une colonne
 * de navigation se parcourt du regard : quatre informations par ligne, c'est
 * quatre fois plus long à balayer, pour trois qu'on ne cherchait pas.
 */
function SessionRow({
  session,
  selected,
  unread,
  awaiting,
  dateLabel,
  onSelect,
  onRename,
  onDelete,
}: {
  session: AgentSessionListItem;
  selected: boolean;
  unread: boolean;
  /** Non lu ET question posée : le point passe au jaune. */
  awaiting: boolean;
  dateLabel: string;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Agents");
  // Le clic droit : la position du pointeur, ou `null` quand le menu est fermé.
  // Même montage que l'arbre des Pages (components/pages/page-tree.tsx).
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  // « MIN-42: Corriger la redirection » pour une conversation de ticket, le seul
  // titre pour les autres. Cf. `agentSessionTitle`.
  const title = agentSessionTitle(session, t("freeSessionTitle"));
  // De quoi la conversation parle : le TICKET, « Sujet libre » ou « Analyse de
  // PR » — la même question, trois réponses possibles. Le ticket se dit ici par
  // son titre entier, et non plus par son identifiant : celui-ci est passé
  // devant le titre de la ligne, et le répéter au survol n'apprendrait rien.
  const anchor = session.issue
    ? session.issue.title
    : session.pullRequest
      ? t("prBadge")
      : t("freeBadge");

  /**
   * Les deux seules choses qu'on fasse à une conversation sans l'ouvrir : la
   * renommer et la supprimer. Écrites une fois, comme partout ailleurs dans
   * l'app — c'est le sens de `ContextMenuAction[]` plutôt que des
   * `<DropdownMenuItem>` recopiés.
   */
  const actions: ContextMenuAction[] = [
    {
      id: "rename",
      label: t("renameSession"),
      icon: <Pencil className="size-4" />,
      onSelect: onRename,
    },
    {
      id: "delete",
      label: t("deleteSession"),
      icon: <Trash2 className="size-4" />,
      variant: "destructive",
      separatorBefore: true,
      onSelect: onDelete,
    },
  ];

  return (
    <>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          // Le clic droit ouvre le menu de la ligne, où qu'il tombe dessus. Viser
          // un « ⋯ » demanderait de survoler la ligne pour le faire apparaître,
          // puis d'atteindre un carré de 24 px — et la ligne, ici, n'a
          // délibérément rien d'autre que son titre.
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPosition({ x: event.clientX, y: event.clientY });
          }}
          className={cn(
            "flex items-center gap-2 rounded-md py-1.5 pr-2 text-left outline-none transition-colors",
            // Aligné sur le NOM du projet, un niveau plus haut.
            PROJECT_GROUP_INDENT,
            selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
          {session.working ? (
            <Spinner className="size-3 shrink-0 text-muted-foreground" />
          ) : unread ? (
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                awaiting ? "bg-yellow-500" : "bg-blue-500",
              )}
              aria-label={awaiting ? t("awaitingAnswer") : t("unread")}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      {/* Le tooltip porte ce que la ligne a cessé de dire. `text-left` : le
          centrage par défaut est fait pour un mot, pas pour quatre lignes. */}
      <TooltipContent side="right" className="max-w-[260px] text-left">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-background/70">
          {anchor} · {t(agentSessionStatusKey(session))} · {dateLabel}
        </p>
        {session.project ? (
          <p className="text-background/70">{session.project.name}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
    {/* Le menu, ancré au pointeur, HORS de la ligne : il pose une ancre invisible
        en `position: fixed` aux coordonnées du clic, et la garder dedans
        déformerait le rectangle de survol du tooltip. */}
    <IssueContextMenu
      position={menuPosition}
      onClose={() => setMenuPosition(null)}
      actions={actions}
      searchable={false}
    />
    </>
  );
}

/**
 * Un PROJET dans la liste, et ses conversations sous lui — l'accordéon est
 * l'échelle à laquelle on cherche : on sait sur quel projet on parlait à l'agent
 * bien avant de se souvenir du titre exact de la conversation.
 *
 * L'en-tête porte l'orbe du projet et son nom. Replié, il porte aussi ce qui se
 * passe dessous (spinner, point non lu) : replier un projet ne doit pas faire
 * disparaître une réponse attendue. Au survol paraît un « + » — la même
 * conversation vierge que le bouton de la colonne, mais avec CE projet déjà
 * choisi : on est en train de lire ce qu'on lui a dit, c'est le moment où l'on
 * sait sur quel dépôt on veut repartir.
 *
 * Les cinq conversations les plus récentes, puis « Afficher plus ». Replier le
 * projet remet le compteur à cinq — c'est le chemin de retour, sans un second
 * bouton à ajouter.
 */
function SessionGroupRows({
  group,
  open,
  showAll,
  collapsible,
  canLaunch,
  selectedKey,
  reads,
  fmtDay,
  onToggle,
  onShowAll,
  onSelect,
  onNewSession,
  onRename,
  onDelete,
}: {
  group: SessionGroup;
  open: boolean;
  showAll: boolean;
  collapsible: boolean;
  /**
   * Le projet a-t-il un DÉPÔT lié ? Sans lui, l'agent n'a rien à cloner : le
   * « + » n'a pas lieu d'être. Les conversations passées, elles, restent (le
   * dépôt a pu être délié après coup).
   */
  canLaunch: boolean;
  selectedKey: string | null;
  reads: Record<string, string>;
  fmtDay: (at: string) => string;
  onToggle: () => void;
  onShowAll: () => void;
  onSelect: (key: string) => void;
  /** « + » du survol : conversation vierge, ce projet déjà choisi. */
  onNewSession: () => void;
  /** Clic droit sur une ligne : renommer / supprimer cette conversation. */
  onRename: (session: AgentSessionListItem) => void;
  onDelete: (session: AgentSessionListItem) => void;
}) {
  const t = useTranslations("Agents");
  // « Afficher plus » et « Sans projet » sont ceux de l'accordéon, partagés avec
  // la colonne des pull requests : une seule paire de mots pour un seul geste.
  const tCommon = useTranslations("Common");
  const sessions = group.items;

  // La conversation OUVERTE reste visible : si elle est au-delà des cinq
  // premières, la coupe descend jusqu'à elle plutôt que de la cacher.
  const selectedIndex = sessions.findIndex((s) => sessionKey(s) === selectedKey);
  const shown = showAll
    ? sessions
    : sessions.slice(0, Math.max(PROJECT_GROUP_LIMIT, selectedIndex + 1));

  const working = sessions.some((s) => s.working);
  const unreadSessions = sessions.filter((s) => isAgentSessionUnread(s, reads));
  const awaiting = unreadSessions.some((s) => s.awaitingInput);

  return (
    <SidebarProjectGroup
      project={group.project}
      fallbackLabel={tCommon("noProjectGroup")}
      open={open}
      collapsible={collapsible}
      onToggle={onToggle}
      hiddenCount={sessions.length - shown.length}
      onShowAll={onShowAll}
      showMoreLabel={tCommon("showMore")}
      collapsedBadge={
        working ? (
          <Spinner className="size-3 shrink-0 text-muted-foreground" />
        ) : unreadSessions.length > 0 ? (
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              awaiting ? "bg-yellow-500" : "bg-blue-500",
            )}
            aria-label={awaiting ? t("awaitingAnswer") : t("unread")}
          />
        ) : null
      }
      actions={
        /* Sans projet joint, rien à pré-choisir ; sans dépôt lié, rien à lancer :
           dans les deux cas le raccourci n'existe pas. */
        group.project && canLaunch ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onNewSession}
                aria-label={t("newInProject", { project: group.project.name })}
                // Invisible, il ne se clique pas : au doigt, où il n'y a pas de
                // survol, le bord droit d'un en-tête ouvrirait sinon une
                // conversation sans que rien ne l'ait annoncé.
                className="pointer-events-none size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/project:pointer-events-auto group-hover/project:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("newInProject", { project: group.project.name })}
            </TooltipContent>
          </Tooltip>
        ) : null
      }
    >
      {shown.map((s) => {
        const key = sessionKey(s);
        const unread = isAgentSessionUnread(s, reads);
        return (
          <SessionRow
            key={key}
            session={s}
            selected={key === selectedKey}
            unread={unread}
            awaiting={unread && s.awaitingInput}
            dateLabel={fmtDay(s.updated_at)}
            onSelect={() => onSelect(key)}
            onRename={() => onRename(s)}
            onDelete={() => onDelete(s)}
          />
        );
      })}
    </SidebarProjectGroup>
  );
}

/**
 * Les deux moitiés de la vue Agents (MIN-185) : les CONVERSATIONS — ce qu'on a
 * demandé à Numo — et les ROUTINES — ce qu'il fait tout seul. Deux listes qui
 * n'ont rien à faire ensemble : une routine quotidienne noierait la colonne des
 * conversations en une semaine, et c'est exactement pour ça que ses runs en
 * sortent (`.is("routine_id", null)` dans /api/agent-runs).
 *
 * L'onglet est porté par l'URL (`?tab=routines`) : une notification de routine
 * y renvoie directement, et le lien se partage.
 */
function AgentsTabs({
  tab,
  onChange,
}: {
  tab: "sessions" | "routines";
  onChange: (tab: "sessions" | "routines") => void;
}) {
  const t = useTranslations("Agents");
  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-0.5" role="tablist">
      {(["sessions", "routines"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            tab === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {id === "sessions" ? t("tabConversations") : t("tabRoutines")}
        </button>
      ))}
    </div>
  );
}

/**
 * Bouton « Nouveau » de la colonne : il OUVRE une conversation vierge, il ne
 * demande rien d'abord. Il n'y a plus de menu ici — lancer l'agent SUR UN TICKET
 * se fait depuis le ticket lui-même (carte ou panneau), là où l'on sait de quel
 * ticket on parle. Cet écran-ci ne sert qu'au sujet libre, et la conversation
 * vierge en est déjà la vue par défaut : le bouton ne fait donc que la
 * REDEMANDER, à neuf, quand on est parti lire une conversation.
 */
function NewSessionButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations("Agents");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* `-mr-2` compense le padding du bouton : l'icône s'aligne alors sur le
            bord droit des lignes de la liste, pas 8 px en-deçà. */}
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClick}
          className="-mr-2 text-muted-foreground hover:text-foreground"
          aria-label={t("newButton")}
        >
          <Plus className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("newButton")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Renommer une conversation : un champ, un bouton. Le titre initial est celui que
 * la ligne AFFICHE — identifiant du ticket compris (`agentSessionTitle`) : on
 * renomme ce qu'on a sous les yeux, pas une colonne dont on ne verrait la moitié
 * qu'après coup.
 *
 * Un champ VIDÉ est un envoi valide (le bouton reste actif) : c'est ainsi qu'on
 * efface un titre pour retomber sur celui du ticket.
 */
function SessionNameDialog({
  session,
  onOpenChange,
  onSubmit,
}: {
  /** La conversation à renommer — `null` ferme le dialog. */
  session: AgentSessionListItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const t = useTranslations("Agents");
  const tCommon = useTranslations("Common");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // Repartir du titre courant à chaque ouverture : le dialog est piloté depuis le
  // parent (poser la cible suffit à ouvrir), donc Radix n'appelle pas
  // `onOpenChange` et le champ resterait sur le titre de la conversation d'avant.
  useEffect(() => {
    if (!session) return;
    setName(agentSessionTitle(session, t("freeSessionTitle")));
  }, [session, t]);

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("renameSessionTitle")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSubmit(name.trim());
              onOpenChange(false);
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sessionNamePlaceholder")}
          />
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Page Agents — vue liste/détail : à gauche TOUTES les conversations de l'agent
 * Numo (tous projets accessibles, sans filtre), à droite la conversation inline
 * (`AgentSessionDetail` → `AgentConversation`, le même cœur que la modal).
 *
 * **UNE CONVERSATION = UN RUN**, ticket ou pas. Les runs successifs d'un ticket
 * étaient réunis sous une seule ligne, les précédents rangés derrière un sélecteur
 * au milieu de l'en-tête : on ne voyait qu'une conversation par ticket, et les
 * autres n'existaient que pour qui pensait à déplier ce menu. Chacune a maintenant
 * sa ligne, sous son propre titre — celui que le titreur écrit au lancement,
 * précédé de l'identifiant du ticket (`agentSessionTitle`). La conversation
 * sélectionnée est publiée dans le contexte de Numo quand elle a une issue.
 *
 * La colonne est un ACCORDÉON par projet (`ProjectGroup`), cinq conversations par
 * projet puis « Afficher plus », et chaque ligne se réduit à son titre
 * (`SessionRow`) — le reste attend le survol. Deux façons de retrouver une
 * conversation, et une seule à la fois : parcourir les projets, ou filtrer (le
 * filtre déplie tout et lève la coupe des cinq).
 *
 * **La vue par défaut est une CONVERSATION VIERGE** (`SessionCompose`), pas la
 * dernière session : arriver ici, c'est vouloir parler à l'agent, pas relire ce
 * qu'on lui a déjà dit. Une conversation se lit en la choisissant dans la liste.
 * C'est la clé de sélection `FREE_COMPOSE_PARAM` — elle ne désigne aucune session
 * réelle, et la liste ne montre RIEN pour elle : une conversation n'entre dans la
 * colonne que lorsqu'elle existe vraiment, c'est-à-dire au premier message envoyé.
 *
 * Points d'entrée « Lancer un agent » :
 *  • ISSUE (MIN-46) : le bouton du ticket (carte ou panneau) pose un BROUILLON
 *    (`useAgentComposeDraft`, kind "issue") et navigue ici avec `?compose=<issueId>`.
 *    C'est le SEUL chemin vers une conversation ancrée à un ticket — la page, elle,
 *    n'offre plus de sélecteur de ticket.
 *  • SUJET LIBRE : le bouton « Nouveau » de cette page (conversation vierge, sans
 *    brouillon), le CARNET (MIN-84) et les wizards d'intégration, qui posent un
 *    brouillon kind "free" avec un texte pré-écrit et naviguent avec `?compose=new`.
 *    Le volet ouvre le composer de lancement (`SessionCompose` : projet + modèle +
 *    raisonnement + branche).
 * Purement optimiste dans les deux cas : si l'utilisateur n'envoie pas le 1er
 * message, rien n'a existé ; dès qu'il l'envoie, la run réelle prend le relais dans
 * le même volet et paraît dans la liste.
 */
export function AgentsPage() {
  const t = useTranslations("Agents");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const { projects, openCreateProject, loading: projectsLoading } = useProjects();
  const { sessions, loading, refetch } = useAgentSessionsQuery();
  // Les projets où l'agent peut travailler (dépôt lié) — ils seuls portent le
  // « + » de leur en-tête. Même requête que le composer, donc un seul appel.
  const { projectIds: gitLinked } = useGitLinkedProjectsQuery();
  const { reads, markRead } = useAgentReads();
  const isWide = useIsWideViewport();

  // Deep-link (« Ouvrir l'agent » depuis ailleurs) : ?run=<runId> ouvre CETTE
  // conversation ; ?issue=<issueId> ouvre la plus récente du ticket (il n'est plus
  // la clé d'aucune conversation — cf. `sessionForKey`) ; ?compose=<issueId>
  // l'ouvre en brouillon de lancement ; ?compose=new le brouillon SANS ticket.
  const searchParams = useSearchParams();
  const issueParam = searchParams.get("issue");
  const runParam = searchParams.get("run");
  const composeParam = searchParams.get("compose");
  // Onglet Conversations / Routines (MIN-185), porté par l'URL : une
  // notification de routine ouvre `?tab=routines&routine=<id>`.
  const tabParam = searchParams.get("tab");
  const routineParam = searchParams.get("routine");
  const [tab, setTab] = useState<"sessions" | "routines">(
    tabParam === "routines" || routineParam ? "routines" : "sessions",
  );
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(routineParam);

  const draft = useAgentComposeDraft();
  // Le brouillon n'est honoré que si l'URL le signale ENCORE : une navigation vers
  // /agents sans `?compose=` (retour plus tard) l'ignore, même s'il traîne en mémoire.
  const draftHonored =
    !!draft &&
    (draft.kind === "issue"
      ? composeParam === draft.issueId
      : composeParam === FREE_COMPOSE_PARAM);
  const issueDraft = draftHonored && draft?.kind === "issue" ? draft : null;
  // Brouillon SANS ticket : il ne fait que PRÉ-ÉCRIRE la conversation vierge (une
  // note du carnet, un prompt d'intégration). Le bouton « Nouveau », lui, n'en pose
  // aucun — une conversation vierge n'a rien à pré-écrire.
  const freeDraft = draftHonored && draft?.kind === "free" ? draft : null;

  // Sélection courante. `FREE_COMPOSE_PARAM` n'est la clé d'AUCUNE session : c'est
  // la conversation vierge, et c'est là qu'on arrive par défaut.
  const [selectedKey, setSelectedKey] = useState<string | null>(
    composeParam ?? issueParam ?? runParam ?? FREE_COMPOSE_PARAM,
  );
  const [mobileDetail, setMobileDetail] = useState(
    !!composeParam || !!issueParam || !!runParam,
  );
  // Issue liée ouverte dans le panneau latéral (par-dessus la page, pas de navigation).
  const [panel, setPanel] = useState<{ projectId: string; issueId: string } | null>(null);
  // Id de la run tout juste lancée depuis le composer : on garde le volet monté
  // (même clé → aucun remount, transition compose → live fluide) jusqu'à ce que la
  // liste des sessions rattrape cette run précise.
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Cibles du menu contextuel de la liste : la conversation qu'on renomme, celle
  // qu'on s'apprête à supprimer. `null` = le dialog correspondant est fermé.
  const [renameTarget, setRenameTarget] = useState<AgentSessionListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSessionListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Remonte le composer À NEUF à chaque « Nouveau » (et à chaque texte pré-écrit
  // reçu) : sans ça, un message tapé puis abandonné traînerait dans la conversation
  // « vierge » suivante — qui ne le serait plus.
  const [composeNonce, setComposeNonce] = useState(0);
  // Projet pré-choisi de la prochaine conversation vierge, quand elle est ouverte
  // depuis l'en-tête d'un projet. `null` = le composer choisit son défaut.
  const [newSessionProjectId, setNewSessionProjectId] = useState<string | null>(null);
  // Accordéon de la liste : les projets REPLIÉS (tout est déplié par défaut — on
  // arrive pour voir, pas pour ouvrir) et ceux dont on a demandé toutes les
  // conversations. Deux ensembles, l'absence valant le cas courant.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /** Replie / déplie un projet. Le replier remet sa liste à ses cinq premières. */
  const toggleGroup = (key: string) => {
    const wasOpen = !collapsedGroups.has(key);
    setCollapsedGroups((prev) => toggledSet(prev, key));
    if (wasOpen && expandedGroups.has(key)) {
      setExpandedGroups((prev) => toggledSet(prev, key));
    }
  };

  // Clé de sélection du brouillon : l'issue visée (kind "issue") ou le marqueur de
  // la conversation vierge (kind "free" — aucune run, donc aucune clé réelle).
  const draftKey = issueDraft ? issueDraft.issueId : freeDraft ? FREE_COMPOSE_PARAM : null;

  // Le projet RÉEL du brouillon, retrouvé dans le contexte : le brouillon ne
  // porte que l'id et la clé du projet, or l'en-tête de la conversation peint son
  // ORBE — sans `icon_url`, elle affichait l'orbe générée là où le projet a une
  // vraie icône, puis basculait sur la bonne au premier message envoyé.
  const draftProject = issueDraft
    ? projects.find((p) => p.id === issueDraft.projectId) ?? null
    : null;

  // Entrée synthétique du brouillon ISSUE, façonnée comme une vraie session pour
  // traverser le même volet de détail (`AgentSessionDetail`). Aucune run réelle :
  // `runId` est un marqueur, le volet s'ouvre en compose et la conversation gère le
  // passage live. (Le brouillon SANS TICKET a son propre volet, `SessionCompose`.)
  const draftItem: AgentSessionListItem | null = issueDraft
    ? {
        runId: `draft:${issueDraft.issueId}`,
        status: "queued",
        model: null,
        triggered_by: "button",
        // Aucun titre : le brouillon n'a pas encore de run, donc rien de généré.
        // Son volet se nomme donc « MIN-42: <titre du ticket> », le temps que le
        // premier message parte.
        title: null,
        pullRequest: null,
        pr_number: null,
        pr_url: null,
        pr_state: null,
        created_at: "",
        updated_at: "",
        issue: {
          id: issueDraft.issueId,
          number: issueDraft.issueNumber,
          title: issueDraft.issueTitle,
        },
        // Le brouillon ne paraît pas dans la liste, mais son volet de détail, lui,
        // porte l'orbe du projet : elle vient donc du projet RÉEL (nom et icône),
        // et non des seules bribes que le brouillon transporte.
        project: {
          id: issueDraft.projectId,
          key: issueDraft.projectKey,
          name: draftProject?.name ?? issueDraft.projectKey,
          icon_url: draftProject?.icon_url ?? null,
        },
        working: false,
        lastCompletedAt: null,
        awaitingInput: false,
      }
    : null;

  // La liste a-t-elle rattrapé la run qu'on vient de lancer ? Une seule question
  // pour les deux formes : la session d'un ticket prend cette run pour
  // représentant, une session sans ticket EST cette run.
  const launchedItem = launchedRunId
    ? sessions.find((s) => s.runId === launchedRunId) ?? null
    : null;

  // Volets de LANCEMENT — aucune run encore. Ils tiennent jusqu'à ce que la run
  // lancée paraisse dans la liste, où la vraie session prend le relais.
  const issueComposeSelected =
    !!issueDraft && selectedKey === issueDraft.issueId && !launchedItem;
  // La conversation vierge : la vue par défaut, ce que « Nouveau » rouvre, et ce
  // que le carnet et les wizards pré-écrivent.
  const freeComposeActive = selectedKey === FREE_COMPOSE_PARAM && !launchedItem;
  const composeSelected = issueComposeSelected || freeComposeActive;

  // Suit les changements de params (navigation client vers une autre entrée).
  useEffect(() => {
    if (!composeParam) return;
    setSelectedKey(composeParam);
    setMobileDetail(true);
  }, [composeParam]);
  useEffect(() => {
    if (!issueParam) return;
    setSelectedKey(issueParam);
    setMobileDetail(true);
  }, [issueParam]);
  useEffect(() => {
    if (!runParam) return;
    setSelectedKey(runParam);
    setMobileDetail(true);
  }, [runParam]);
  // Deep-link vers une routine (notification, lien partagé) : l'onglet suit.
  useEffect(() => {
    if (!routineParam) return;
    setTab("routines");
    setSelectedRoutineId(routineParam);
    setMobileDetail(true);
  }, [routineParam]);
  // `?tab=routines` ARRIVÉ APRÈS le montage — la palette de commandes pousse
  // cette adresse, et depuis /agents elle ne remonte pas la page : l'état
  // initial ne rejoue pas, donc sans cet effet le geste ne faisait rien du
  // tout. À SENS UNIQUE : quitter l'onglet efface le paramètre (`switchTab`),
  // et un effet qui retomberait sur « conversations » à chaque URL sans `tab`
  // annulerait le clic qui vient de l'ouvrir.
  useEffect(() => {
    if (tabParam !== "routines") return;
    setTab("routines");
  }, [tabParam]);

  // Un brouillon POSÉ ouvre son volet, même si l'URL, elle, ne bouge pas :
  // `router.push` vers l'adresse COURANTE est inerte, donc les effets de params
  // ci-dessus ne rejouent pas. C'est exactement le cas d'une deuxième note lancée
  // depuis le carnet (`?compose=new` déjà dans la barre) — le brouillon existait
  // bien, mais la sélection était restée sur la conversation ouverte entre-temps.
  // La sélection suit donc le brouillon, pas seulement le paramètre. Le composer
  // est remonté à neuf pour que le texte pré-écrit remplace le précédent.
  useEffect(() => {
    if (!draftKey) return;
    setSelectedKey(draftKey);
    setMobileDetail(true);
    setComposeNonce((n) => n + 1);
    // Le brouillon dit lui-même son projet (ou laisse choisir) : le pré-choix
    // d'un « + » précédent n'a plus voix au chapitre.
    setNewSessionProjectId(null);
  }, [draft, draftKey]);

  // Transition terminée : la run lancée figure dans la liste → on efface le
  // brouillon et on sélectionne sa session — sa clé RÉELLE (l'issue pour une
  // session de ticket, le run sinon), lue sur l'entrée qu'on vient de rattraper
  // plutôt que redevinée ici. On nettoie aussi `?compose=` de l'URL.
  useEffect(() => {
    if (!launchedItem) return;
    setSelectedKey(sessionKey(launchedItem));
    setLaunchedRunId(null);
    setAgentComposeDraft(null);
    if (composeParam || issueParam || runParam) router.replace("/agents");
  }, [launchedItem?.runId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * La conversation que désigne une clé de sélection. C'est un run (le cas
   * courant : une ligne de la liste, `?run=`) — mais un deep-link peut aussi
   * désigner un TICKET (`?issue=`, depuis une carte ou une pull request), qui
   * n'est plus la clé d'aucune conversation depuis qu'un run vaut une
   * conversation. On ouvre alors la plus RÉCENTE du ticket : la liste arrive
   * triée par date de création décroissante, c'est donc la première trouvée.
   */
  const sessionForKey = (key: string | null): AgentSessionListItem | null =>
    key
      ? sessions.find((s) => s.runId === key) ??
        sessions.find((s) => s.issue?.id === key) ??
        null
      : null;

  // Élément affiché à droite. La run tout juste lancée passe DEVANT la sélection :
  // elle vient d'être rattrapée par la liste et l'effet ci-dessus n'a pas encore
  // déplacé `selectedKey` — sans ça, le volet clignoterait « aucune sélection » le
  // temps d'une image, juste après l'envoi du premier message.
  const realSelected = launchedItem ?? sessionForKey(selectedKey);
  const activeItem = issueComposeSelected ? draftItem : realSelected;

  // La conversation AFFICHÉE n'a jamais de bulle : on la marque lue à son ouverture ET
  // à chaque nouvelle fin de run tant qu'elle reste visible (dépendance sur
  // `lastCompletedAt`). « Visible » = desktop (le volet est toujours rendu) ou, sur
  // mobile, le volet détail ouvert ; sinon (liste mobile ou compose) on ne marque pas,
  // pour ne pas effacer la bulle d'une session qu'on ne regarde pas. Les sessions
  // SANS TICKET n'ont pas de suivi lu/non-lu (personnelles, pas d'issue à ancrer).
  const shownReal = !composeSelected && (isWide || mobileDetail) ? realSelected : null;
  useEffect(() => {
    const id = shownReal?.issue?.id;
    if (id) markRead(id);
  }, [shownReal?.issue?.id, shownReal?.lastCompletedAt, markRead]);

  /**
   * Publie l'issue active à Numo : il résout « cette issue » (et sa PR le cas
   * échéant), la lit et peut agir dessus — brouillon compris (issue sans PR).
   *
   * RIEN sous l'onglet Routines, où c'est `RoutinesPanel` qui publie la routine
   * ouverte. Les hooks ne se sautent pas : cet appel s'exécute même quand la
   * page rend l'autre onglet, et les deux surfaces se disputeraient alors le
   * contexte ambiant — Numo aurait reçu, selon l'ordre des effets, le ticket
   * d'une conversation qui n'est même pas à l'écran.
   */
  useAssistantContext(
    tab !== "routines" && activeItem && activeItem.project && activeItem.issue
      ? {
          projectId: activeItem.project.id,
          issueId: activeItem.issue.id,
          issueIdentifier: issueIdentifier(activeItem.project.key, activeItem.issue.number),
          issueTitle: activeItem.issue.title,
          ...(activeItem.pr_number != null
            ? {
                prNumber: activeItem.pr_number,
                prState: activeItem.pr_state ?? undefined,
                prRunId: activeItem.runId,
              }
            : {}),
        }
      : null,
  );

  // Garde une sélection valide : quand la session sélectionnée disparaît (ou qu'un
  // deep-link désigne une session qui n'existe plus), on retombe sur la conversation
  // vierge — jamais sur une AUTRE conversation, qu'on n'a pas demandé à lire. On ne
  // touche à rien pendant un compose (aucune session à valider) ni tant que la liste
  // n'est pas arrivée (chargement / présélection deep-link).
  useEffect(() => {
    if (composeSelected || launchedRunId) return;
    if (sessions.length === 0) return;
    const resolved = sessionForKey(selectedKey);
    if (!resolved) {
      setSelectedKey(FREE_COMPOSE_PARAM);
      return;
    }
    // Deep-link par TICKET (`?issue=`) : la sélection retient la CONVERSATION
    // qu'il a ouverte, pas le ticket — sinon aucune ligne ne se surligne, et le
    // volet suivrait un ticket dont les conversations ne sont plus une.
    if (resolved.runId !== selectedKey) setSelectedKey(resolved.runId);
  }, [sessions, selectedKey, composeSelected, launchedRunId]);

  // Sélectionne une VRAIE session : abandonne le brouillon en cours (jamais envoyé →
  // effacé, comme quitter la page). Purement UI, aucune run n'a existé.
  const selectReal = (key: string) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setSelectedKey(key);
    setMobileDetail(true);
    // L'URL cesse de désigner l'entrée qu'on vient de quitter. Elle mentirait au
    // rechargement, et surtout elle rendrait INERTE la navigation suivante vers
    // cette même entrée : pousser l'adresse courante ne change rien.
    if (composeParam || issueParam || runParam) router.replace("/agents");
  };

  // « Nouveau » : une conversation vierge, tout de suite — même geste que d'arriver
  // sur la page. Le brouillon éventuellement en cours est abandonné (jamais envoyé)
  // et le composer repart à zéro, texte compris. Lancée depuis l'en-tête d'un
  // projet, elle part avec ce projet déjà choisi (le composer laisse en changer).
  const startNewSession = (projectId?: string) => {
    if (draft) setAgentComposeDraft(null);
    setLaunchedRunId(null);
    setNewSessionProjectId(projectId ?? null);
    setSelectedKey(FREE_COMPOSE_PARAM);
    setMobileDetail(true);
    setComposeNonce((n) => n + 1);
    if (composeParam || issueParam || runParam) router.replace("/agents");
  };

  /**
   * Renommer : on écrit `agent_runs.title`, la première marche de la cascade
   * d'affichage — le nom change du même coup dans la liste et dans l'en-tête du
   * volet (cf. `agentSessionTitle`). Un titre vidé efface le sien et la
   * conversation retombe sur le titre de son ticket : c'est le chemin de retour.
   */
  const renameSession = async (session: AgentSessionListItem, title: string) => {
    await renameAgentRunApi(session.runId, title);
    await refetch();
  };

  /**
   * Supprimer, pour de bon : `agent_run_events` et `agent_run_messages` partent en
   * cascade, et le serveur coupe d'abord la microVM. Si c'est la conversation
   * OUVERTE qui disparaît, on retombe sur la conversation vierge plutôt que de
   * laisser un volet fantôme — l'effet de garde le ferait aussi, une image plus
   * tard, et cette image-là se voit.
   */
  const deleteSession = async (session: AgentSessionListItem) => {
    setDeleting(true);
    try {
      await deleteAgentRunApi(session.runId);
      if (selectedKey === session.runId) setSelectedKey(FREE_COMPOSE_PARAM);
      setDeleteTarget(null);
      await refetch();
      toast.success(t("sessionDeleted"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const fmtDay = (at: string): string =>
    format.dateTime(new Date(at), { day: "numeric", month: "short" });

  /**
   * Ce que la colonne AFFICHE. Le filtre texte ne touche PAS `sessions`, qui
   * porte la sélection et l'effet de garde : sinon taper trois lettres ferait
   * sauter la conversation ouverte, une fois par lettre.
   *
   * Une session se cherche par son ancrage (le ticket, le sujet) ou par son
   * projet — c'est ce que la ligne affiche.
   */
  const visibleSessions = useMemo(() => {
    if (!query.trim()) return sessions;
    return sessions.filter((s) =>
      matchesFilter(query, [
        s.title,
        s.issue?.title,
        s.project?.name,
        s.pullRequest?.title,
        s.issue && s.project ? issueIdentifier(s.project.key, s.issue.number) : null,
      ]),
    );
  }, [sessions, query]);

  const listCount = visibleSessions.length;
  const groups = useMemo(
    () => groupByProject(visibleSessions, (s) => s.project),
    [visibleSessions],
  );
  // Un filtre en cours DÉPLIE tout et lève la coupe des cinq : chercher, c'est
  // demander à voir ce qui correspond, pas à savoir où c'est rangé.
  const filtering = query.trim().length > 0;

  /* AUCUN PROJET : la conversation vierge ne mène nulle part — le sujet libre
     lui-même réclame un projet dont l'agent clone le dépôt. C'est un projet qu'il
     faut d'abord, et cet écran ne dit que ça. Des projets sans aucune session, en
     revanche, gardent la vue normale : la conversation vierge y est déjà ouverte,
     il n'y a rien de plus à proposer. */
  if (!loading && !projectsLoading && projects.length === 0 && sessions.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <EmptyScene icon={Bot} title={t("emptyNoProject")}>
            <Button onClick={openCreateProject}>
              <Plus />
              {tProjects("firstProject")}
            </Button>
          </EmptyScene>
        </div>
      </div>
    );
  }

  /** Le sélecteur d'onglet, posé en tête de la colonne dans les deux cas. */
  const switchTab = (next: "sessions" | "routines") => {
    setTab(next);
    setMobileDetail(false);
    // L'URL PORTE l'onglet : un rechargement rouvre celui qu'on regardait, et
    // l'adresse se partage. En repartant vers les conversations, le paramètre
    // s'efface — il désignerait sinon l'onglet qu'on vient de quitter. La
    // routine ouverte sort de l'adresse dans les deux cas : c'est l'onglet
    // qu'on désigne, pas une sélection.
    if (next === "routines") {
      if (tabParam !== "routines" || routineParam) router.replace("/agents?tab=routines");
    } else if (tabParam || routineParam) {
      router.replace("/agents");
    }
  };

  // ── Onglet ROUTINES (MIN-185) : sa propre liste, son propre détail ────
  if (tab === "routines") {
    return (
      <div className="flex h-full min-h-0">
        <RoutinesPanel
          selectedId={selectedRoutineId}
          onSelect={(id) => {
            setSelectedRoutineId(id);
            setMobileDetail(!!id);
          }}
          mobileDetail={mobileDetail}
          onBack={() => setMobileDetail(false)}
          tabs={<AgentsTabs tab={tab} onChange={switchTab} />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Gauche : liste des sessions ─────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listCount }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={<NewSessionButton onClick={() => startNewSession()} />}
      >
        <div className="px-2 pt-2">
          <AgentsTabs tab={tab} onChange={switchTab} />
        </div>
        {loading ? (
          /* À la forme de la liste : deux projets, quelques conversations d'une
             ligne dessous. */
          <div className="flex flex-col gap-2 px-2 pt-2">
            {[0, 1].map((g) => (
              <div key={g} className="flex flex-col gap-1">
                <Skeleton className="h-6 w-32 rounded-md" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="ml-8 h-5 rounded-md" />
                ))}
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          /* La colonne n'a JAMAIS rien eu : personne n'a encore parlé à l'agent.
             La scène des autres surfaces vides, en `compact` — une colonne de
             320 px n'a pas la place d'une illustration de page. Aucun bouton : la
             conversation vierge est déjà ouverte juste à côté, et c'est le premier
             message envoyé qui remplira cette liste. */
          <EmptyScene icon={Bot} title={t("emptyTitle")} size="compact" />
        ) : listCount === 0 ? (
          // Le filtre, lui, a simplement vidé la liste : une ligne discrète suffit,
          // la colonne n'est pas vide, elle est restreinte.
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {tCommon("noFilterMatch")}
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            {/* Un projet, ses conversations. Aucune entrée synthétique : un
                brouillon n'est pas une conversation — la colonne ne montre que ce
                qui existe, c'est-à-dire à partir du premier message envoyé. */}
            {groups.map((g) => (
              <SessionGroupRows
                key={g.key}
                group={g}
                open={filtering || !collapsedGroups.has(g.key)}
                showAll={filtering || expandedGroups.has(g.key)}
                collapsible={!filtering}
                canLaunch={!!g.project && gitLinked.has(g.project.id)}
                selectedKey={selectedKey}
                reads={reads}
                fmtDay={fmtDay}
                onToggle={() => toggleGroup(g.key)}
                onShowAll={() => setExpandedGroups((prev) => toggledSet(prev, g.key))}
                onSelect={selectReal}
                onNewSession={() => startNewSession(g.project?.id)}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </SecondarySidebar>

      {/* ── Droite : conversation de la session, ou conversation vierge ───── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden",
        )}
      >
        {freeComposeActive ? (
          <SessionCompose
            // Le pré-remplissage du composer est one-shot (montage) : un « Nouveau »,
            // ou une NOUVELLE note lancée depuis le carnet, doit remonter un composer
            // neuf plutôt que garder le texte du précédent.
            key={`${composeNonce}:${freeDraft?.prompt ?? ""}`}
            initialText={freeDraft?.prompt}
            initialProjectId={freeDraft?.projectId ?? newSessionProjectId ?? undefined}
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
          />
        ) : activeItem ? (
          <AgentSessionDetail
            key={activeItem.runId}
            item={activeItem}
            compose={issueComposeSelected}
            composeInitialText={issueComposeSelected ? issueDraft?.prompt : undefined}
            // Cadrage (« Générer un plan » / « Vérifier le plan ») et contrôle
            // (« Vérifier l'implémentation ») : le ticket ne démarre pas au
            // lancement, il garde son statut. Le brouillon porte l'intention du
            // bouton d'origine, pas ce que le composer contient à l'envoi.
            composeIntent={
              issueComposeSelected ? issueDraft?.intent ?? "implement" : undefined
            }
            onLaunched={(run: AgentRunSummary) => setLaunchedRunId(run.id)}
            onBack={() => setMobileDetail(false)}
            onOpenIssue={(issueId, projectId) => setPanel({ projectId, issueId })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {/* Renommer / supprimer, depuis le clic droit de la liste. */}
      <SessionNameDialog
        session={renameTarget}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onSubmit={(name) =>
          renameTarget ? renameSession(renameTarget, name) : Promise.resolve()
        }
      />
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("deleteSessionTitle", {
                name: deleteTarget
                  ? agentSessionTitle(deleteTarget, t("freeSessionTitle"))
                  : "",
              })}
            </DialogTitle>
            {/* Ce qui part avec : tout le fil, et le travail de l'agent avec lui.
                Une conversation ne va pas à la corbeille — il n'y en a pas pour
                elle, et le dire vaut mieux que de le laisser découvrir. */}
            <DialogDescription>{t("deleteSessionDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => deleteTarget && void deleteSession(deleteTarget)}
            >
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panneau latéral de l'issue liée — overlay par-dessus la page (pas de nav). */}
      {panel ? (
        <PrIssuePanel
          key={`${panel.projectId}:${panel.issueId}`}
          projectId={panel.projectId}
          issueId={panel.issueId}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}
