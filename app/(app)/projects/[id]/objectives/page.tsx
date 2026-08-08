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
  Progress,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { Plus, Target } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { EmptyScene } from "@/components/empty-scene";
import { NumoIcon } from "@/components/numo-icon";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { ObjectiveDetail } from "@/components/objective-detail";
import type { Member, Objective } from "@/lib/types";

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
        <Progress value={progress.percent} className="ml-auto w-20 shrink-0" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {progress.done}/{progress.total}
        </span>
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
  /** Dictée en vol dans le détail — voir `ObjectiveDetail.onBusyChange`. */
  const [dictationBusy, setDictationBusy] = useState(false);

  const selected = objectives.find((o) => o.id === selectedId) ?? null;

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  /**
   * Ce que la colonne AFFICHE. Un cran EN DESSOUS de `objectives`, qui porte la
   * sélection : le filtre texte ne doit pas la déplacer, sinon chaque frappe
   * changerait l'objectif ouvert à droite — alors qu'on filtre justement pour
   * aller en chercher un autre, et le choisir soi-même.
   */
  const listed = useMemo(() => {
    if (!query.trim()) return objectives;
    return objectives.filter((o) => matchesFilter(query, [o.name, o.description]));
  }, [objectives, query]);

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
  // quand celui qui était ouvert disparaît (suppression, filtre serveur).
  useEffect(() => {
    if (objectives.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !objectives.some((o) => o.id === selectedId)) {
      setSelectedId(objectives[0].id);
    }
  }, [objectives, selectedId]);

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
  useEffect(() => {
    if (!openParam) return;
    if (!objectives.some((o) => o.id === openParam)) return;
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
          /* Icône seule : le libellé complet mangeait la moitié de la ligne. Ce
             qu'il disait revient au survol — le tooltip de l'app, pas
             l'infobulle du navigateur. */
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
        }
      >
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : listed.length === 0 ? (
          // Une page sans aucun objectif est traitée plus haut : ici, c'est
          // forcément le filtre qui a vidé la colonne.
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {tCommon("noFilterMatch")}
          </p>
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
