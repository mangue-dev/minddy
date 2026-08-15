"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AppShell,
  Header,
  MobileNav,
  Spinner,
  cn,
  toast,
  useMediaQuery,
} from "mangue-ui";
import {
  Home,
  ChevronLeft,
  Plus,
  Inbox,
  LayoutGrid,
  Target,
  CircleDotDashed,
  MessagesSquare,
  Settings,
  ListTodo,
  Keyboard,
  CalendarClock,
  GitPullRequest,
  NotebookPen,
  IterationCw,
  Brush,
  TriangleAlert,
  Focus,
  PanelsTopLeft,
  Download,
  FileClock,
  FileText,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useCreate } from "@/lib/create-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useNotifications } from "@/lib/use-notifications";
import { useMyInvitations } from "@/lib/use-invitations-query";
import { issuesQueryFn } from "@/lib/issues-api";
import { useSearchIndex } from "@/lib/use-search-index";
import { mergeByProject } from "@/lib/palette-index-merge";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { usePagesQuery } from "@/lib/use-pages-query";
import { markDraftPage } from "@/lib/pages-draft";
import { useAllPullRequestsQuery, useAgentSessionsQuery } from "@/lib/use-agent-runs";
import { useSmartAssignWarningsQuery } from "@/lib/use-smart-assign-warnings-query";
import { useTriageCountsQuery, triageCountTotal } from "@/lib/use-triage-counts-query";
import { useAgentReads } from "@/lib/use-agent-reads";
import { isAgentSessionUnread } from "@/lib/agent-api";
import { issueIdentifier } from "@/lib/issue-constants";
import { AppBreadcrumb } from "@/components/app-breadcrumb";
import {
  HeaderSearchPill,
  type PaletteGroup,
  type PaletteItem,
} from "@/components/header-search-pill";
import { NewMenu } from "@/components/new-menu";
import { ScratchpadTrigger } from "@/components/scratchpad/scratchpad-trigger";
import { UsageIndicator } from "@/components/usage-indicator";
import { usePlanGates } from "@/lib/use-billing-query";
import { CommandPalette } from "@/components/command-palette";
import { MobileNavActions } from "@/components/mobile-nav-actions";
import { MobileMenuFooter, useAccountActions } from "@/components/mobile-account";
import { ProjectOrb, projectOrbIcon } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { NumoIcon } from "@/components/numo-icon";
import {
  AppSidebar,
  EXPANDED_WIDTH,
  type AppNavItem,
  type AppNavSection,
} from "@/components/app-sidebar";
import {
  SecondarySidebarSlot,
  SECONDARY_WIDTH,
} from "@/components/secondary-sidebar";
import { ZenNavOverlay } from "@/components/zen-nav-overlay";
import {
  routeHasSecondaryNav,
  useSecondarySidebar,
} from "@/lib/secondary-sidebar-context";
import {
  settingsSectionHref,
  useSettingsSections,
  type SettingsSection,
} from "@/lib/settings-sections";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { useZenMode } from "@/lib/zen-mode-context";
import { useBranchCleanupTargets } from "@/lib/use-branch-cleanup-targets";
import { BranchCleanupDialog } from "@/components/settings/git-branch-cleanup";
import type {
  BranchCleanupTarget,
  PageSearchHit,
  Project,
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexPage,
} from "@/lib/types";
import { usePageContentSearch } from "@/lib/use-page-search";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { draftIconUrl, draftOrbSeed } from "@/lib/project-draft";

/**
 * How many rows from OTHER projects the mobile surfaces get, per data group.
 *
 * The desktop palette is virtualized (react-window mounts only visible rows),
 * so it takes the whole list. mangue-ui's MobileNav is not: its cmdk search
 * sheet and its "⋯" menu mount every item they're given, and cross-project
 * search would hand them thousands.
 */
const MOBILE_CROSS_PROJECT_ROWS = 100;

/** The project the user is in, complete (exactly what mobile had before
 *  MIN-91), plus the most recently updated rows from the other projects.
 *  `rows` arrives current-project-first, index order after (mergeByProject). */
function capForMobile<T extends { project_id: string }>(
  rows: T[],
  currentProjectId: string | null
): T[] {
  const capped: T[] = [];
  let others = 0;
  for (const r of rows) {
    if (currentProjectId && r.project_id === currentProjectId) {
      capped.push(r);
    } else if (others < MOBILE_CROSS_PROJECT_ROWS) {
      others++;
      capped.push(r);
    }
  }
  return capped.length === rows.length ? rows : capped;
}

/**
 * L'extrait, dans la place qu'une ligne de palette lui laisse. Il est déjà
 * borné par `ts_headline` (une vingtaine de mots) ; cette coupe-ci est le
 * garde-fou d'affichage, pour que le nom du projet reste lisible à sa gauche.
 */
const MAX_EXCERPT_CHARS = 90;

function truncateExcerpt(excerpt: string): string {
  return excerpt.length <= MAX_EXCERPT_CHARS
    ? excerpt
    : `${excerpt.slice(0, MAX_EXCERPT_CHARS).trimEnd()}…`;
}

// L'export CSV est différé comme les dialogues de création : un dialogue qu'on
// ouvre depuis ⌘K quelques fois dans la vie d'un compte n'a rien à faire dans le
// bundle de chaque page.
const ExportIssuesDialog = dynamic(
  () => import("@/components/export-issues-dialog").then((m) => m.ExportIssuesDialog),
  { ssr: false }
);

/** Right-aligned project tag shown on palette rows (orb + name), à la AutoKap. */
function projectChip(project: Project) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <ProjectOrb seed={projectOrbSeed(project)} iconUrl={project.icon_url} className="size-3.5" />
      <span className="max-w-[9rem] truncate">{project.name}</span>
    </span>
  );
}

// The palette icon slot renders `<Icon className="size-4 …" />` with no way to
// pass a color, so we hand it a per-color component (the objective's dot, like
// on the objectives page). Cache by color to keep component identity stable
// across renders — otherwise the dot remounts (mirrors projectOrbIcon).
const objectiveDotCache = new Map<string, ComponentType<{ className?: string }>>();

function objectiveDotIcon(color: string | null): ComponentType<{ className?: string }> {
  const key = color ?? "none";
  const cached = objectiveDotCache.get(key);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <span className={cn("flex items-center justify-center", className)} aria-hidden>
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
    </span>
  );
  Icon.displayName = `ObjectiveDotIcon(${key})`;
  objectiveDotCache.set(key, Icon);
  return Icon;
}

// L'emoji d'une page du wiki, dans la fente à icône de la palette (MIN-270).
// Mis en cache par emoji pour la même raison que le point d'objectif : le slot
// reçoit un COMPOSANT, et en fabriquer un neuf à chaque rendu le remonterait.
const emojiIconCache = new Map<string, ComponentType<{ className?: string }>>();

function emojiIcon(emoji: string): ComponentType<{ className?: string }> {
  const cached = emojiIconCache.get(emoji);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <span
      className={cn("flex items-center justify-center text-sm leading-none", className)}
      aria-hidden
    >
      {emoji}
    </span>
  );
  Icon.displayName = `EmojiIcon(${emoji})`;
  emojiIconCache.set(emoji, Icon);
  return Icon;
}

