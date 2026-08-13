"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  CommandGroup,
  CommandItem,
  Skeleton,
  cn,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { ListFilter, Plus, Target } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { EmptyScene } from "@/components/empty-scene";
import { NumoIcon } from "@/components/numo-icon";
import { ObjectiveProgressStat } from "@/components/objective-progress";
import { SearchMenu } from "@/components/search-menu";
import { checkedProps } from "@/components/search-select";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { ObjectiveDetail } from "@/components/objective-detail";
import type { MessageKey } from "@/lib/i18n-keys";
import type { Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Ce que la colonne montre. Les quatre états d'un objectif, plus les deux qui
 * n'en sont pas : « actifs » — ce qui n'est ni terminé ni annulé, et le point de
 * départ de la page — et « tous ».
 *
 * Le statut d'un objectif est DÉRIVÉ de ses tickets (migration
 * `objective_status_auto`) : un objectif qu'on vient de poser est « planifié »
 * tant qu'aucun de ses tickets n'a démarré. C'est pour ça que le défaut n'est
 * pas le seul statut « en cours » — il masquerait tout ce qu'on vient de créer.
 */
type ObjectiveStateFilter = "active" | ObjectiveStatus | "all";

function matchesState(objective: Objective, filter: ObjectiveStateFilter) {
  if (filter === "all") return true;
  if (filter === "active") {
    return objective.status === "planned" || objective.status === "in_progress";
  }
  return objective.status === filter;
}

/**
 * Le titre de la colonne vide quand c'est CET état, et lui seul, qui la vide —
 * « aucun objectif terminé » dit ce qu'on cherchait, là où « aucun dans ces
 * filtres » renvoie l'utilisateur rouvrir le menu pour se rappeler lesquels.
 * « Tous » n'y figure pas : un état qui n'exclut rien n'a rien à nommer, et
 * cette surface-là est traitée avant le rendu de la colonne.
 *
 * Typé en `MessageKey` et non en `string` : une clé qui n'existe pas ne compile
 * pas (cf. CLAUDE.md), là où un `Record<string, string>` afficherait sereinement
 * « Objectives.emptyDone » à l'écran.
 */
const EMPTY_BY_STATE: Record<
  Exclude<ObjectiveStateFilter, "all">,
  MessageKey<"Objectives">
> = {
  active: "emptyActive",
  planned: "emptyPlanned",
  in_progress: "emptyInProgress",
  done: "emptyDone",
  canceled: "emptyCanceled",
};

/**
 * Le filtre de la colonne — le même combobox que les pull requests et les
 * retours, pour la même raison : sur une ligne de 320 px il ne reste la place
 * que d'une icône, et ce qu'un libellé aurait dit passe dans le tooltip. Une
 * pastille signale de loin qu'un filtre est posé ; sans elle, une liste
 * restreinte n'aurait plus rien pour le dire.
 */
