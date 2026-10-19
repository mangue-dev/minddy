"use client";

import { useRef } from "react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useProjects } from "@/lib/projects-context";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import type { Project } from "@/lib/types";

/**
 * The confirmation that moves a project to the trash, shared by the project
 * settings and the sidebar's project menu so both ask the same question.
 *
 * The dialog closes only once the move succeeded: a refused request leaves it
 * open with its error toast, so the owner can retry or cancel.
 * `onTrashed` runs after the success notification (the settings page and the
 * sidebar decide whether the current route must leave the project).
 */
export function ProjectTrashDialog({
  project,
  open,
  onOpenChange,
  onTrashed,
}: {
  project: Pick<Project, "id" | "name"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTrashed?: (projectId: string) => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const tErrors = useTranslations("ApiErrors");
  const { deleteProject } = useProjects();
  // The title keeps naming the project while the dialog animates out.
  const shown = useRef(project);
  if (project) shown.current = project;

  const handleConfirm = async () => {
    if (!project) return;
    try {
      await deleteProject(project.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tErrors("unexpected"));
      return;
    }
    toast.success(t("projectDeleted", { name: project.name }));
    onOpenChange(false);
    onTrashed?.(project.id);
  };

  return (
    <ConfirmDeleteDialog
      open={open && !!project}
      onOpenChange={onOpenChange}
      title={t("deleteProjectTitle", { name: shown.current?.name ?? "" })}
      description={t("deleteProjectDescription", { days: TRASH_RETENTION_DAYS })}
      confirmLabel={tc("moveToTrash")}
      cancelLabel={tc("cancel")}
      onConfirm={handleConfirm}
      closeOnConfirm={false}
    />
  );
}
