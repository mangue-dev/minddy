"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Spinner,
  cn,
} from "mangue-ui";
import {
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Link2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import type { ResourceKind } from "@/lib/types";
import { normalizeWebUrl } from "@/lib/url-normalize";
import type { PendingResource } from "@/lib/use-attachment-uploads";

/**
 * Saved rows (with id) and just-added composer entries (without) alike, in the
 * one shape that fits both halves of a resource. Deliberately permissive: a
 * file carries `storage_path`/`mime_type`/`size_bytes`, a link carries `url`
 * and its favicon, and `kind` defaults to "file" — the comment and chat
 * surfaces hand over rows written before MIN-184, which never carry links.
 */
export interface ResourceLike {
  id?: string;
  kind?: ResourceKind | null;
  file_name: string;
  /** File half. */
  storage_path?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  /** Link half. */
  url?: string | null;
  icon_data_url?: string | null;
}

/** The single read door for the private bucket (302 → signed URL). */
export function attachmentFileUrl(storagePath: string, download = false): string {
  const qs = new URLSearchParams({ path: storagePath });
  if (download) qs.set("download", "1");
  return `/api/attachments/file?${qs.toString()}`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Paperclip button + hidden multi-file input, shared by every composer that
    only takes files (comments, Numo shell, PR composer). */
export function AttachButton({
  onFiles,
  disabled,
  accept,
  className,
}: {
  onFiles: (files: FileList) => void;
  disabled?: boolean;
  accept?: string;
  className?: string;
}) {
  const t = useTranslations("Resources");
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("attach")}
        title={t("attach")}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={cn("rounded-full text-muted-foreground", className)}
      >
        <Paperclip className="size-4" />
      </Button>
    </>
  );
}

/**
 * The « + » of a surface that takes BOTH halves of a resource (MIN-184):
 * a dropdown with *Attachment* — the same hidden file input as AttachButton —
 * and *Link*, which opens {@link AddLinkDialog}.
 *
 * One button rather than two: the two gestures produce the same thing, and the
 * sidebar row has one slot for « add something here ».
 */
