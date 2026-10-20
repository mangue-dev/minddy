"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, LogOutIcon } from "@hugeicons/core-free-icons";
import {useState} from "react";
import { useAppRouter } from "@/lib/use-app-router";
import {useTranslations} from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "sonner";
import {useAuth} from "@/lib/auth-context";
import {useProjects} from "@/lib/projects-context";
import {removeMemberApi} from "@/lib/members-api";
import {normalizeKey} from "@/lib/project-key";
import {ProjectIdentityHeader} from "@/components/settings/project-identity-header";
import {SettingsGroup, SettingsRow} from "@/components/settings/settings-ui";
import {ProjectVisibilityRow} from "@/components/settings/project-visibility-section";
import {SETTINGS_SECTIONS} from "@/lib/settings-sections";
import type { Project } from "@/lib/types";

/**
 * “General” tab of a project's settings: its identity as a header — icon,
 * name, key and a few figures, edited in place like the account profile
 * (MIN-737) — then the danger zone, which gathers what takes the project
 * out of view: hiding it for yourself (both branches, MIN-692), then moving
 * it to trash (owner) or leaving it (member).
 */
export function ProjectGeneralSection({
  project,
  isOwner,
  onRequestDelete,
}: {
  project: Project;
  isOwner: boolean;
  /** The page has the `ConfirmDeleteDialog`: it routes to /home afterwards. */
  onRequestDelete: () => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const router = useAppRouter();
  const { user } = useAuth();
  const { updateProject, refetch } = useProjects();

  const [leaving, setLeaving] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  // Name and key save on their own, where they are shown (MIN-737).
  const saveName = async (next: string) => {
    await updateProject(project.id, { name: next });
    toast.success(t("projectUpdated"));
  };
  const saveKey = async (next: string) => {
    await updateProject(project.id, { key: normalizeKey(next) });
    toast.success(t("projectUpdated"));
  };

  const handleLeave = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      await removeMemberApi(project.id, user.id);
      toast.success(t("leftProject", { name: project.name }));
      refetch();
      router.replace("/home");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLeaving(false);
    }
  };

  const header = (
    <ProjectIdentityHeader
      project={project}
      onSaveName={isOwner ? saveName : undefined}
      onSaveKey={isOwner ? saveKey : undefined}
    />
  );

  if (!isOwner) {
    return (
      <>
        {header}

        {/* Everything that takes the project out of view, in one place:
            hide it for yourself, or leave it. */}
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectDanger}
          tone="destructive"
          title={t("dangerZoneTitle")}
        >
          <ProjectVisibilityRow project={project} />
          <SettingsRow
            anchor={SETTINGS_SECTIONS.projectLeave}
            label={t("leaveProjectLabel")}
            control={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={leaving}
                onClick={() => setConfirmLeaveOpen(true)}
              >
                {leaving ? <Spinner /> : <HugeiconsIcon icon={LogOutIcon} />}
                {t("leave")}
              </Button>
            }
          />
        </SettingsGroup>
        <ConfirmDeleteDialog
          open={confirmLeaveOpen}
          onOpenChange={setConfirmLeaveOpen}
          title={t("leaveProjectTitle", { name: project.name })}
          description={t("leaveProjectDescription")}
          confirmLabel={t("leave")}
          cancelLabel={tc("cancel")}
          onConfirm={handleLeave}
          isLoading={leaving}
        />
      </>
    );
  }

  return (
    <>
      {header}

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectDanger}
        tone="destructive"
        title={t("dangerZoneTitle")}
      >
        <ProjectVisibilityRow project={project} />
        <SettingsRow
          label={t("deleteProjectLabel")}
          hint={t("deleteProjectHint")}
          control={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onRequestDelete}
            >
              <HugeiconsIcon icon={Delete02Icon} />
              {tc("moveToTrash")}
            </Button>
          }
        />
      </SettingsGroup>
    </>
  );
}
