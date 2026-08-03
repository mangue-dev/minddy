"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Kbd,
  Progress,
  Skeleton,
  toast,
} from "mangue-ui";
import { Plus, MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
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
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { ObjectiveDialog } from "@/components/objective-dialog";
import { ObjectiveSidePanel } from "@/components/objective-side-panel";
import type { Objective } from "@/lib/types";

function ObjectivesInner() {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tSeed = useTranslations("Seed");
  const tIssue = useTranslations("Issue");
  const tStatus = useTranslations("ObjectiveStatus");
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
  const [openObjectiveId, setOpenObjectiveId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Objective | null>(null);

  const openObjective = openObjectiveId
    ? objectives.find((o) => o.id === openObjectiveId) ?? null
    : null;

  // Publish the objective being viewed (else just the project) to Numo.
  useAssistantContext(
    project
      ? openObjective
        ? {
            projectId,
            objectiveId: openObjective.id,
            objectiveName: openObjective.name,
            objectiveColor: openObjective.color,
          }
        : { projectId }
      : null
  );

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  // Header "Nouveau → Nouvel objectif": ?new=1 opens the create dialog.
  useEffect(() => {
    if (newParam === "1") {
      setDialogOpen(true);
      router.replace(pathname);
    }
  }, [newParam, pathname, router]);

  // Deep-link: ?open=<id> opens the objective side panel (notifications land here).
  useEffect(() => {
    if (openParam) {
      setOpenObjectiveId(openParam);
      router.replace(pathname);
    }
  }, [openParam, pathname, router]);

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

  const openCreate = () => {
    setDialogOpen(true);
  };
  const openPanel = (objective: Objective) => {
    setOpenObjectiveId(objective.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : objectives.length === 0 ? (
            /* Même forme que le board vide (MIN-173) : une scène, une phrase,
               les gestes qui remplissent la page. La scène est l'icône de
               l'onglet, posée au sol — la page se reconnaît à ce qui la nomme
               dans la barre latérale. Pas d'import ici : un objectif ne
               s'exporte d'aucun outil. */
            <EmptyScene icon={Target} title={t("emptyTitle")}>
              <Button onClick={openCreate}>
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
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {objectives.map((obj) => {
                const status = OBJECTIVE_STATUS_MAP[obj.status];
                const StatusIcon = status.icon;
                const { done, total, percent } = objectiveProgress(obj.id, issues);
                const lead = obj.lead_user_id
                  ? memberMap.get(obj.lead_user_id) ?? null
                  : null;
                return (
                  <div key={obj.id} className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => openPanel(obj)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: obj.color ?? "var(--muted-foreground)" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{obj.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusIcon className={`size-3.5 ${status.color}`} />
                          <span className="text-xs text-muted-foreground">
                            {tStatus(status.value)}
                          </span>
                        </div>
                      </div>
                      <div className="hidden w-40 shrink-0 flex-col gap-1 sm:flex">
                        <Progress value={percent} />
                        <span className="text-xs text-muted-foreground">
                          {done}/{total}
                        </span>
                      </div>
                      {lead && (
                        <UserAvatar
                          seed={lead.avatar_seed}
                          title={displayName(lead)}
                          className="hidden size-7 shrink-0 sm:flex"
                        />
                      )}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={tCommon("manage")}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openPanel(obj)}>
                          <Pencil />
                          {tCommon("edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setToDelete(obj)}
                        >
                          <Trash2 />
                          {tCommon("moveToTrash")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* `projectId` n'est pas seulement l'étiquette du bouton : c'est le préfixe
        de stockage des pièces jointes, la portée des brouillons locaux et le
        projet que la route de dictée interroge. */}
      <ObjectiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        members={members}
        objective={null}
        projectId={projectId}
        onCreate={createObjective}
        onUpdate={updateObjective}
      />

      <ObjectiveSidePanel
        objective={openObjective}
        open={!!openObjective}
        onOpenChange={(next) => {
          if (!next) setOpenObjectiveId(null);
        }}
        projectId={project.id}
        members={members}
        issues={issues}
        onUpdate={updateObjective}
        onDelete={deleteObjective}
      />

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={toDelete ? t("deleteConfirmTitle", { name: toDelete.name }) : ""}
        description={t("deleteConfirmDescription", {
          issues: tIssue("entityPlural").toLowerCase(),
          days: TRASH_RETENTION_DAYS,
        })}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteObjective(toDelete.id);
            toast.success(t("deletedToast"));
            setToDelete(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />
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
