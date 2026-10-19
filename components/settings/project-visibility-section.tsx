"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useHiddenProjects } from "@/lib/use-hidden-projects";
import type { Project } from "@/lib/types";

/**
 * "Hide project" in the General tab (MIN-692). Rendered for the owner and
 * for every member alike, since it is a preference of the reader, not a
 * project setting: it sits apart from Leave and the danger zone, and the same
 * preference drives the sidebar menu and Account settings → Hidden projects.
 */
export function ProjectVisibilitySection({ project }: { project: Project }) {
  const t = useTranslations("Settings");
  const { isHidden, setProjectHidden } = useHiddenProjects();
  const [saving, setSaving] = useState(false);
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
    <SettingsGroup anchor={SETTINGS_SECTIONS.projectVisibility} title={t("visibilityTitle")}>
      <SettingsRow
        label={t(hidden ? "projectHiddenLabel" : "hideProjectLabel")}
        hint={t(hidden ? "projectHiddenHint" : "hideProjectHint")}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void toggle()}
          >
            {saving ? <Spinner /> : <HugeiconsIcon icon={hidden ? ViewIcon : ViewOffIcon} />}
            {t(hidden ? "showProject" : "hideProject")}
          </Button>
        }
      />
    </SettingsGroup>
  );
}
