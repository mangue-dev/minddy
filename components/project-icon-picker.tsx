"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { ImageUp, Trash2 } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { DropOverlay, useFileDrop } from "@/components/attachments";
import {
  clearProjectIconApi,
  importProjectIconApi,
  previewProjectIconApi,
  previewProjectIconFileApi,
  uploadProjectIconApi,
} from "@/lib/projects-api";

/**
 * Icône du projet (MIN-62) : image envoyée par l'utilisateur, favicon du site
 * live, ou retour à l'orbe générée. Partagé entre l'étape « Icône » du wizard de
 * création (`centered`, grande vignette au-dessus du champ) et l'onglet général
 * des paramètres (rangée compacte). Contrôlé : le parent fournit `iconUrl` et
 * reçoit le nouveau choix via `onChanged`.
 *
 * `projectId: null` = mode BROUILLON (wizard) : le projet n'existe pas encore,
 * donc rien n'est stocké — on ne fait que résoudre le favicon ou compresser le
 * fichier pour l'aperçu, et `onChanged` rend de quoi rejouer le vrai import une
 * fois le projet créé (voir {@link ProjectIconChoice}).
 *
 * L'envoi de fichier ne s'annonce pas : c'est l'APERÇU qui est le bouton. Au
 * survol il se couvre d'un voile et d'une icône, et le picker entier accepte le
 * glisser-déposer. Une icône est une chose qu'on remplace deux fois dans la vie
 * d'un projet — lui donner un champ et un bouton de plus alourdirait deux écrans
 * en permanence pour un geste rare.
 */

/** Ce que le parent doit retenir du choix — et rejouer, s'il n'y a pas encore de projet. */
export type ProjectIconChoice =
  /** Favicon d'un site : c'est le SITE qu'on garde, l'import le re-résoudra. */
  | { kind: "site"; previewUrl: string; siteUrl: string }
  /** Fichier envoyé : `previewUrl` est l'image déjà compressée (data URL en brouillon). */
  | { kind: "file"; previewUrl: string }
  | { kind: "none" };

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
  onChanged: (choice: ProjectIconChoice) => void;
  centered?: boolean;
}) {
  const t = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const busy = importing || uploading || removing;

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["projects"] });

  const handleImport = async () => {
    const url = siteUrl.trim();
    if (!url || busy) return;
    setImporting(true);
    try {
      if (projectId === null) {
        const { icon_url } = await previewProjectIconApi(url);
        onChanged({ kind: "site", previewUrl: icon_url, siteUrl: url });
      } else {
        const { icon_url } = await importProjectIconApi(projectId, url);
        toast.success(t("iconImportedToast"));
        onChanged({ kind: "site", previewUrl: icon_url, siteUrl: url });
        refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  /**
   * Aucun plafond de taille ni de dimensions ici : le serveur ramène l'image à
   * un carré WebP. On ne barre que ce qui n'est manifestement pas une image —
   * un type MIME vide (extension inconnue) passe, c'est libvips qui tranchera.
   */
  const handleFile = async (file: File | null | undefined) => {
    if (!file || busy) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error(t("iconFileNotImage"));
      return;
    }
    setUploading(true);
    try {
      if (projectId === null) {
        const { icon_url } = await previewProjectIconFileApi(file);
        onChanged({ kind: "file", previewUrl: icon_url });
      } else {
        const { icon_url } = await uploadProjectIconApi(projectId, file);
        toast.success(t("iconImportedToast"));
        onChanged({ kind: "file", previewUrl: icon_url });
        refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    // Brouillon : rien n'a été stocké, retirer c'est oublier.
    if (projectId === null) {
      onChanged({ kind: "none" });
      return;
    }
    setRemoving(true);
    try {
      await clearProjectIconApi(projectId);
      toast.success(t("iconRemovedToast"));
      onChanged({ kind: "none" });
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const { dragging, handlers } = useFileDrop((files) => void handleFile(files[0]));

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        void handleFile(e.target.files?.[0]);
        // Remis à zéro : re-choisir LE MÊME fichier doit relancer un envoi.
        e.target.value = "";
      }}
    />
  );

  /** L'aperçu EST le bouton d'import de fichier — voile + icône au survol. */
  const preview = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={t("iconUploadLabel")}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "group relative shrink-0 overflow-hidden outline-none",
            "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            centered ? "size-16 rounded-2xl ring-1 ring-border" : "size-9 rounded-[10px]"
          )}
        >
          <ProjectOrb
            seed={seed}
            iconUrl={iconUrl}
            className="size-full rounded-[inherit]"
          />
          {/* Voile noir fixe, pas `bg-foreground/60` : en thème sombre celui-ci
              délave l'aperçu au lieu de le couvrir, et l'icône y perd son
              contraste. Un assombrissement se lit pareil dans les deux thèmes. */}
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/55 text-white",
              "opacity-0 transition-opacity duration-150",
              "group-hover:opacity-100 group-focus-visible:opacity-100",
              uploading && "opacity-100"
            )}
          >
            {uploading ? (
              <Spinner className={centered ? "size-5" : "size-4"} />
            ) : (
              <ImageUp className={centered ? "size-6" : "size-4"} strokeWidth={1.75} />
            )}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("iconUploadLabel")}</TooltipContent>
    </Tooltip>
  );

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
      disabled={busy || !siteUrl.trim()}
      onClick={() => void handleImport()}
    >
      {importing && <Spinner />}
      {t("iconImportButton")}
    </Button>
  );

  /** Retirer l'icône : un geste, pas un réglage — donc une icône, à côté de son
   *  voisin « Importer », et seulement quand il y a quelque chose à retirer.
   *  Le libellé passe en tooltip et en `aria-label`. */
  const removeButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={tCommon("remove")}
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy}
          onClick={() => void handleRemove()}
        >
          {removing ? <Spinner /> : <Trash2 />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tCommon("remove")}</TooltipContent>
    </Tooltip>
  );

  // Fond quasi opaque : la zone de dépôt couvre l'aperçu, et sans lui le libellé
  // se poserait en travers de l'orbe. Pendant un glisser, c'est la cible qu'on
  // doit lire, pas ce qu'elle remplacera.
  const dropOverlay = (
    <DropOverlay
      show={dragging}
      label={t("iconDropLabel")}
      icon={<ImageUp className="size-4 shrink-0" aria-hidden />}
      className="bg-background/85"
    />
  );

  // Wizard : grande vignette centrée au-dessus du champ, à la AutoKap.
  if (centered) {
    return (
      <div
        {...handlers}
        className="relative flex w-full flex-col items-center gap-5 rounded-2xl"
      >
        {fileInput}
        {preview}
        <div className="flex w-full items-center gap-2">
          {input}
          {importButton}
          {iconUrl && removeButton}
        </div>
        {dropOverlay}
      </div>
    );
  }

  // Paramètres : une seule rangée — aperçu, champ, importer, retirer.
  return (
    <div {...handlers} className="relative flex items-center gap-2 rounded-xl">
      {fileInput}
      {preview}
      {input}
      {importButton}
      {iconUrl && removeButton}
      {dropOverlay}
    </div>
  );
}
