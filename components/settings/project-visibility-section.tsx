"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useHiddenProjects } from "@/lib/use-hidden-projects";
import type { Project } from "@/lib/types";

/**
 * "Hide project" (MIN-692), a row of the General tab's danger zone (MIN-737)
 * next to Leave project or Move to trash: the three gestures that take a
 * project out of view. Rendered for the owner and every member alike, since
 * it is a preference of the reader, not a project setting; the same
 * preference drives the sidebar menu and Account settings → Hidden projects.
 */
export function ProjectVisibilityRow({ project }: { project: Project }) {
  const t = useTranslations("Settings");
  const tNav = useTranslations("Nav");
  const tc = useTranslations("Common");
  const { isHidden, setProjectHidden } = useHiddenProjects();
  const [saving, setSaving] = useState(false);
  // Hiding asks first, like the sidebar menu; showing again is immediate.
  const [confirmHideOpen, setConfirmHideOpen] = useState(false);
  const hidden = isHidden(project.id);

  const toggle = async () => {
    setSaving(true);
    try {
      await setProjectHidden(project, !hidden);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsRow
        anchor={SETTINGS_SECTIONS.projectVisibility}
        label={t(hidden ? "projectHiddenLabel" : "hideProjectLabel")}
        hint={t(hidden ? "projectHiddenHint" : "hideProjectHint")}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => (hidden ? void toggle() : setConfirmHideOpen(true))}
          >
            {saving ? <Spinner /> : <HugeiconsIcon icon={hidden ? ViewIcon : ViewOffIcon} />}
            {t(hidden ? "showProject" : "hideProject")}
          </Button>
        }
      />
      <ConfirmDeleteDialog
        open={confirmHideOpen}
        onOpenChange={setConfirmHideOpen}
        title={tNav("hideProjectConfirmTitle", { name: project.name })}
        description={tNav("hideProjectConfirmDescription")}
        confirmLabel={tNav("hideProject")}
        cancelLabel={tc("cancel")}
        onConfirm={toggle}
      />
    </>
  );
}
