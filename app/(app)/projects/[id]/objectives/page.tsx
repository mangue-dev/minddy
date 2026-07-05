"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import Link from "next/link";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Progress,
  Skeleton,
  toast,
} from "mangue-ui";
import { Plus, MoreHorizontal, Pencil, Trash2, Target } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { useObjectivesQuery, objectiveProgress } from "@/lib/use-objectives-query";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { ObjectiveDialog } from "@/components/objective-dialog";
import type { Objective } from "@/lib/types";

function ObjectivesInner() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");

  const { projects, loading: projectsLoading } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const { objectives, loading, createObjective, updateObjective, deleteObjective } =
    useObjectivesQuery(projectId);
  const { issues } = useIssuesQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [toDelete, setToDelete] = useState<Objective | null>(null);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.user_id, m])),
    [members]
  );

  // Header "Nouveau → Nouvel objectif": ?new=1 opens the create dialog.
  useEffect(() => {
    if (newParam === "1") {
      setEditing(null);
      setDialogOpen(true);
      router.replace(pathname);
    }
  }, [newParam, pathname, router]);

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
        <h1 className="font-display text-xl font-semibold">Projet introuvable</h1>
        <Button asChild variant="outline">
          <Link href="/home">Retour à l&apos;accueil</Link>
        </Button>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (objective: Objective) => {
    setEditing(objective);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Objectifs
            </h1>
            <Button onClick={openCreate}>
              <Plus />
              Nouvel objectif
            </Button>
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : objectives.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Target className="size-6" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Aucun objectif. Regroupe des issues autour d&apos;un but commun.
              </p>
              <Button onClick={openCreate}>
                <Plus />
                Nouvel objectif
              </Button>
            </div>
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
                    <Link
                      href={`/projects/${project.id}?objective=${obj.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
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
                            {status.label}
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
                        <span
                          className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground sm:flex"
                          title={lead.full_name || lead.email || undefined}
                        >
                          {(lead.full_name || lead.email || "?").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Gérer">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(obj)}>
                          <Pencil />
                          Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setToDelete(obj)}
                        >
                          <Trash2 />
                          Supprimer
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

      <ObjectiveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        members={members}
        objective={editing}
        onCreate={createObjective}
        onUpdate={updateObjective}
      />

      <ConfirmDeleteDialog
        open={!!toDelete}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={toDelete ? `Supprimer « ${toDelete.name} » ?` : ""}
        description="Les issues liées ne sont pas supprimées : elles sont détachées de l'objectif."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteObjective(toDelete.id);
            toast.success("Objectif supprimé.");
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