export function AddResourceButton({
  onFiles,
  onLink,
  disabled,
  accept,
  className,
}: {
  onFiles: (files: FileList) => void;
  /** Resolves once the link is registered — the dialog closes on success and
      stays open, with its error, otherwise. */
  onLink: (url: string) => Promise<void>;
  disabled?: boolean;
  accept?: string;
  className?: string;
}) {
  const t = useTranslations("Resources");
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("add")}
            title={t("add")}
            disabled={disabled}
            className={cn("rounded-full text-muted-foreground", className)}
          >
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <Paperclip className="size-4" />
            <span>{t("addFile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
            <Link2 className="size-4" />
            <span>{t("addLink")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onSubmit={onLink} />
    </>
  );
}

/**
 * « Coller un lien » : un champ, une validation, rien de plus. `https://` est
 * préfixé quand le schéma manque ([url-normalize.ts](../lib/url-normalize.ts)) —
 * personne ne tape un schéma, et refuser « linear.app » pour ça reviendrait à
 * faire faire à la main ce que la machine sait compléter.
 */
export function AddLinkDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (url: string) => Promise<void>;
}) {
  const t = useTranslations("Resources");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
    setBusy(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("linkDialogTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const url = normalizeWebUrl(value);
            if (!url) {
              setError(t("linkInvalid"));
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await onSubmit(url);
              onOpenChange(false);
            } catch (err) {
              setError((err as Error).message || t("linkFailed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {/* PAS `type="url"` : le navigateur validerait le champ AVANT le
              submit, et refuserait « linear.app » — précisément ce que
              `normalizeWebUrl` est là pour compléter. `inputMode` suffit à
              obtenir le clavier URL sur mobile, sans la validation native. */}
          <Input
            autoFocus
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={t("linkPlaceholder")}
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy && <Spinner className="size-4" />}
              {t("addLinkSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Forward pasted files into a composer's upload queue. */
export function pasteFileHandler(addFiles: (files: Iterable<File>) => void) {
  return (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFiles(e.clipboardData.files);
    }
  };
}

function dragHasFiles(e: React.DragEvent): boolean {
  return e.dataTransfer?.types?.includes("Files") ?? false;
}

/**
 * File drag-and-drop state for one drop surface: `dragging` flips while files
 * hover it (so the surface can render its DropOverlay), `handlers` spread on
 * the surface element. Uses an enter/leave depth counter — those events also
 * fire on every child. Non-file drags (text, kanban cards) are ignored.
 */
export function useFileDrop(onFiles: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDrop: (e: React.DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDragging(false);
      if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
    },
  };

  return { dragging, handlers };
}

/**
 * The visual drop state of a surface — dashed brand frame + label covering the
 * (relative-positioned) parent while `useFileDrop.dragging` is true.
 * pointer-events-none so it never steals the drag events from the surface.
 */
export function DropOverlay({
  show,
  label,
  icon,
  className,
}: {
  show: boolean;
  /** Defaults to the generic "drop to attach" wording. */
  label?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("Resources");
  if (!show) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2",
        "rounded-[inherit] border-2 border-dashed border-brand bg-brand/5 backdrop-blur-[2px]",
        "text-sm font-medium text-brand",
        className
      )}
    >
      {icon ?? <Paperclip className="size-4 shrink-0" aria-hidden />}
      <span className="truncate px-1">{label ?? t("dropHere")}</span>
    </div>
  );
}

function TypeIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = isImage(mime)
    ? ImageIcon
    : mime === "application/pdf"
      ? FileText
      : mime === "text/csv" || mime.includes("spreadsheet") || mime.includes("excel")
        ? FileSpreadsheet
        : Paperclip;
  return <Icon className={className} aria-hidden />;
}

function formatBytes(n: number, mb: string, kb: string): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} ${mb}`;
  return `${Math.max(1, Math.round(n / 1024))} ${kb}`;
}

/**
 * Common display for resources everywhere in the app — a file and a link read
 * as the same chip, which is the whole point of the notion (MIN-184). What
 * differs is only what fits inside: a file shows its type icon and its weight,
 * a link its favicon and nothing else (a link has no size to speak of).
 *
 * - `pill` — bordered chip with icon, name and size; click previews images in a
 *   dialog, downloads other files, opens a link in a new tab; `onRemove` adds
 *   an X (composer rows, the author's own resources).
 * - `ultra-compact` — icon + truncated name only, for dense surfaces (chat
 *   bubbles, reply rows).
 *
 * `pending` renders the in-flight entries of a composer as spinner pills.
 */
export function ResourcePills({
  resources,
  pending,
  variant = "pill",
  onRemove,
  canRemove,
  onRemovePending,
  className,
  pillClassName,
}: {
  resources?: ResourceLike[];
  pending?: PendingResource[];
  variant?: "pill" | "ultra-compact";
  onRemove?: (resource: ResourceLike) => void;
  /** Per-resource gate for the X (default: every one when onRemove is set). */
  canRemove?: (resource: ResourceLike) => boolean;
  onRemovePending?: (localId: string) => void;
  className?: string;
  /** Applied to each chip — e.g. `rounded-md` for the Numo composer's
      concentric nesting, matching its PageContextBadge. */
  pillClassName?: string;
}) {
  const t = useTranslations("Resources");
  const [preview, setPreview] = useState<ResourceLike | null>(null);

  const done = resources ?? [];
  const inFlight = pending ?? [];
  if (done.length === 0 && inFlight.length === 0) return null;

  const compact = variant === "ultra-compact";
  // The pill variant mirrors the assistant's PageContextBadge anatomy (same
  // height, icon tile, typography) — resources read as context chips.
  const pillClass = cn(
    compact
      ? "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground/90"
      : "flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs shadow-sm",
    pillClassName
  );

  /** The chip's leading square — a MIME type icon, or the site's favicon. */
  const iconTile = (inner: React.ReactNode) =>
    compact ? (
      inner
    ) : (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-border/60 bg-muted text-muted-foreground">
        {inner}
      </span>
    );

  const linkIcon = (iconDataUrl: string | null | undefined) =>
    iconTile(
      // A favicon is an inline data URI — next/image has nothing to optimize,
      // and the fallback covers the sites that have none.
      iconDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconDataUrl}
          alt=""
          aria-hidden
          className={
            compact ? "size-3 shrink-0 rounded-[2px]" : "h-3.5 w-3.5 object-contain"
          }
        />
      ) : (
        <Link2
          className={compact ? "size-3 shrink-0 text-muted-foreground" : "h-3 w-3"}
          aria-hidden
        />
      )
    );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {done.map((a) => {
        // A resource is a link when it says so AND carries an URL; anything
        // else is a file, which is what every row written before MIN-184 is.
        const url = a.kind === "link" ? (a.url ?? null) : null;
        const path = a.storage_path ?? null;
        const mime = a.mime_type ?? "application/octet-stream";
        const image = !url && isImage(mime);
        const label = url ? t("openLink") : image ? t("preview") : t("download");
        const body = (
          <>
            {url
              ? linkIcon(a.icon_data_url)
              : iconTile(
                  <TypeIcon
                    mime={mime}
                    className={
                      compact ? "size-3 shrink-0 text-muted-foreground" : "h-3 w-3"
                    }
                  />
                )}
            <span
              className={cn(
                "truncate",
                !compact && "min-w-0 font-medium text-foreground/80"
              )}
            >
              {a.file_name}
            </span>
            {!compact && !url && (
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(a.size_bytes ?? 0, t("mb"), t("kb"))}
              </span>
            )}
          </>
        );
        return (
          <span
            key={a.id ?? url ?? path ?? a.file_name}
            className={cn(pillClass, "group/pill")}
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={url}
                aria-label={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </a>
            ) : image && path ? (
              <button
                type="button"
                onClick={() => setPreview(a)}
                title={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </button>
            ) : path ? (
              <a
                href={attachmentFileUrl(path, true)}
                title={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </a>
            ) : (
              <span className="flex min-w-0 items-center gap-[inherit]">{body}</span>
            )}
            {onRemove && (canRemove?.(a) ?? true) && (
              <button
                type="button"
                onClick={() => onRemove(a)}
                title={t("remove")}
                className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className={compact ? "size-3" : "size-3.5"} aria-hidden />
                <span className="sr-only">{t("remove")}</span>
              </button>
            )}
          </span>
        );
      })}

      {inFlight
        .filter((p) => p.status === "uploading")
        .map((p) => (
          <span key={p.localId} className={cn(pillClass, "text-muted-foreground")}>
            {compact ? (
              <Spinner className="size-3 shrink-0" />
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border/60 bg-muted">
                <Spinner className="h-3 w-3" />
              </span>
            )}
            <span className="truncate">{p.file_name}</span>
            {onRemovePending && (
              <button
                type="button"
                onClick={() => onRemovePending(p.localId)}
                title={t("remove")}
                className="shrink-0 rounded-full p-0.5 hover:bg-accent hover:text-foreground"
              >
                <X className={compact ? "size-3" : "size-3.5"} aria-hidden />
                <span className="sr-only">{t("remove")}</span>
              </button>
            )}
          </span>
        ))}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{preview?.file_name}</DialogTitle>
          {preview?.storage_path && (
            <>
              {/* Storage file behind an auth redirect — next/image can't optimize it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentFileUrl(preview.storage_path)}
                alt={preview.file_name}
                className="max-h-[75vh] w-full rounded-md object-contain"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-1 text-xs text-muted-foreground">
                <span className="truncate">{preview.file_name}</span>
                <a
                  href={attachmentFileUrl(preview.storage_path, true)}
                  className="shrink-0 hover:text-foreground hover:underline"
                >
                  {t("download")}
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
