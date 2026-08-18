"use client";

import { useTranslations } from "next-intl";
import { Import as ImportIcon } from "lucide-react";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { ImportPanel } from "@/components/settings/import-panel";

/** Project settings → Import (MIN-45). The envelope only: the title of
 section, the owner's guard - a bad file creates hundreds of
 tickets at once - and the panel, which does everything else and also serves to
 the import step of onboarding (MIN-98). It does not change, only its frame. */
export function ProjectImportSection({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");

  return (
    <SettingsGroup
      anchor={SETTINGS_SECTIONS.projectImport}
      icon={ImportIcon}
      title={t("importTab")}
      description={t("importSectionDesc")}
      variant="block"
    >
      {isOwner ? (
        <ImportPanel projectId={projectId} />
      ) : (
        <SettingsEmpty className="py-0">{t("importOwnerOnlyHint")}</SettingsEmpty>
      )}
    </SettingsGroup>
  );
}