/** Visage de Numo en icône statique de nav/palette (pas de clignement perpétuel,
    comme les icônes de liste). Slotté là où les tabs lucide passent un `className`. */
const NumoNavIcon = ({ className }: { className?: string }) => (
  <NumoIcon animated={false} className={className} />
);
NumoNavIcon.displayName = "NumoNavIcon";

/**
 * Le compteur d'une entrée de la sidebar (inbox, PR, triage, feedback, projet).
 * Plafonné à « 99+ » : une file très en retard ne doit pas élargir la ligne au
 * point de rogner le nom du projet. `label` sert de lecture au lecteur d'écran,
 * pour qui un « 12 » posé à côté d'un nom de projet ne veut rien dire.
 */
function countBadge(count: number, label?: string) {
  return (
    <span
      className="text-xs tabular-nums text-muted-foreground"
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Le même compteur, REPLIÉ en pastille de coin pour le mode rail : la ligne n'y
 * est plus qu'une icône, et le chiffre posé au bout n'a plus de bout où se
 * poser. Sans lui la file disparaît purement et simplement dès qu'une page porte
 * une sidebar secondaire — c'est-à-dire sur les pages mêmes où l'on trie.
 *
 * Trois écarts avec la version dépliée, tous imposés par la boîte de 36 px :
 *
 * - **Plafond à « 9+ »**, pas « 99+ ». Ce n'est pas un choix de goût : la
 *   pastille est ancrée en haut à DROITE de la boîte et grandit vers la gauche,
 *   c'est-à-dire par-dessus l'icône. Trois caractères l'effacent, et le rail ne
 *   montre plus alors qu'un compteur sans dire de quoi.
 * - **Fond à la couleur de la barre**, là où la version dépliée n'a pas de fond
 *   du tout : posé à même les traits de l'icône, un chiffre nu ne se lit pas.
 *   Une pastille TEINTÉE ferait une seconde forme à lire ; à la couleur du fond,
 *   elle ne se voit pas — elle découpe simplement l'icône, et le chiffre a l'air
 *   posé dessus, sans rien ajouter. Le `px` la fait respirer : sans lui, la
 *   découpe s'arrête au chiffre et un trait d'icône vient le toucher.
 * - **`aria-label` porte le compte EXACT** quand l'affichage plafonne : « 9+ »
 *   lu à voix haute ne dit rien de ce qui attend.
 *
 * Son encombrement est celui du spinner « agent en cours » (14 px), à un ou deux
 * pixels près : tout ce qui se replie dans ce coin y tient la même place.
 */
function countBadgeCollapsed(count: number, label?: string) {
  return (
    <span
      className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sidebar px-[3px] text-[10px] font-medium leading-none tabular-nums text-sidebar-foreground/90"
      aria-label={label ?? String(count)}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Les champs de badge d'une entrée qui porte un COMPTEUR, dépliée et repliée
 * d'un seul geste — l'oubli du second est invisible tant qu'on ne va pas sur
 * une page à sidebar secondaire. Zéro ne rend rien : la ligne reste nue.
 */
function countBadges(
  count: number,
  label?: string
): Pick<AppNavItem, "badge" | "badgeCollapsed" | "showBadgeCollapsed"> {
  if (count <= 0) return {};
  return {
    badge: countBadge(count, label),
    badgeCollapsed: countBadgeCollapsed(count, label),
    showBadgeCollapsed: true,
  };
}

/**
 * La marque d'un brouillon de projet, à la place exacte du compteur « à trier »
 * d'un projet créé : c'est le seul point où la ligne diffère, et le vide y
 * laisserait croire à un projet sans rien à trier.
 */
function draftBadge(label: string) {
  return <FileClock className="size-3.5 text-muted-foreground" aria-label={label} />;
}

/** Muted monospace identifier badge, e.g. "MIND-42". */
function identifierBadge(id: string) {
  return (
    <span className="font-mono text-[0.7rem] font-medium tabular-nums text-muted-foreground/70">
      {id}
    </span>
  );
}

export function AppShellChrome({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Nav");
  const ti = useTranslations("Issue");
  const tk = useTranslations("Keyboard");
  const tScratch = useTranslations("Scratchpad");
  const tRoutines = useTranslations("Routines");
  const tSettings = useTranslations("Settings");
  const tExport = useTranslations("Export");
  const tBilling = useTranslations("Billing");
  const tProjects = useTranslations("Projects");
  const tPages = useTranslations("Pages");
  const { agentsAllowed, projectLimitReached } = usePlanGates();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const {
    projects,
    openCreateProject,
    projectDrafts,
    openProjectDraft,
    deleteProjectDraft,
  } = useProjects();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const { open: openScratchpad } = useScratchpad();
  const { unreadCount } = useNotifications();
  // Le badge de l'inbox compte aussi les invitations en attente : elles s'y
  // affichent, et rien d'autre ne les signale une fois la home quittée.
  const { invitations } = useMyInvitations();
  const inboxCount = unreadCount + invitations.length;
  const { setOpen: setCheatsheetOpen } = useCheatsheet();
  // Mode zen (MIN-134) : la palette est le seul interrupteur, et la seule sortie
  // avec le rechargement — elle reste donc montée, quoi qu'on masque autour.
  const { zen, toggle: toggleZen } = useZenMode();
  // Entre le téléphone et le bureau large, on conserve le chrome desktop mais
  // on rend les 256 px de la barre : le panneau du zen revient au survol du
  // bord gauche, sans pousser le contenu ni activer la barre mobile.
  const compactDesktop = useMediaQuery(
    "(min-width: 768px) and (max-width: 1199px)",
  );

  // Command palette open state — shared by the header search pill and the
  // global shortcuts (⌘K / ⌘P / F, handled inside <CommandPalette>).
  const [paletteOpen, setPaletteOpen] = useState(false);

  // La page porte-t-elle une sidebar secondaire ? Le montage de la barre est la
  // réponse exacte ; la route donne la même avant l'hydratation, où rien n'est
  // encore monté (cf. routeHasSecondaryNav). Sans elle, le HTML du serveur
  // partirait sidebar primaire dépliée et contenu pleine largeur, pour tout
  // réorganiser d'un coup à l'hydratation.
  const { present: secondaryPresent } = useSecondarySidebar();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const secondaryNav =
    secondaryPresent || (!hydrated && routeHasSecondaryNav(pathname));

  const currentProjectId = projectIdFromPath(pathname);
  const currentProject = projects.find((p) => p.id === currentProjectId) ?? null;
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  // Ménage des branches d'agent (MIN-102), offert dans la palette DEPUIS
  // N'IMPORTE OÙ : une ligne par projet éligible (owner + dépôt lié + des
  // branches poussées par l'agent), pas seulement pour le projet de la page.
  // Une seule requête couvre tous mes projets — cf. use-branch-cleanup-targets.
  const branchCleanupTargets = useBranchCleanupTargets();
  // La cible SURVIT à la fermeture (le dialogue joue son animation de sortie) ;
  // c'est `branchCleanupOpen` qui ouvre et ferme.
  const [branchCleanup, setBranchCleanup] = useState<BranchCleanupTarget | null>(null);
  const [branchCleanupOpen, setBranchCleanupOpen] = useState(false);
  const openBranchCleanup = useCallback((target: BranchCleanupTarget) => {
    setBranchCleanup(target);
    setBranchCleanupOpen(true);
  }, []);

  // Export CSV : une seule ligne de palette, jamais par projet — c'est le
  // dialogue qui demande la portée, parce qu'« un projet ou tous » est justement
  // la question qu'on se pose en cliquant. Comme pour le ménage des branches, le
  // montage SURVIT à la fermeture le temps de l'animation de sortie.
  const [exportMounted, setExportMounted] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const openExport = useCallback(() => {
    setExportMounted(true);
    setExportOpen(true);
  }, []);

  const isInbox = pathname.startsWith("/inbox");

  // Shares the ["issues", projectId] cache with the board (no extra realtime
  // bridge). Since MIN-91 the palette lists every project's tickets from the
  // search index — this cache is what makes the CURRENT project's rows exact
  // (realtime-fresh) rather than as-of-the-snapshot.
  const { data: projectIssues } = useQuery({
    queryKey: ["issues", currentProjectId ?? ""],
    queryFn: issuesQueryFn(currentProjectId as string),
    enabled: !!currentProjectId,
  });

  // Objectives feed the palette list. useObjectivesQuery shares the
  // ["objectives", projectId] cache, kept fresh by realtime — les lignes du
  // projet courant sont donc exactes, là où l'index de recherche est un
  // instantané.
  const { objectives: projectObjectives, loading: objectivesLoading } =
    useObjectivesQuery(currentProjectId);

  // Les pages du wiki du projet courant, pour ⌘K (MIN-270). Même cache que
  // l'arbre de l'onglet Pages : ouvrir l'onglet ne redemande rien, et une page
  // renommée là-bas change de nom dans la palette sans aller-retour.
  const { pages: wikiPages, createPage: createWikiPage } =
    usePagesQuery(currentProjectId);

  /**
   * « Nouvelle page » depuis ⌘K : la page est créée puis OUVERTE, comme le fait
   * le « + » de la barre secondaire (components/pages/pages-shell.tsx).
   *
   * Pas de dialogue en chemin, contrairement à un ticket ou à un objectif : une
   * page n'a rien à renseigner avant d'exister — son titre se tape dans le
   * document. Le geste attendu depuis la palette est donc « je suis dans la
   * page neuve », pas « je remplis un formulaire ».
   *
   * `markDraftPage`, comme partout ailleurs : une page créée n'est pas une page
   * sauvegardée, et repartir sans y écrire une lettre la fait disparaître.
   */
  const createPageFromPalette = useCallback(
    (projectId: string) => {
      void (async () => {
        try {
          const page = await createWikiPage({});
          markDraftPage(page.id);
          router.push(`/projects/${projectId}/pages/${page.id}`);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : tPages("createFailed")
          );
        }
      })();
    },
    [createWikiPage, router, tPages]
  );

  // Cross-project search (MIN-91): every ticket and objective of every project,
  // so ⌘K finds them from any page. Loaded once per tab on browser idle (or on
  // the first palette open), then merged with the current project's fresher
  // caches below.
  const {
    index: searchIndex,
    armNow: armSearchIndex,
    refreshIfStale: refreshSearchIndex,
  } = useSearchIndex();

  const paletteIssues = useMemo<SearchIndexIssue[]>(
    () =>
      mergeByProject(searchIndex?.issues ?? [], currentProjectId, projectIssues),
    [searchIndex, currentProjectId, projectIssues]
  );
  // Les pages du wiki, TOUS PROJETS (MIN-276). Même fusion que les tickets : le
  // projet courant vient de son cache vivant (renommer une page dans l'arbre la
  // renomme dans ⌘K sans aller-retour), les autres de l'instantané.
  const palettePages = useMemo<SearchIndexPage[]>(
    () =>
      mergeByProject(
        searchIndex?.pages ?? [],
        currentProjectId,
        wikiPages.length > 0
          ? wikiPages.map((p) => ({
              id: p.id,
              project_id: p.project_id,
              title: p.title,
              icon: p.icon,
              updated_at: p.updated_at,
            }))
          : null
      ),
    [searchIndex, currentProjectId, wikiPages]
  );

  // Et ce que les titres ne peuvent pas donner : les pages dont le CONTENU
  // répond. Une requête au serveur, en retard sur la frappe, qui enrichit la
  // liste déjà affichée au lieu de la faire attendre.
  const pageContentHits = usePageContentSearch(paletteOpen);

  const paletteObjectives = useMemo<SearchIndexObjective[]>(
    () =>
      mergeByProject(
        searchIndex?.objectives ?? [],
        currentProjectId,
        // An empty array means "this project has none" — but it also means "not
        // loaded yet", and replacing the index's rows with that would blink the
        // current project's objectives out of the list. Keep the index until the
        // real answer lands.
        objectivesLoading ? null : projectObjectives
      ),
    [searchIndex, currentProjectId, projectObjectives, objectivesLoading]
  );

  // Triage is a hidden issue status — the sidebar counter derives from the
  // same issues cache the board and search already keep fresh.
  const triageCount = (projectIssues ?? []).filter((i) => i.status === "triage").length;

  // Feedback (MIN-37) : compteur des retours ouverts/prévus, via un endpoint
  // léger (le badge n'a pas besoin de la liste complète).
  const { data: feedbackCountData } = useQuery({
    queryKey: ["feedback-count", currentProjectId ?? ""],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${currentProjectId}/feedback/counts`);
      if (!r.ok) return { count: 0 };
      return (await r.json()) as { count: number };
    },
    enabled: !!currentProjectId,
    staleTime: 60_000,
  });
  const feedbackCount = feedbackCountData?.count ?? 0;

  // Pull Requests (MIN-66) : compteur des PR ouvertes. La liste est globale
  // (l'onglet pointe vers /pull-requests), donc on dérive le compte de la même
  // query que la page, dans son état par défaut — le serveur ne renvoie déjà que
  // les ouvertes (open + draft).
  //
  // Depuis MIN-143 il compte TOUTES les PR ouvertes du dépôt, pas seulement
  // celles de Numo. C'est voulu : la pastille annonce ce que l'onglet contient,
  // et la restreindre aux PR rattachées à un ticket rouvrirait exactement le
  // problème que MIN-143 ferme — un écran qui montre la moitié du dépôt.
  const { pullRequests } = useAllPullRequestsQuery();
  const openPrCount = pullRequests.length;

  // Smart Assign actif mais sans règles sur un de mes projets (MIN-31) : la
  // sidebar en porte la marque, et c'est l'accueil qui l'explique — l'entrée
  // « Accueil » la porte donc, dans les deux modes de la sidebar.
  const { warnings: smartAssignWarnings } = useSmartAssignWarningsQuery();
  const smartAssignBadge =
    smartAssignWarnings.length > 0 ? (
      <TriangleAlert
        className="size-3.5 text-amber-500"
        aria-label={t("smartAssignIncomplete")}
      />
    ) : undefined;

  // Ce qui attend d'être trié dans chacun de mes projets — tickets en triage +
  // retours ouverts, la file « À trier » de l'accueil vue par projet. Hors d'un
  // projet, la sidebar ne montrait rien de tout ça : elle y liste les projets
  // sans un seul badge, et le triage d'ailleurs restait invisible tant qu'on
  // n'entrait pas dedans. Chaque ligne de projet porte donc maintenant la somme
  // des deux compteurs qu'on lira sur ses onglets une fois à l'intérieur.
  const { counts: triageCounts } = useTriageCountsQuery();
  // Depuis un projet, la même information sur les AUTRES : l'entrée de retour
  // « Accueil » en porte le total (celui du projet courant est déjà sur ses
  // propres onglets, deux lignes plus bas).
  const triageElsewhere = useMemo(
    () =>
      Object.entries(triageCounts).reduce(
        (sum, [projectId, count]) =>
          projectId === currentProjectId ? sum : sum + triageCountTotal(count),
        0
      ),
    [triageCounts, currentProjectId]
  );
  // L'entrée « Accueil » cumule donc deux marques. Le coin de l'icône n'en tient
  // qu'UNE : le triangle passe devant, parce qu'un réglage incomplet ne se
  // rattrape pas tout seul là où une file finit toujours par se vider.
  const homeBadge =
    smartAssignBadge || triageElsewhere > 0 ? (
      <span className="flex items-center gap-1.5">
        {smartAssignBadge}
        {triageElsewhere > 0
          ? countBadge(
              triageElsewhere,
              t("triageElsewhereBadge", { count: triageElsewhere })
            )
          : null}
      </span>
    ) : undefined;
  const homeBadgeCollapsed =
    smartAssignBadge ??
    (triageElsewhere > 0
      ? countBadgeCollapsed(
          triageElsewhere,
          t("triageElsewhereBadge", { count: triageElsewhere })
        )
      : undefined);

  // Agents : un spinner sur l'onglet dès qu'une session TRAVAILLE (génération en
  // cours), tous projets confondus ; sinon une bulle bleue si au moins une session a
  // TERMINÉ sans avoir été consultée (le travail en cours prime sur le non-lu).
  const { sessions: agentSessions } = useAgentSessionsQuery();
  const { reads: agentReads } = useAgentReads();
  const anyAgentWorking = agentSessions.some((s) => s.working);
  const anyAgentUnread = agentSessions.some((s) => isAgentSessionUnread(s, agentReads));
  // Une session attend une réponse (ask_user) et n'est pas lue → point JAUNE
  // prioritaire sur le bleu « terminé, non lu ».
  const anyAgentAwaiting = agentSessions.some(
    (s) => s.awaitingInput && isAgentSessionUnread(s, agentReads),
  );

  const commandGroups = useMemo<PaletteGroup[]>(() => {
    const groups: PaletteGroup[] = [];
    const createKw = ["create", "créer", "new", "nouveau"];

    // ── Create (issue-first) ──────────────────────────────────────────
    // New issue is always the leading option. Inside a project it targets that
    // project; from anywhere else you pick which project to create it in.
    const createItems: PaletteItem[] = [];
    if (currentProject) {
      createItems.push({
        key: "create-issue",
        label: t("newIssue"),
        icon: ListTodo,
        keywords: [...createKw, ti("entity"), currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        onSelect: () => openCreateIssue({ projectId: currentProject.id }),
      });
      createItems.push({
        key: "create-objective",
        label: t("newObjective"),
        icon: Target,
        keywords: [...createKw, currentProject.name, currentProject.key],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        onSelect: () => openCreateObjective({ projectId: currentProject.id }),
      });
      // La page ne suit le projet ouvert que DANS un projet, contrairement au
      // ticket : hors projet, la palette ne saurait pas dans quel wiki écrire,
      // et le cache des pages n'est chargé que pour le projet courant.
      createItems.push({
        key: "create-page",
        label: tPages("newPage"),
        icon: FileText,
        keywords: [
          ...createKw,
          "page",
          "wiki",
          "document",
          "doc",
          "note",
          currentProject.name,
          currentProject.key,
        ],
        meta: projectChip(currentProject),
        metaText: currentProject.name,
        onSelect: () => createPageFromPalette(currentProject.id),
      });
    } else {
      for (const p of projects) {
        createItems.push({
          key: `create-issue-${p.id}`,
          label: t("newIssue"),
          icon: ListTodo,
          keywords: [...createKw, ti("entity"), p.name, p.key],
          meta: projectChip(p),
          metaText: p.name,
          onSelect: () => openCreateIssue({ projectId: p.id }),
        });
      }
      // Objective creation from anywhere (MIN-33): one entry — the dialog's split
      // button picks the target project.
      if (projects.length > 0) {
        createItems.push({
          key: "create-objective",
          label: t("newObjective"),
          icon: Target,
          keywords: createKw,
          onSelect: () => openCreateObjective(),
        });
      }
    }
    if (!projectLimitReached) {
      createItems.push({
        key: "create-project",
        label: t("newProject"),
        icon: Plus,
        keywords: createKw,
        onSelect: openCreateProject,
      });
    }
    // Les brouillons vivent DANS le groupe « Créer », sous « Nouveau projet » :
    // un brouillon est une création en cours, et les deux lignes mènent au même
    // endroit — le wizard, neuf ou repris. Les mettre dans « Aller à » aurait
    // rangé une modale parmi des destinations.
    //
    // Pas de verrou de plan ici, contrairement à « Nouveau projet » : reprendre
    // un brouillon n'est pas créer, et le plafond se dit à la création.
    for (const d of projectDrafts) {
      createItems.push({
        key: `resume-project-draft-${d.id}`,
        label: tProjects("draftResume", { name: d.name }),
        icon: FileClock,
        keywords: [...createKw, d.name, "brouillon", "draft", "reprendre", "resume"],
        onSelect: () => openProjectDraft(d),
      });
    }
    groups.push({ key: "create", heading: t("create"), items: createItems });

    // ── Go to (global) ────────────────────────────────────────────────
    groups.push({
      key: "goto",
      heading: t("goTo"),
      items: [
        { key: "go-home", label: t("home"), icon: Home, onSelect: () => router.push("/home") },
        { key: "go-inbox", label: t("inbox"), icon: Inbox, onSelect: () => router.push("/inbox") },
        {
          key: "open-notes",
          label: tScratch("open"),
          icon: NotebookPen,
          keywords: ["notes", "scratchpad", "todo", "tâches", "problems"],
          onSelect: () => openScratchpad("palette"),
        },
        ...(agentsAllowed
          ? [
              {
                key: "go-pull-requests",
                label: t("pullRequests"),
                icon: GitPullRequest,
                onSelect: () => router.push("/pull-requests"),
              },
              {
                key: "go-agents",
                label: t("agents"),
                icon: NumoNavIcon,
                onSelect: () => router.push("/agents"),
              },
              {
                // Les ROUTINES (MIN-185) sont un onglet de la vue Agents, pas
                // une page : sans entrée à elles, chercher « routine » ne
                // menait nulle part — l'onglet ne se trouvait qu'en sachant
                // déjà qu'il existe.
                key: "go-routines",
                label: tRoutines("title"),
                icon: CalendarClock,
                keywords: [
                  "routine",
                  "routines",
                  "schedule",
                  "scheduled",
                  "cron",
                  "récurrent",
                  "programmé",
                  "planifié",
                ],
                onSelect: () => router.push("/agents?tab=routines"),
              },
            ]
          : []),
        {
          key: "go-all-global",
          label: t("allIssues"),
          icon: LayoutGrid,
          onSelect: () => router.push("/all"),
        },
        {
          // Le cycle est personnel et cross-projet : il vit sur /all en mode
          // cycle (MIN-32), jamais scopé à un projet — même destination que
          // l'onglet ↗ des boards et la carte de la home.
          key: "go-cycle",
          label: t("cycle"),
          icon: IterationCw,
          keywords: [
            "cycle",
            "sprint",
            "semaine",
            "week",
            "quinzaine",
            "fortnight",
            "itération",
            "iteration",
          ],
          onSelect: () => router.push("/all?view=cycle"),
        },
        {
          key: "go-account-settings",
          label: t("accountSettings"),
          icon: Settings,
          onSelect: () => router.push("/settings"),
        },
        {
          // Sortir ses tickets en CSV — le geste qu'on vient chercher dans ⌘K
          // chez Linear, et qu'on cherchait donc ici. Le dialogue demande le
          // projet et les statuts ; cette ligne ne présume de rien.
          key: "export-issues",
          label: tExport("title"),
          icon: Download,
          keywords: [
            "export",
            "exporter",
            "csv",
            "excel",
            "tableur",
            "spreadsheet",
            "download",
            "télécharger",
            "telecharger",
            "backup",
            "sauvegarde",
            "sortir",
          ],
          onSelect: openExport,
        },
        {
          key: "keyboard-shortcuts",
          label: tk("shortcutsTitle"),
          icon: Keyboard,
          keywords: ["keyboard", "shortcuts", "raccourcis", "clavier", "cheatsheet", "help", "aide"],
          onSelect: () => setCheatsheetOpen(true),
        },
        {
          // Mode zen (MIN-134) : entrée unique, dans les deux sens. Sans bouton
          // ailleurs, cette ligne est aussi la porte de sortie — d'où le libellé
          // qui bascule plutôt qu'un « Mode zen » ambigu une fois dedans.
          key: "toggle-zen",
          label: zen ? t("zenModeExit") : t("zenMode"),
          icon: zen ? PanelsTopLeft : Focus,
          keywords: [
            "zen",
            "focus",
            "concentration",
            "distraction",
            "épuré",
            "epure",
            "minimal",
            "plein écran",
            "plein ecran",
            "fullscreen",
          ],
          onSelect: toggleZen,
        },
      ],
    });

    if (projects.length > 0) {
      // ── Projects (quick switch) ─────────────────────────────────────
      groups.push({
        key: "projects",
        heading: t("projects"),
        items: projects.map((p) => ({
          key: `project-${p.id}`,
          label: p.name,
          icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
          keywords: [p.key],
          contextId: p.id,
          onSelect: () => router.push(`/projects/${p.id}`),
        })),
      });

      // ── Pages (per-project navigation) ──────────────────────────────
      const pageItems: PaletteItem[] = [];
      for (const p of projects) {
        const base = `/projects/${p.id}`;
        const chip = projectChip(p);
        const metaText = p.name;
        const kw = [p.name, p.key];
        // contextId: with several projects the same five page names repeat, so
        // the current project's copies are the ones that should rank first.
        const contextId = p.id;
        pageItems.push(
          {
            key: `pg-tickets-${p.id}`,
            label: t("tickets"),
            icon: LayoutGrid,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(base),
          },
          {
            key: `pg-obj-${p.id}`,
            label: t("objectives"),
            icon: Target,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/objectives`),
          },
          // Entre Objectifs et Triage, comme dans la sidebar : la palette dit
          // les écrans d'un projet dans l'ordre où on les y voit.
          {
            key: `pg-pages-${p.id}`,
            label: t("pages"),
            icon: FileText,
            keywords: [...kw, "wiki", "documentation", "doc"],
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/pages`),
          },
          {
            key: `pg-triage-${p.id}`,
            label: t("triage"),
            icon: CircleDotDashed,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/triage`),
          },
          {
            key: `pg-feedback-${p.id}`,
            label: t("feedback"),
            icon: MessagesSquare,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/feedback`),
          },
          {
            key: `pg-set-${p.id}`,
            label: t("projectSettings"),
            icon: Settings,
            keywords: kw,
            meta: chip,
            metaText,
            contextId,
            onSelect: () => router.push(`${base}/settings`),
          },
        );
      }

      // Ménage des branches d'agent (MIN-102) — une action, pas une page, mais
      // par projet comme le reste du groupe, et joignable de n'importe où : une
      // ligne par projet éligible, avec sa puce, parce qu'une suppression de
      // branches doit dire sur quel dépôt elle porte.
      for (const target of branchCleanupTargets) {
        const p = projectById.get(target.project_id);
        if (!p) continue;
        pageItems.push({
          key: `pg-clean-branches-${p.id}`,
          label: tSettings("gitCleanBranches"),
          icon: Brush,
          keywords: [
            p.name,
            p.key,
            "git",
            "branches",
            "github",
            "gitlab",
            "nettoyer",
            "clean",
            "cleanup",
            "pull request",
            ...(target.repo_full_name ? [target.repo_full_name] : []),
          ],
          meta: projectChip(p),
          metaText: target.repo_full_name ?? p.name,
          contextId: p.id,
          onSelect: () => openBranchCleanup(target),
        });
      }

      // « Aller à » et non « Pages » : depuis MIN-270, une Page est un objet du
      // produit (le wiki d'un projet). Garder ce mot pour le groupe des ÉCRANS
      // mettrait deux choses différentes sous le même titre, dans la même liste.
      groups.push({ key: "pages", heading: t("goTo"), items: pageItems });
    }

    return groups;
  }, [projects, projectById, projectDrafts, openProjectDraft, currentProject, createPageFromPalette, router, openCreateProject, openCreateIssue, openCreateObjective, openScratchpad, agentsAllowed, projectLimitReached, branchCleanupTargets, openBranchCleanup, openExport, zen, toggleZen, t, ti, tk, tPages, tScratch, tSettings, tExport, tProjects, setCheatsheetOpen]);

  // ── Réglages : une ligne par CARTE, pas par onglet ───────────────────────
  // Un onglet de réglages est une colonne de cartes ; « Cadence », « Zone
  // sensible » ou « Agir en votre nom » ne sont pas des onglets, et ce sont
  // pourtant ces mots-là qu'on tape. Choisir une ligne ouvre donc la bonne page,
  // y sélectionne le bon onglet, déroule jusqu'à la carte et la surligne
  // (lib/settings-sections.ts → components/settings-shell.tsx).
  //
  // Le projet offert est CELUI DE LA PAGE, et lui seul : les mêmes treize
  // sections répétées pour chaque projet noieraient la liste, alors que « les
  // réglages de ce projet » est ce qu'on cherche depuis l'intérieur d'un projet.
  // Pour en régler un autre, la ligne « Paramètres du projet » du groupe Pages
  // (elle, offerte pour tous) y emmène d'abord.
  const settingsSections = useSettingsSections();
  const settingsGroups = useMemo<PaletteGroup[]>(() => {
    const row = (s: SettingsSection, project: Project | null): PaletteItem => ({
      key: `settings-${s.id}`,
      label: s.title,
      icon: s.icon,
      keywords: [
        ...s.keywords,
        // L'onglet est un terme de recherche à part entière : « cycles » doit
        // trouver « Cadence », qui ne porte le mot nulle part.
        s.tabLabel,
        ...(project ? [project.name, project.key] : []),
      ],
      meta: project ? projectChip(project) : undefined,
      metaText: project ? project.name : s.tabLabel,
      contextId: project?.id,
      onSelect: () => router.push(settingsSectionHref(s, project?.id)),
    });

    const groups: PaletteGroup[] = [
      {
        key: "settings-account",
        heading: t("accountSettings"),
        items: settingsSections
          .filter((s) => s.scope === "account")
          .map((s) => row(s, null)),
      },
    ];

    if (currentProject) {
      // « Quitter le projet » et « Zone sensible » s'excluent l'une l'autre :
      // proposer la seconde à qui n'est pas propriétaire l'emmènerait sur un
      // onglet où elle n'existe pas.
      const isOwner = currentProject.owner_id === user?.id;
      groups.push({
        key: "settings-project",
        heading: t("projectSettings"),
        items: settingsSections
          .filter(
            (s) =>
              s.scope === "project" &&
              (!s.audience || s.audience === (isOwner ? "owner" : "member")),
          )
          .map((s) => row(s, currentProject)),
      });
    }

    return groups;
  }, [settingsSections, currentProject, user, router, t]);

  // ── Data groups: tickets + objectifs, tous projets confondus (MIN-91) ────
  // Séparés des groupes de commandes ci-dessus parce qu'ils sont les seuls à
  // peser : quelques milliers de lignes, chacune avec ses éléments React
  // (badge d'identifiant, puce de projet). On les fabrique donc à la demande,
  // avec deux budgets — liste complète pour la palette desktop (virtualisée,
  // et qui ne rend rien tant qu'elle est fermée), liste plafonnée pour le nav
  // mobile (qui monte tout ce qu'on lui donne).
  const buildDataGroups = useCallback(
    (
      issues: SearchIndexIssue[],
      objectives: SearchIndexObjective[],
      pages: SearchIndexPage[],
      contentHits: PageSearchHit[] = []
    ): PaletteGroup[] => {
      const groups: PaletteGroup[] = [];

      // L'identifiant porte la clé du projet (MIN-42 vs AKP-7), donc une ligne
      // dit d'où elle vient ; `contextId` fait remonter le projet courant.
      if (issues.length > 0) {
        groups.push({
          key: "issues",
          heading: ti("entityPlural"),
          items: issues.flatMap((i) => {
            const project = projectById.get(i.project_id);
            // Projet inconnu (supprimé, ou quitté) → rien pour étiqueter ni
            // router le ticket : on l'écarte plutôt que d'afficher « -12 ».
            if (!project) return [];
            const id = issueIdentifier(project.key, i.number);
            return [
              {
                key: `issue-${i.id}`,
                label: i.title,
                keywords: [id, String(i.number), project.name, project.key],
                meta: identifierBadge(id),
                metaText: id,
                entityType: "issue",
                contextId: i.project_id,
                data: i,
                onSelect: () => router.push(`/projects/${i.project_id}?issue=${i.id}`),
              },
            ];
          }),
        });
      }

      // Un objectif s'ouvre sur SA page (MIN-226) : c'est un objet qu'on vient
      // voir, plus un panneau qui se posait par-dessus la page courante. Même
      // lien que les notifications, quel que soit le projet.
      if (objectives.length > 0) {
        groups.push({
          key: "objectives",
          heading: t("objectives"),
          items: objectives.flatMap((o) => {
            const project = projectById.get(o.project_id);
            if (!project) return [];
            return [
              {
                key: `objective-${o.id}`,
                label: o.name,
                icon: objectiveDotIcon(o.color),
                keywords: [project.name, project.key],
                meta: projectChip(project),
                metaText: project.name,
                contextId: o.project_id,
                onSelect: () =>
                  router.push(`/projects/${o.project_id}/objectives?open=${o.id}`),
              },
            ];
          }),
        });
      }

      // ── Le wiki, TOUS PROJETS (MIN-270, cross-projet depuis MIN-276) ───
      //
      // Deux sources en une seule liste, et c'est voulu. Les TITRES viennent de
      // l'index (filtrés à la frappe, sans serveur) ; le CONTENU vient de
      // Postgres, avec l'extrait qui dit pourquoi la page sort. L'extrait est
      // posé en `description` : le moteur de la palette classe un match de
      // titre au-dessus d'un match de description, donc « trouvée par son
      // titre » passe devant « citée dans un corps » sans qu'on ait à trier —
      // et le mot cherché reste visible sur la ligne (`metaText`).
      //
      // Une page trouvée par son contenu mais absente de l'index (plafond
      // atteint, instantané périmé) est ajoutée à la liste : le serveur vient
      // de dire qu'elle existe et qu'elle répond.
      const excerptById = new Map(
        contentHits.map((hit) => [hit.id, hit.excerpt] as const)
      );
      const known = new Set(pages.map((p) => p.id));
      const extras: SearchIndexPage[] = contentHits
        .filter((hit) => !known.has(hit.id))
        .map((hit) => ({
          id: hit.id,
          project_id: hit.project_id,
          title: hit.title,
          icon: hit.icon,
          updated_at: hit.updated_at,
        }));

      const allPages = [...pages, ...extras];
      if (allPages.length > 0) {
        groups.push({
          key: "wiki-pages",
          heading: t("pages"),
          items: allPages.flatMap((page) => {
            const project = projectById.get(page.project_id);
            if (!project) return [];
            const excerpt = excerptById.get(page.id) ?? "";
            return [
              {
                key: `wiki-${page.id}`,
                label: page.title || tPages("untitled"),
                icon: page.icon ? emojiIcon(page.icon) : FileText,
                description: excerpt,
                keywords: [project.name, project.key],
                meta: projectChip(project),
                metaText: excerpt
                  ? `${project.name} · ${truncateExcerpt(excerpt)}`
                  : project.name,
                contextId: page.project_id,
                onSelect: () =>
                  router.push(`/projects/${page.project_id}/pages/${page.id}`),
              },
            ];
          }),
        });
      }

      return groups;
    },
    [projectById, router, t, ti, tPages]
  );

  // Desktop: the full list, built only while the palette is open — closed, it
  // renders nothing, so building thousands of rows on every shell re-render
  // (notification polls, agent sessions…) would be pure waste.
  const desktopDataGroups = useMemo(
    () =>
      paletteOpen
        ? buildDataGroups(
            paletteIssues,
            paletteObjectives,
            palettePages,
            pageContentHits
          )
        : [],
    [
      paletteOpen,
      buildDataGroups,
      paletteIssues,
      paletteObjectives,
      palettePages,
      pageContentHits,
    ]
  );

  // Mobile: bounded, always ready (MobileNav's search sheet opens on its own).
  const mobileDataGroups = useMemo(
    () =>
      buildDataGroups(
        capForMobile(paletteIssues, currentProjectId),
        capForMobile(paletteObjectives, currentProjectId),
        capForMobile(palettePages, currentProjectId)
      ),
    [
      buildDataGroups,
      paletteIssues,
      paletteObjectives,
      palettePages,
      currentProjectId,
    ]
  );

  const inboxItem: AppNavItem = {
    key: "inbox",
    label: t("inbox"),
    icon: Inbox,
    href: "/inbox",
    active: isInbox,
    shortcut: "I",
    ...countBadges(inboxCount, t("inboxBadge", { count: inboxCount })),
  };

  // Verrous de plan (MIN-72) : Agents & Pull Requests restent visibles mais
  // grisés quand le plan ne les inclut pas ; « Nouveau projet » se grise au
  // plafond. Partagés par les deux modes de la sidebar (projet / home).
  const pullRequestsItem: AppNavItem = {
    key: "pull-requests",
    label: t("pullRequests"),
    icon: GitPullRequest,
    href: "/pull-requests",
    active: pathname.startsWith("/pull-requests"),
    shortcut: "R",
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    ...countBadges(
      agentsAllowed ? openPrCount : 0,
      t("pullRequestsBadge", { count: openPrCount })
    ),
  };
  const agentsItem: AppNavItem = {
    key: "agents",
    label: t("agents"),
    icon: NumoNavIcon,
    href: "/agents",
    active: pathname.startsWith("/agents"),
    shortcut: "J",
    showBadgeCollapsed: true,
    disabled: !agentsAllowed,
    tooltip: agentsAllowed ? undefined : tBilling("agentsGateTitle"),
    badge:
      agentsAllowed && anyAgentWorking ? (
        <Spinner className="size-3.5 text-muted-foreground" />
      ) : agentsAllowed && anyAgentAwaiting ? (
        // Une session attend une réponse de l'utilisateur → point JAUNE.
        <span
          className="size-2 rounded-full bg-yellow-500"
          aria-label={t("agentsAwaiting")}
        />
      ) : agentsAllowed && anyAgentUnread ? (
        <span
          className="size-2 rounded-full bg-blue-500"
          aria-label={t("agentsUnread")}
        />
      ) : undefined,
  };

  const sections = useMemo<AppNavSection[]>(() => {
    if (currentProject) {
      const base = `/projects/${currentProject.id}`;
      return [
        {
          items: [
            inboxItem,
            pullRequestsItem,
            agentsItem,
            {
              key: "home-back",
              label: t("home"),
              icon: ChevronLeft,
              href: "/home",
              shortcut: "H",
              badge: homeBadge,
              showBadgeCollapsed: true,
              badgeCollapsed: homeBadgeCollapsed,
            },
          ],
        },
        {
          items: [
            {
              key: "tickets",
              label: t("tickets"),
              icon: LayoutGrid,
              href: base,
              active: pathname === base,
              // P (projet) — B est le board tous-projets, depuis un projet aussi.
              shortcut: "P",
            },
            {
              key: "objectives",
              label: t("objectives"),
              icon: Target,
              href: `${base}/objectives`,
              active: pathname.startsWith(`${base}/objectives`),
              shortcut: "O",
            },
            // Entre Objectifs et Triage : le wiki du projet se lit avec ce qui
            // dit OÙ VA le projet, et pas avec les files qu'on vide. Triage,
            // Retours et leurs pastilles restent groupés en bas, là où on les
            // regarde quand on cherche du travail en attente.
            {
              key: "pages",
              label: t("pages"),
              icon: FileText,
              href: `${base}/pages`,
              active: pathname.startsWith(`${base}/pages`),
              shortcut: "W",
            },
            {
              key: "triage",
              label: t("triage"),
              icon: CircleDotDashed,
              href: `${base}/triage`,
              active: pathname.startsWith(`${base}/triage`),
              shortcut: "T",
              ...countBadges(
                triageCount,
                t("triageBadge", { count: triageCount })
              ),
            },
            {
              key: "feedback",
              label: t("feedback"),
              icon: MessagesSquare,
              href: `${base}/feedback`,
              active: pathname.startsWith(`${base}/feedback`),
              shortcut: "F",
              ...countBadges(
                feedbackCount,
                t("feedbackBadge", { count: feedbackCount })
              ),
            },
            {
              key: "settings",
              label: t("projectSettings"),
              icon: Settings,
              href: `${base}/settings`,
              active: pathname.startsWith(`${base}/settings`),
              shortcut: "S",
            },
          ],
        },
      ];
    }
    return [
      {
        items: [
          inboxItem,
          pullRequestsItem,
          agentsItem,
          {
            key: "home",
            label: t("home"),
            icon: Home,
            href: "/home",
            active: pathname.startsWith("/home"),
            shortcut: "H",
            badge: smartAssignBadge,
            showBadgeCollapsed: true,
          },
          {
            key: "all-global",
            label: t("allIssues"),
            icon: LayoutGrid,
            href: "/all",
            active: pathname === "/all",
            shortcut: "B",
          },
        ],
      },
      {
        items: [
          ...projects.map((p) => {
            // Un seul chiffre pour les deux moitiés de la file : entrer dans le
            // projet le redécompose en ses onglets Triage et Feedback, et la
            // somme doit y retomber juste.
            const toTriage = triageCountTotal(triageCounts[p.id]);
            return {
              key: `project-${p.id}`,
              label: p.name,
              icon: projectOrbIcon(projectOrbSeed(p), p.icon_url),
              href: `/projects/${p.id}`,
              ...countBadges(toTriage, t("triageBadge", { count: toTriage })),
            };
          }),
          // Les brouillons, à la suite des projets et dans la même liste : c'est
          // la même chose à un état près, et les reléguer ailleurs demanderait
          // d'aller les chercher. La ligne est celle d'un projet — orbe, nom —
          // sauf sa marque, et cliquer rouvre le wizard là où on l'a laissé.
          ...projectDrafts.map(
            (d): AppNavItem => ({
              key: `project-draft-${d.id}`,
              label: d.name,
              icon: projectOrbIcon(draftOrbSeed(d), draftIconUrl(d)),
              onClick: () => openProjectDraft(d),
              badge: draftBadge(tProjects("draftBadge")),
              // Au rail, la ligne se réduit à son orbe : sans la pastille de
              // coin, un brouillon y serait indiscernable d'un projet.
              showBadgeCollapsed: true,
              tooltip: tProjects("draftResume", { name: d.name }),
              contextActions: [
                {
                  id: "delete-project-draft",
                  label: tProjects("draftDelete"),
                  icon: <Trash2 className="size-4" />,
                  variant: "destructive",
                  onSelect: () => {
                    void deleteProjectDraft(d.id).catch((err: Error) =>
                      toast.error(err.message),
                    );
                  },
                },
              ],
            }),
          ),
          {
            key: "new-project",
            label: t("newProject"),
            icon: Plus,
            onClick: openCreateProject,
            disabled: projectLimitReached,
            tooltip: projectLimitReached
              ? tBilling("projectLimitTooltip")
              : undefined,
          },
        ],
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, pathname, projects, projectDrafts, openProjectDraft, deleteProjectDraft, inboxCount, triageCount, feedbackCount, triageCounts, openPrCount, anyAgentWorking, anyAgentUnread, openCreateProject, agentsAllowed, projectLimitReached, smartAssignBadge, homeBadge, homeBadgeCollapsed, t, tProjects]);

  // Drives the sidebar's home ↔ project swap animation (stable within a project).
  const modeKey = currentProject ? `project-${currentProject.id}` : "home";

  // Account/global options (statistics, feedback, theme, sign out). On desktop
  // they live in the sidebar footer; on mobile they move into the menu sheet +
  // command palette from a single source so both stay in sync.
  const { menuSections: accountSections, commandGroup: accountCommandGroup } =
    useAccountActions();

  // Palette = commandes + données + compte (used by the desktop pill too). The
  // mobile menu sheet gains the account sections so it fully replaces the
  // sidebar, and takes the capped data groups.
  const paletteGroups = useMemo(
    () => [
      ...commandGroups,
      ...settingsGroups,
      ...desktopDataGroups,
      accountCommandGroup,
    ],
    [commandGroups, settingsGroups, desktopDataGroups, accountCommandGroup]
  );
  const mobilePaletteGroups = useMemo(
    () => [
      ...commandGroups,
      ...settingsGroups,
      ...mobileDataGroups,
      accountCommandGroup,
    ],
    [commandGroups, settingsGroups, mobileDataGroups, accountCommandGroup]
  );

  const mobileMenuSections = useMemo(
    () => [...sections, ...accountSections],
    [sections, accountSections]
  );

  // Opening the palette arms the cross-project index if idle hasn't yet, and
  // revalidates it when the snapshot has aged (no-op while fresh).
  const handlePaletteOpenChange = useCallback(
    (next: boolean) => {
      setPaletteOpen(next);
      if (!next) return;
      armSearchIndex();
      refreshSearchIndex();
    },
    [armSearchIndex, refreshSearchIndex]
  );

  return (
    <AppShell
      // `app-shell` : la prise de globals.css sur le <main> du shell, dont la
      // réserve basse se recale sur la hauteur RÉELLE de la barre mobile
      // (--mobile-nav-clearance). Rien d'autre ne s'y accroche.
      className="app-shell"
      // Le bloc de navigation : la sidebar primaire, puis le point d'accueil de
      // la sidebar SECONDAIRE que la page y téléporte. Les deux vivent dans la
      // même boîte, à gauche du header — c'est ce qui décale le fil d'Ariane et
      // le contenu, au lieu de les laisser passer au-dessus d'une colonne.
      //
      // Mode zen (MIN-134) : le header n'est pas caché, il n'est pas donné —
      // pas de bande vide là où il était. La NAVIGATION, elle, ne part pas : le
      // zen n'est pas censé enfermer. Les deux barres quittent le flux d'un seul
      // bloc et se rappellent au survol du bord gauche (`ZenNavOverlay`), hors
      // du flux, sans rien décaler — exactement le marché que la primaire passe
      // déjà avec son rail. Le zen retire le meuble, pas la navigation.
      //
      // Le bloc porte TOUJOURS la primaire, la secondaire s'y ajoutant quand la
      // page en a une : c'est elle qui héberge les boutons de fenêtre de l'app
      // de bureau, et c'est aussi la seule navigation des pages qui n'ont pas de
      // barre secondaire.
      sidebar={
        <div className="relative flex h-full">
          {zen || compactDesktop ? (
            <ZenNavOverlay
              width={EXPANDED_WIDTH + (secondaryNav ? SECONDARY_WIDTH : 0)}
            >
              <AppSidebar sections={sections} modeKey={modeKey} inZenPanel />
              <SecondarySidebarSlot reserve={secondaryNav} />
            </ZenNavOverlay>
          ) : (
            <>
              <AppSidebar
                sections={sections}
                modeKey={modeKey}
                overlay={secondaryNav}
              />
              <SecondarySidebarSlot reserve={secondaryNav} />
            </>
          )}
        </div>
      }
      header={
        zen ? undefined : (
          <Header
            className="bg-sidebar backdrop-blur-none"
            left={<AppBreadcrumb />}
            right={
              // Desktop only — on mobile, Search moves to the navbar Search button
              // and "Nouveau" to the navbar "+", so the header collapses to the
              // two-stage breadcrumb (AppBreadcrumb handles its own mobile layout).
              <div className="hidden items-center gap-2 desktop:flex">
                <UsageIndicator />
                <ScratchpadTrigger />
                <HeaderSearchPill onOpen={() => handlePaletteOpenChange(true)} />
                <NewMenu />
              </div>
            }
          />
        )
      }
      // Le nav mobile RESTE, lui : c'est par son bouton de recherche qu'on ouvre
      // la palette sur mobile, donc le masquer enfermerait dans le mode zen tous
      // ceux qui n'ont pas de ⌘K sous la main.
      mobileNav={
        <MobileNav
          sections={mobileMenuSections}
          commandGroups={mobilePaletteGroups}
          actions={<MobileNavActions />}
          menuFooter={<MobileMenuFooter />}
          linkComponent={Link}
          searchPlaceholder={t("searchPlaceholder")}
          emptyMessage={t("noResults")}
        />
      }
    >
      {children}
      {/* Command palette (⌘K / ⌘P / F, header search pill) — mêmes groupes que
          la recherche du nav mobile, tickets enrichis d'actions (⌘;). L'index
          cross-projet sert aussi ces actions : membres et catégories du projet
          DU TICKET, qui n'est pas forcément celui de la page (MIN-91). */}
      <CommandPalette
        groups={paletteGroups}
        open={paletteOpen}
        onOpenChange={handlePaletteOpenChange}
        searchIndex={searchIndex}
      />
      {/* Ménage des branches ouvert depuis la palette (MIN-102) — le MÊME
          dialogue que le bouton des paramètres, monté ici pour être joignable
          de n'importe quelle page, sur n'importe lequel de mes projets. La clé
          remonte le dialogue d'un projet à l'autre, donc son aperçu se recharge. */}
      {branchCleanup && (
        <BranchCleanupDialog
          key={branchCleanup.project_id}
          projectId={branchCleanup.project_id}
          provider={branchCleanup.provider}
          open={branchCleanupOpen}
          onOpenChange={setBranchCleanupOpen}
        />
      )}
      {/* Export CSV ouvert depuis la palette — monté ici pour la même raison :
          il part de n'importe quelle page, et emporte les tickets de n'importe
          lequel de mes projets. Le projet de la page n'est qu'un défaut. */}
      {exportMounted && (
        <ExportIssuesDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          defaultProjectId={currentProjectId}
        />
      )}
    </AppShell>
  );
}
