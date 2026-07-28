"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Spinner, cn, toast } from "mangue-ui";
import { ProjectOrb } from "@/components/project-orb";
import {
  clearProjectIconApi,
  importProjectIconApi,
  previewProjectIconApi,
} from "@/lib/projects-api";

/**
 * Icône du projet (MIN-62) : import du favicon du site live via une URL, ou
 * retour à l'orbe générée. Partagé entre l'étape « Icône » du wizard de
 * création (`centered`, grande vignette au-dessus du champ) et l'onglet général
 * des paramètres (rangée compacte). Contrôlé : le parent fournit `iconUrl` et
 * reçoit la nouvelle valeur via `onChanged`.
 *
 * `projectId: null` = mode BROUILLON (wizard) : le projet n'existe pas encore,
 * donc rien n'est stocké — on ne fait que résoudre le favicon pour l'aperçu, et
 * `onChanged` rend aussi le site d'origine, que le wizard rejouera en import
 * réel une fois le projet créé.
 */
export function ProjectIconPicker({
  projectId,
  seed,
  iconUrl,
  onChanged,
  centered = false,
}: {
  projectId: string | null;
  /** Graine de l'orbe générée — l'id du projet, existant ou à venir. */
  seed: string;
  iconUrl: string | null;
  onChanged: (iconUrl: string | null, siteUrl: string | null) => void;
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
      if (projectId === null) {
        const { icon_url } = await previewProjectIconApi(url);
        onChanged(icon_url, url);
      } else {
        const { icon_url } = await importProjectIconApi(projectId, url);
        toast.success(t("iconImportedToast"));
        onChanged(icon_url, url);
        refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleRemove = async () => {
    if (removing) return;
    // Brouillon : rien n'a été stocké, retirer c'est oublier.
    if (projectId === null) {
      onChanged(null, null);
      return;
    }
    setRemoving(true);
    try {
      await clearProjectIconApi(projectId);
      toast.success(t("iconRemovedToast"));
      onChanged(null, null);
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
          seed={seed}
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
          seed={seed}
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