function ObjectiveFilterMenu({
  state,
  onStateChange,
}: {
  state: ObjectiveStateFilter;
  onStateChange: (state: ObjectiveStateFilter) => void;
}) {
  const t = useTranslations("Objectives");
  const tStatus = useTranslations("ObjectiveStatus");
  const [open, setOpen] = useState(false);

  const stateLabel =
    state === "active"
      ? t("filterActive")
      : state === "all"
        ? t("filterAll")
        : tStatus(state);
  // « Actifs » est le point de départ : rien à signaler. Tout le reste restreint
  // la liste, et doit se voir sans ouvrir le menu.
  const active = state !== "active";
  const tooltip = t("filterTooltip", { state: stateLabel });

  const pick = (next: ObjectiveStateFilter) => {
    onStateChange(next);
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={tooltip}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={tooltip}
        >
          <span className="relative flex items-center justify-center">
            <ListFilter className="size-4" />
            {active ? (
              /* L'anneau à la couleur de la barre détache la pastille du trait
                 de l'icône, qui passe juste dessous. */
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"
              />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterStateLabel")}>
        <CommandItem
          value="state-active"
          keywords={[t("filterActive")]}
          onSelect={() => pick("active")}
          {...checkedProps(state === "active")}
        >
          <span className="truncate">{t("filterActive")}</span>
        </CommandItem>
        {OBJECTIVE_STATUSES.map((s) => {
          const Icon = s.icon;
          return (
            <CommandItem
              key={s.value}
              value={`state-${s.value}`}
              keywords={[tStatus(s.value)]}
              onSelect={() => pick(s.value)}
              {...checkedProps(state === s.value)}
            >
              <Icon className={cn("size-4 shrink-0", s.color)} />
              <span className="truncate">{tStatus(s.value)}</span>
            </CommandItem>
          );
        })}
        <CommandItem
          value="state-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick("all")}
          {...checkedProps(state === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * Une ligne de la colonne — même gabarit que le triage, les retours et les pull
 * requests : une pastille arrondie dans une gouttière de 8 px. Ce que la ligne
 * porte est ce qu'on compare d'un objectif à l'autre : sa couleur, son nom, son
 * état, son avancement, son responsable.
 */
function ObjectiveRow({
  objective,
  selected,
  progress,
  lead,
  onSelect,
}: {
  objective: Objective;
  selected: boolean;
  progress: { done: number; total: number; percent: number };
  lead: Member | null;
  onSelect: () => void;
}) {
  const tStatus = useTranslations("ObjectiveStatus");
  const status = OBJECTIVE_STATUS_MAP[objective.status];
  const StatusIcon = status.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {objective.name}
        </span>
        {lead && (
          <UserAvatar
            seed={lead.avatar_seed}
            title={displayName(lead)}
            className="size-5 shrink-0"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusIcon className={cn("size-3.5 shrink-0", status.color)} />
        <span className="shrink-0 text-xs text-muted-foreground">
          {tStatus(status.value)}
        </span>
        {/* Le compte d'abord, l'anneau ensuite : c'est l'anneau qui tombe sur le
            bord droit, à la même abscisse d'une ligne à l'autre — la colonne se
            parcourt sur cette rangée de cercles, pas sur des chiffres qui
            changent de largeur. */}
        <ObjectiveProgressStat progress={progress} countFirst className="ml-auto" />
      </div>
    </button>
  );
}

function ObjectivesInner() {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tSeed = useTranslations("Seed");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");
  const openParam = searchParams.get("open");

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const { objectives, loading, createObjective, updateObjective, deleteObjective } =
    useObjectivesQuery(projectId);
  const { issues } = useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { open: openAssistant } = useAssistantPanel();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sous `md` les deux volets se relaient en plein écran : la liste d'abord,
  // le détail après avoir choisi.
  const [mobileDetail, setMobileDetail] = useState(false);
  const [query, setQuery] = useState("");
  /**
   * L'état montré par la colonne. « Actifs » par défaut : une page d'objectifs
   * qui empile deux ans de chantiers terminés ne dit plus où on en est.
   */
  const [state, setState] = useState<ObjectiveStateFilter>("active");
  /** Dictée en vol dans le détail — voir `ObjectiveDetail.onBusyChange`. */
  const [dictationBusy, setDictationBusy] = useState(false);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  /**
   * Ce que le filtre d'état laisse passer — et donc ce dans quoi la sélection
   * vit. Un objectif sorti du filtre (terminé pendant qu'on le regardait) doit
   * rendre la main au suivant, comme s'il avait été supprimé.
   */
  const filtered = useMemo(
    () => objectives.filter((o) => matchesState(o, state)),
    [objectives, state]
  );

  const selected = filtered.find((o) => o.id === selectedId) ?? null;

  /**
   * Ce que la colonne AFFICHE. Un cran EN DESSOUS de `filtered`, qui porte la
   * sélection : le filtre texte ne doit pas la déplacer, sinon chaque frappe
   * changerait l'objectif ouvert à droite — alors qu'on filtre justement pour
   * aller en chercher un autre, et le choisir soi-même.
   */
  const listed = useMemo(() => {
    if (!query.trim()) return filtered;
    return filtered.filter((o) => matchesFilter(query, [o.name, o.description]));
  }, [filtered, query]);

  // Publish the objective being viewed (else just the project) to Numo.
  useAssistantContext(
    project
      ? selected
        ? {
            projectId,
            objectiveId: selected.id,
            objectiveName: selected.name,
            objectiveColor: selected.color,
          }
        : { projectId }
      : null
  );

  /**
   * Changer d'objectif — refusé tant que Numo tient une dictée sur celui qui est
   * ouvert : son patch vise CET objectif, et en changer maintenant le jetterait.
   * Une sélection sans effet passerait pour une panne, d'où le mot.
   */
  const select = useCallback(
    (id: string) => {
      if (dictationBusy && id !== selectedId) {
        toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
        return;
      }
      setSelectedId(id);
      setMobileDetail(true);
    },
    [dictationBusy, selectedId, t]
  );

  // Garder une sélection valide : le premier objectif par défaut, et le suivant
  // quand celui qui était ouvert disparaît (suppression, changement de filtre).
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((o) => o.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Header "Nouveau → Nouvel objectif": ?new=1 opens the create dialog.
  useEffect(() => {
    if (newParam === "1") {
      setDialogOpen(true);
      router.replace(pathname);
    }
  }, [newParam, pathname, router]);

  // Lien profond (notifications, palette) : ?open=<id> sélectionne CET objectif
  // plutôt que le premier de la liste, puis purge le paramètre pour qu'un
  // refetch de fond ne ramène pas la sélection ici. On attend qu'il soit
  // vraiment chargé : purger avant l'arrivée des objectifs laisserait l'effet
  // ci-dessus retomber sur le premier, et le lien serait perdu à froid.
  //
  // Le filtre passe à « tous » avec lui : un lien vers un objectif terminé
  // n'ouvrirait rien tant que la colonne n'en montre que les actifs — et c'est
  // précisément un objectif clos qu'on vient relire depuis une notification.
  useEffect(() => {
    if (!openParam) return;
    if (!objectives.some((o) => o.id === openParam)) return;
    setState("all");
    setSelectedId(openParam);
    setMobileDetail(true);
    router.replace(pathname);
  }, [openParam, objectives, pathname, router]);

  // Objective creation is keyboard-driven by the app-wide `O` shortcut now
  // (see CreateProvider) — no page-local `C` handler.

  if (projectsLoading && !project) {
    return (
      <div className="px-6 py-10">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">{t("projectNotFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  /* `projectId` n'est pas seulement l'étiquette du bouton : c'est le préfixe de
     stockage des pièces jointes, la portée des brouillons locaux et le projet
     que la route de dictée interroge. */
  const createDialog = (
    <ObjectiveDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      members={members}
      objective={null}
      projectId={projectId}
      onCreate={createObjective}
      onUpdate={updateObjective}
    />
  );

  // Aucun objectif du tout (pas « rien dans ce filtre ») : les deux volets n'ont
  // plus rien à montrer, et l'écran doit dire par quoi commencer plutôt que
  // d'afficher une colonne vide à côté d'un « sélectionnez un objectif ».
  if (!loading && objectives.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-5xl">
              {/* Même forme que le board vide (MIN-173) : une scène, une phrase,
                 les gestes qui remplissent la page. La scène est l'icône de
                 l'onglet, posée au sol — la page se reconnaît à ce qui la nomme
                 dans la barre latérale. Pas d'import ici : un objectif ne
                 s'exporte d'aucun outil. */}
              <EmptyScene icon={Target} title={t("emptyTitle")}>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus />
                  {t("newObjective")}
                  <Kbd
                    size="sm"
                    className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground"
                  >
                    O
                  </Kbd>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    openAssistant({
                      projectId,
                      prompt: t("emptyNumoPrompt", { name: project.name }),
                    })
                  }
                >
                  <NumoIcon state="idle" className="size-4" />
                  {tSeed("emptyBoardCta")}
                </Button>
              </EmptyScene>
            </div>
          </div>
        </div>
        {createDialog}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Colonne : les objectifs du projet ────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listed.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          /* Icônes seules : les libellés complets mangeaient la ligne. Ce
             qu'ils disaient revient au survol — le tooltip de l'app, pas
             l'infobulle du navigateur. Le `-mr-2` ne va que sur la DERNIÈRE :
             c'est elle qui doit s'aligner sur le bord droit des lignes de la
             liste, pas 8 px en-deçà. */
          <>
            <ObjectiveFilterMenu state={state} onStateChange={setState} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 text-muted-foreground hover:text-foreground"
                  aria-label={t("newObjective")}
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("newObjective")}</TooltipContent>
            </Tooltip>
          </>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : listed.length === 0 ? (
          /* Une page sans AUCUN objectif est traitée plus haut : ici, c'est
             forcément un filtre qui a vidé la colonne. Lequel n'est pas un
             détail — « rien ne correspond » se répare en effaçant trois lettres,
             « aucun objectif terminé » demande de rouvrir le menu d'état, d'où
             le bouton, qui n'a rien à offrir tant que c'est la saisie qui
             restreint. */
          <EmptyScene
            size="compact"
            icon={Target}
            title={
              !query.trim() && state !== "all"
                ? t(EMPTY_BY_STATE[state])
                : tCommon("noFilterMatch")
            }
            className="py-10"
          >
            {query.trim() || state === "all" ? null : (
              <Button variant="outline" size="sm" onClick={() => setState("all")}>
                {t("emptyShowAll")}
              </Button>
            )}
          </EmptyScene>
        ) : (
          <div className="flex flex-col gap-1 px-2 pt-2 pb-4">
            {listed.map((objective) => (
              <ObjectiveRow
                key={objective.id}
                objective={objective}
                selected={objective.id === selectedId}
                progress={objectiveProgress(objective.id, issues)}
                lead={
                  objective.lead_user_id
                    ? memberMap.get(objective.lead_user_id) ?? null
                    : null
                }
                onSelect={() => select(objective.id)}
              />
            ))}
          </div>
        )}
      </SecondarySidebar>

      {/* ── Détail : l'objectif ouvert ───────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          mobileDetail ? "flex" : "hidden"
        )}
      >
        {selected ? (
          <ObjectiveDetail
            key={selected.id}
            objective={selected}
            projectId={projectId}
            members={members}
            issues={issues}
            onUpdate={updateObjective}
            onDelete={async (id) => {
              await deleteObjective(id);
              // L'effet de sélection ci-dessus enchaîne sur l'objectif suivant ;
              // sur mobile, il n'y a plus rien à voir : retour à la liste.
              setMobileDetail(false);
            }}
            onBack={() => setMobileDetail(false)}
            onBusyChange={setDictationBusy}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">{t("noSelection")}</p>
          </div>
        )}
      </div>

      {createDialog}
    </div>
  );
}

export default function ObjectivesPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-10">
          <Skeleton className="h-8 w-64" />
        </div>
      }
    >
      <ObjectivesInner />
    </Suspense>
  );
}
