"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Dialog, DialogContent, DialogTitle, Spinner, cn } from "mangue-ui";
import { FileSpreadsheet, FileText, ImageIcon, Paperclip, X } from "lucide-react";
import type { AttachmentInput } from "@/lib/types";
import type { PendingAttachment } from "@/lib/use-attachment-uploads";

/** Saved rows (with id) and just-uploaded composer entries (without) alike. */
export type AttachmentLike = AttachmentInput & { id?: string };

/** The single read door for the private bucket (302 → signed URL). */
export function attachmentFileUrl(storagePath: string, download = false): string {
  const qs = new URLSearchParams({ path: storagePath });
  if (download) qs.set("download", "1");
  return `/api/attachments/file?${qs.toString()}`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

/** Paperclip button + hidden multi-file input, shared by every composer. */
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
  const t = useTranslations("Attachments");
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
  const t = useTranslations("Attachments");
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
 * Common display for attachments everywhere in the app.
 *
 * - `pill` — bordered chip with icon, name and size; click previews images in a
 *   dialog and downloads everything else; `onRemove` adds an X (composer rows,
 *   author's own attachments).
 * - `ultra-compact` — icon + truncated name only, for dense surfaces (chat
 *   bubbles, reply rows).
 *
 * `pending` renders the in-flight uploads of a composer as spinner pills.
 */
export function AttachmentPills({
  attachments,
  pending,
  variant = "pill",
  onRemove,
  canRemove,
  onRemovePending,
  className,
  pillClassName,
}: {
  attachments?: AttachmentLike[];
  pending?: PendingAttachment[];
  variant?: "pill" | "ultra-compact";
  onRemove?: (attachment: AttachmentLike) => void;
  /** Per-attachment gate for the X (default: every one when onRemove is set). */
  canRemove?: (attachment: AttachmentLike) => boolean;
  onRemovePending?: (localId: string) => void;
  className?: string;
  /** Applied to each chip — e.g. `rounded-md` for the Numo composer's
      concentric nesting, matching its PageContextBadge. */
  pillClassName?: string;
}) {
  const t = useTranslations("Attachments");
  const [preview, setPreview] = useState<AttachmentLike | null>(null);

  const done = attachments ?? [];
  const inFlight = pending ?? [];
  if (done.length === 0 && inFlight.length === 0) return null;

  const compact = variant === "ultra-compact";
  // The pill variant mirrors the assistant's PageContextBadge anatomy (same
  // height, icon tile, typography) — attachments read as context chips.
  const pillClass = cn(
    compact
      ? "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground/90"
      : "flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs shadow-sm",
    pillClassName
  );
  const icon = (mime: string) =>
    compact ? (
      <TypeIcon mime={mime} className="size-3 shrink-0 text-muted-foreground" />
    ) : (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border/60 bg-muted text-muted-foreground">
        <TypeIcon mime={mime} className="h-3 w-3" />
      </span>
    );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {done.map((a) => {
        const image = isImage(a.mime_type);
        const label = image ? t("preview") : t("download");
        const body = (
          <>
            {icon(a.mime_type)}
            <span
              className={cn(
                "truncate",
                !compact && "min-w-0 font-medium text-foreground/80"
              )}
            >
              {a.file_name}
            </span>
            {!compact && (
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(a.size_bytes, t("mb"), t("kb"))}
              </span>
            )}
          </>
        );
        return (
          <span key={a.id ?? a.storage_path} className={cn(pillClass, "group/pill")}>
            {image ? (
              <button
                type="button"
                onClick={() => setPreview(a)}
                title={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </button>
            ) : (
              <a
                href={attachmentFileUrl(a.storage_path, true)}
                title={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </a>
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
          {preview && (
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
