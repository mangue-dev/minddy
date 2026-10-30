"use client";

import { projectPath } from "@/lib/app-urls";
import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import Link from "@/components/app-link";
import { ProjectOrb } from "@/components/project-orb";
import { SettingsEmpty, SettingsGroup, SettingsListRow } from "@/components/settings/settings-ui";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useProjects } from "@/lib/projects-context";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { useHiddenProjects } from "@/lib/use-hidden-projects";

/**
 * Account settings → Hidden projects (MIN-692): where a hidden project can
 * always be found again, opened, and shown in the navigation once more. Only
 * projects I can still access are listed; a project I left or that went to
 * the trash has nothing to show.
 */
export function AccountHiddenProjectsSection() {
  const t = useTranslations("Account");
  const tSettings = useTranslations("Settings");
  const { projects } = useProjects();
  const { hiddenProjectIds, setProjectHidden } = useHiddenProjects();
  const hidden = useMemo(
    () => projects
      .filter((project) => hiddenProjectIds.has(project.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, hiddenProjectIds],
  );

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.accountHiddenProjects}
      title={t("hiddenProjectsTitle")}
      help={t("hiddenProjectsHelp")}
    >
      {hidden.length === 0 ? (
        <SettingsEmpty>{t("hiddenProjectsEmpty")}</SettingsEmpty>
      ) : (
        hidden.map((project) => (
          <SettingsListRow
            key={project.id}
            avatar={
              <ProjectOrb
                seed={projectOrbSeed(project)}
                iconUrl={project.icon_url}
                className="size-8 shrink-0 rounded-[9px]"
              />
            }
            title={project.name}
            subtitle={project.key}
            action={
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href={projectPath(project.id)}>{t("hiddenProjectsOpen")}</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void setProjectHidden(project, false)}
                >
                  <HugeiconsIcon icon={ViewIcon} />
                  {tSettings("showProject")}
                </Button>
              </>
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}
