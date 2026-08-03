"use client";

import { useTranslations } from "next-intl";
import { Import as ImportIcon } from "lucide-react";
import { SettingsEmpty, SettingsGroup } from "@/components/settings/settings-ui";
import { ImportPanel } from "@/components/settings/import-panel";

/** Réglages du projet → Import (MIN-45). L'enveloppe seulement : le titre de
    section, la garde propriétaire — un mauvais fichier crée des centaines de
    tickets d'un coup — et le panneau, qui fait tout le reste et sert aussi à
    l'étape import de l'onboarding (MIN-98). Il ne change pas, seul son cadre. */
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
