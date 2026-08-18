"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Input,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { ImageUp, Shuffle, Trash2 } from "lucide-react";
import { ProjectOrb } from "@/components/project-orb";
import { DropOverlay, useFileDrop } from "@/components/resources";
import {
  clearProjectIconApi,
  importProjectIconApi,
  previewProjectIconApi,
  previewProjectIconFileApi,
  regenerateProjectOrbApi,
  uploadProjectIconApi,
} from "@/lib/projects-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Project icon (MIN-62): user-submitted image, site favicon
 * live, or return to generated orb. Shared between the “Icon” step of the
 * creation wizard (`centered`, large thumbnail above the field) and the general
 * settings tab (compact row). Checked: the parent provides `iconUrl` and
 * receives the new choice via `onChanged`.
 *
 * `projectId: null` = DRAFT mode (wizard): the project does not exist yet,
 * so nothing is stored — we only resolve the favicon or compress the
 * file for the preview, and `onChanged` provides enough to replay the real import once the project is created (see {@link ProjectIconChoice}).
 *
 * Without an imported icon, it's the orb that we see, and the only way we have on
 * is to restart its draw - the button then takes the place of
 * "Withdraw", which would have nothing to withdraw.
 *
 * The file sending is not announced: it's the PREVIEW that is the button. On
 * hover it is covered with a veil and an icon, and the whole picker accepts the
 * drag and drop. An icon is something that is replaced twice in the life
 * of a project — giving it one more field and one more button would weigh down two screens
 * permanently for a rare gesture.
 */

/** What the parent should remember from the choice — and play again, if there is no plan yet. */
export type ProjectIconChoice =
  /** Favicon of a site: this is the SITE that we keep, the import will re-resolve it. */
  | { kind: "site"; previewUrl: string; siteUrl: string }
  /** File sent: `previewUrl` is the image already compressed (data URL in draft). */
  | { kind: "file"; previewUrl: string }
  | { kind: "none" };

export function ProjectIconPicker({
  projectId,
  seed,
  iconUrl,
  onChanged,
  onSeedChanged,
  centered = false,
}: {
  projectId: string | null;
  /** Generated orb seed — `projectOrbSeed(project)`, or the draft id. */
  seed: string;
  iconUrl: string | null;
  onChanged: (choice: ProjectIconChoice) => void;
  /**
 * The draw has been restarted. The existing project does not need it - the cache
 * `projects` refreshed sends the new seed back to it - but the DRAFT
 * if: nothing is stored as long as the project does not exist, it is up to the wizard of
 * to remember it and put it on creation.
 */
  onSeedChanged?: (seed: string) => void;
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
  const [rerolling, setRerolling] = useState(false);

  const busy = importing || uploading || removing || rerolling;

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
 * No size or dimension cap here: the server returns the image to
 * a WebP square. We only cross out what is clearly not an image —
 * an empty MIME type (unknown extension) passes, libvips will decide.
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
    // Draft: nothing has been stored, removing is forgetting.
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

  /**
 * Restarts drawing the orb. Without a project, the draw is done here and the
 * wizard keeps it; with a project, it's the server that pulls and writes —
 * a seed placed by the client would be a color that no one else would
 * see until the cache has run.
 */
  const handleReroll = async () => {
    if (busy) return;
    if (projectId === null) {
      onSeedChanged?.(crypto.randomUUID());
      return;
    }
    setRerolling(true);
    try {
      const { orb_seed } = await regenerateProjectOrbApi(projectId);
      onSeedChanged?.(orb_seed);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRerolling(false);
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
        // Reset: re-choosing THE SAME file should restart a sending.
        e.target.value = "";
      }}
    />
  );

  /** The preview IS the file import button — sail + icon on hover. */
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
          {/* Fixed black veil, not `bg-foreground/60`: in dark theme this
 washes out the preview instead of covering it, and the icon loses its
 contrast. A darkening can be read in the same way in both themes. */}
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

  /** Recast the orb: ONLY offered when it's her we see. With a
 * icon imported on top, the button would promise an invisible change.
 * A gesture, therefore an icon — like its neighbor “Remove”. */
  const rerollButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("orbRerollLabel")}
          className="shrink-0"
          disabled={busy}
          onClick={() => void handleReroll()}
        >
          {rerolling ? <Spinner /> : <Shuffle />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("orbRerollLabel")}</TooltipContent>
    </Tooltip>
  );

  /** Remove icon: a gesture, not a setting — so an icon, next to its
 * neighbor "Import", and only when there is something to remove.
 * The label changes to tooltip and `aria-label`. */
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

  // Almost opaque background: the drop zone covers the preview, and without it the label
  // would land across the orb. During a drag, it is the target that we
  // is what should be read, not what it replaces.
  const dropOverlay = (
    <DropOverlay
      show={dragging}
      label={t("iconDropLabel")}
      icon={<ImageUp className="size-4 shrink-0" aria-hidden />}
      className="bg-background/85"
    />
  );

  // Wizard: large thumbnail centered above the field, like AutoKap.
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
          {iconUrl ? removeButton : rerollButton}
        </div>
        {dropOverlay}
      </div>
    );
  }

  // Settings: single row — preview, field, import, remove.
  return (
    <div {...handlers} className="relative flex items-center gap-2 rounded-xl">
      {fileInput}
      {preview}
      {input}
      {importButton}
      {iconUrl ? removeButton : rerollButton}
      {dropOverlay}
    </div>
  );
}
