"use client";

import { useTranslations } from "next-intl";
import { SettingsSection } from "@/components/settings-shell";
import { ImportPanel } from "@/components/settings/import-panel";

/** Réglages du projet → Import (MIN-45). L'enveloppe seulement : le titre de
    section, la garde propriétaire — un mauvais fichier crée des centaines de
    tickets d'un coup — et le panneau, qui fait tout le reste et sert aussi à
    l'étape import de l'onboarding (MIN-98). */
export function ProjectImportSection({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("Settings");

  return (
    <SettingsSection title={t("importTab")} description={t("importSectionDesc")}>
      {isOwner ? (
        <ImportPanel projectId={projectId} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("importOwnerOnlyHint")}</p>
      )}
    </SettingsSection>
  );
}
