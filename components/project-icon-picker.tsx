"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Spinner, cn, toast } from "mangue-ui";
import { ProjectOrb } from "@/components/project-orb";
import { clearProjectIconApi, importProjectIconApi } from "@/lib/projects-api";

/**
 * Icône du projet (MIN-62) : import du favicon du site live via une URL, ou
 * retour à l'orbe générée. Partagé entre l'étape « Icône » du wizard de
 * création (`centered`, grande vignette au-dessus du champ) et l'onglet général
 * des paramètres (rangée compacte). Contrôlé : le parent fournit `iconUrl` et
 * reçoit la nouvelle valeur via `onChanged`.
 */
export function ProjectIconPicker({
  projectId,
  iconUrl,
  onChanged,
  centered = false,
}: {
  projectId: string;
  iconUrl: string | null;
  onChanged: (iconUrl: string | null) => void;
  centered?: boolean;
}) {
  const t = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const [siteUrl, setSiteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["projects"] });

  const handleImport = async () => {
    const url = siteUrl.trim();
    if (!url || importing) return;
    setImporting(true);
    try {
      const { icon_url } = await importProjectIconApi(projectId, url);
      toast.success(t("iconImportedToast"));
      onChanged(icon_url);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await clearProjectIconApi(projectId);
      toast.success(t("iconRemovedToast"));
      onChanged(null);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const input = (
    <Input
      value={siteUrl}
      onChange={(e) => setSiteUrl(e.target.value)}
      placeholder={t("iconSiteUrlPlaceholder")}
      inputMode="url"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void handleImport();
        }
      }}
    />
  );

  const importButton = (
    <Button
      type="button"
      variant="outline"
      className="shrink-0"
      disabled={importing || !siteUrl.trim()}
      onClick={() => void handleImport()}
    >
      {importing && <Spinner />}
      {t("iconImportButton")}
    </Button>
  );

  const removeButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "shrink-0 text-muted-foreground",
        centered &&
          "bg-transparent text-xs hover:bg-transparent hover:text-foreground"
      )}
      disabled={removing}
      onClick={() => void handleRemove()}
    >
      {removing && <Spinner />}
      {tCommon("remove")}
    </Button>
  );

  // Wizard : grande vignette centrée au-dessus du champ, à la AutoKap.
  if (centered) {
    return (
      <div className="flex w-full flex-col items-center gap-5">
        <ProjectOrb
          seed={projectId}
          iconUrl={iconUrl}
          className="size-16 rounded-2xl ring-1 ring-border"
        />
        <div className="flex w-full items-center gap-2">
          {input}
          {importButton}
        </div>
        {iconUrl && removeButton}
      </div>
    );
  }

  // Paramètres : rangée compacte avec aperçu inline et hint.
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <ProjectOrb
          seed={projectId}
          iconUrl={iconUrl}
          className="size-9 rounded-[10px]"
        />
        {input}
        {importButton}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("iconImportHint")}</p>
        {iconUrl && removeButton}
      </div>
    </div>
  );
}
