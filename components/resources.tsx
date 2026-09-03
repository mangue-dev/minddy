"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
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
import { FileText, Link2, Paperclip, Plus, X } from "lucide-react";
import { EntityPill, type PillRadius } from "@/components/entity-pill";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import {
  attachmentPreviewKind,
  type AttachmentPreviewKind,
} from "@/lib/attachment-preview";
import type { ResourceKind } from "@/lib/types";
import { normalizeWebUrl } from "@/lib/url-normalize";
import { usePagesQuery } from "@/lib/use-pages-query";
import { flattenPageTree } from "@/lib/pages";
import { formatFileSize } from "@/lib/page-files";
import type { PendingResource } from "@/lib/use-attachment-uploads";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppTooltip } from "@/components/ui/app-tooltip";

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
  /** Page half (MIN-275) — the id, and the page itself when the read resolved
      it. `page` absent or null on a page resource means the page is in the
      trash (or the read carried no join): the chip stays, inert. */
  page_id?: string | null;
  page?: { id: string; title: string; icon: string | null } | null;
  /** Where the page lives — the chip links to it inside the app. */
  project_id?: string | null;
}

/** The address of a page in the app — the same as that of the wiki tree. */
export function pageResourceHref(projectId: string, pageId: string): string {
  return `/projects/${projectId}/pages/${pageId}`;
}

/** The same-origin proxy for the private attachment bucket. */
export function attachmentFileUrl(storagePath: string, download = false): string {
  const qs = new URLSearchParams({ path: storagePath });
  if (download) qs.set("download", "1");
  return `/api/attachments/file?${qs.toString()}`;
}

/** Authenticated same-origin response used only inside the sandboxed viewer. */
export function attachmentPreviewUrl(storagePath: string): string {
  const qs = new URLSearchParams({ path: storagePath, preview: "1" });
  return `/api/attachments/file?${qs.toString()}`;
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
      <AppTooltip label={t("attach")}>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("attach")}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className={cn("rounded-full text-muted-foreground", className)}
          >
            <Paperclip className="size-4" />
          </Button>
        </span>
      </AppTooltip>
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
  onPage,
  projectId,
  disabled,
  accept,
  className,
}: {
  onFiles: (files: FileList) => void;
  /** Resolves once the link is registered — the dialog closes on success and
      stays open, with its error, otherwise. */
  onLink: (url: string) => Promise<void>;
  /** Cite a PAGE of the project (MIN-275). Given together with `projectId`, the
      dropdown grows a third item; without them it stays at two — the comment,
      chat and PR composers have no project's wiki to point at. */
  onPage?: (page: PickedPage) => void;
  projectId?: string | null;
  disabled?: boolean;
  accept?: string;
  className?: string;
}) {
  const t = useTranslations("Resources");
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const pages = !!onPage && !!projectId;

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
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("add")}
                disabled={disabled}
                className={cn("rounded-full text-muted-foreground", className)}
              >
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("add")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <Paperclip className="size-4" />
            <span>{t("addFile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
            <Link2 className="size-4" />
            <span>{t("addLink")}</span>
          </DropdownMenuItem>
          {pages && (
            <DropdownMenuItem onSelect={() => setPageOpen(true)}>
              <FileText className="size-4" />
              <span>{t("addPage")}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onSubmit={onLink} />
      {pages && (
        <AddPageDialog
          open={pageOpen}
          onOpenChange={setPageOpen}
          projectId={projectId as string}
          onSelect={onPage as (page: PickedPage) => void}
        />
      )}
    </>
  );
}

/** What a page selector does: enough to write the resource and display it
 immediately, without waiting for the line to come back down from the server. */
export interface PickedPage {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * "Choose a page": the project's wiki tree, flat in its display order
 * and indented by depth, in the same cmdk shell as the others
 * app selectors
 *
 * The tree comes from the project cache ([use-pages-query](../lib/use-pages-query.ts)),
 * the one that the sidebar, the breadcrumbs and the subpage block already read: a
 * page renamed elsewhere is searched here under its new name, without request for
 * more. The cache is only requested when OPENING the dialog (`open` conditions the
 * mount) — the sidebar of a ticket does not have to load the wiki to display a
 * button.
 */
export function AddPageDialog({
  open,
  onOpenChange,
  projectId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelect: (page: PickedPage) => void;
}) {
  const t = useTranslations("Resources");
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("pageDialogTitle")}
      description={t("pageSearchPlaceholder")}
      className="sm:max-w-lg"
    >
      <CommandInput placeholder={t("pageSearchPlaceholder")} />
      {/* The search field is placed in a `p-1 pb-0`: the list takes the
 SAME indentation (4px) on each side - otherwise the options bite an edge
 that the field respects - and its `pt` makes the gutter that was missing
 between the two. */}
      <CommandList className="p-1">
        {open && (
          <PageOptions
            projectId={projectId}
            onSelect={(page) => {
              onOpenChange(false);
              onSelect(page);
            }}
          />
        )}
      </CommandList>
    </CommandDialog>
  );
}

/**
 * The list itself — separated so that the request only starts once the
 * dialog is opened (the hook is only mounted then).
 *
 * FLAT list: pages scroll in sidebar order, but without
 * nesting removal. What we're doing here is CHOOSING a page, not finding your way to
 * in the tree — and a list that you filter by typing loses the
 * hierarchy from the first character anyway, leaving only a meaningless offset.
 */
function PageOptions({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (page: PickedPage) => void;
}) {
  const t = useTranslations("Resources");
  const { tree, loading } = usePagesQuery(projectId);
  const rows = flattenPageTree(tree);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <>
      <CommandEmpty>{t("noPages")}</CommandEmpty>
      {rows.map((page) => (
        <CommandItem
          key={page.id}
          value={page.id}
          keywords={[page.title]}
          onSelect={() =>
            onSelect({ id: page.id, title: page.title, icon: page.icon })
          }
        >
          <span className="w-4 shrink-0 text-center">
            {page.icon ?? <FileText className="inline size-3.5 opacity-70" />}
          </span>
          <span className="truncate">{page.title.trim() || t("untitledPage")}</span>
        </CommandItem>
      ))}
    </>
  );
}

/**
 * “Paste a link”: a field, a validation, nothing more. `https://` is
 * prefixed when the schema is missing ([url-normalize.ts](../lib/url-normalize.ts)) —
 * no one types a schema, and refusing "linear.app" for that would be like
 * having to do by hand what the machine knows complete.
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
            // This dialog opens FROM a form (the ticket type, the one
            // objective): Radix's portal takes it out of the parent's DOM, but not
            // from the React tree — the `submit` event from here therefore goes back to the
            // `onSubmit` from there, which created the ticket instead of adding the link
            // (and without the link, `addLink` not having returned yet).
            // `preventDefault` is not enough: it overrides the native behavior,
            // not React propagation.
            e.stopPropagation();
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
          {/* NOT `type="url"`: the browser would validate the field BEFORE the
 submit, and refuse "linear.app" — precisely what
 `normalizeWebUrl` is there to complete. `inputMode` is enough to get
 to get the URL keyboard on mobile, without native validation. */}
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

const RESOURCE_NAME_LIMIT = 24;

/** Keep compact labels predictable while preserving a useful file extension. */
export function compactResourceName(name: string): string {
  if (name.length <= RESOURCE_NAME_LIMIT) return name;
  const extension = name.match(/\.[^.\s]{1,8}$/)?.[0] ?? "";
  const headLength = Math.max(8, RESOURCE_NAME_LIMIT - extension.length - 1);
  return `${name.slice(0, headLength).trimEnd()}…${extension}`;
}

/** Adds a visual break before the extension without changing the filename text. */
function CompactResourceName({ name }: { name: string }) {
  const compactName = compactResourceName(name);
  const extensionStart = compactName.indexOf("….");
  if (extensionStart === -1) return compactName;

  const ellipsisEnd = extensionStart + 1;
  return (
    <>
      <span className="sr-only">{name}</span>
      <span aria-hidden>
        {compactName.slice(0, ellipsisEnd)}
        <span className="inline-block w-px" />
        {compactName.slice(ellipsisEnd)}
      </span>
    </>
  );
}

/** Transparent leading slot matching the 20px figure used by context pills. */
function ResourceFigure({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function AttachmentPreview({
  kind,
  src,
  fileName,
}: {
  kind: AttachmentPreviewKind;
  src: string;
  fileName: string;
}) {
  if (kind === "image") {
    return (
      // Storage file behind an authenticated response; next/image cannot optimize it.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={fileName} className="h-full w-full object-contain p-4" />
    );
  }
  if (kind === "audio") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <audio src={src} controls className="w-full max-w-3xl" />
      </div>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        className="h-full w-full object-contain p-4"
        aria-label={fileName}
      />
    );
  }
  return (
    <iframe
      src={src}
      title={fileName}
      sandbox=""
      className="h-full w-full border-0 bg-white"
    />
  );
}

/**
 * Common display for resources everywhere in the app — a file, a link and a
 * page read as the same chip, which is the whole point of the notion (MIN-184,
 * MIN-275). What differs is only the direct leading figure: a color-coded file
 * type icon, a link favicon, or a page emoji.
 *
 * It uses the exact same envelope as Numo's context pills. The leading slot has
 * the same geometry too, while keeping the colored file icon free of any tile.
 * Clicking previews a browser-compatible file, downloads an unsupported one,
 * opens a link in a tab, or opens a page in the app.
 *
 * `pending` renders the in-flight entries of a composer as spinner pills.
 */
export function ResourcePills({
  resources,
  pending,
  radius = "full",
  onRemove,
  canRemove,
  onRemovePending,
  className,
  pillClassName,
  fileHref,
}: {
  resources?: ResourceLike[];
  pending?: PendingResource[];
  /** Pill radius — figure follows (concentric rays). `md` for
 Numo composer nesting. */
  radius?: PillRadius;
  onRemove?: (resource: ResourceLike) => void;
  /** Per-resource gate for the X (default: every one when onRemove is set). */
  canRemove?: (resource: ResourceLike) => boolean;
  onRemovePending?: (localId: string) => void;
  className?: string;
  /** Applied to each chip — e.g. `shadow-none` in the Numo composer. */
  pillClassName?: string;
  /** Override file delivery for isolated previews that do not use private
      attachment storage. Product surfaces should keep the authenticated
      default. */
  fileHref?: (
    resource: ResourceLike,
    disposition: "preview" | "download"
  ) => string;
}) {
  const t = useTranslations("Resources");
  const locale = useLocale();
  const [preview, setPreview] = useState<ResourceLike | null>(null);

  const done = resources ?? [];
  const inFlight = pending ?? [];
  if (done.length === 0 && inFlight.length === 0) return null;

  const activePreviewKind = attachmentPreviewKind(preview?.mime_type);
  const activePreviewPath = preview?.storage_path ?? null;
  const activePreviewSrc =
    preview && activePreviewPath
      ? fileHref?.(preview, "preview") ?? attachmentPreviewUrl(activePreviewPath)
      : null;
  /** Page and link figures stay direct too, matching the file-type icons. */
  const pageIcon = (emoji: string | null | undefined) =>
    <ResourceFigure>
      {emoji ? (
        <span className="text-xs leading-none">{emoji}</span>
      ) : (
        <FileText
          className="size-4 text-indigo-500 dark:text-indigo-400"
          aria-hidden
        />
      )}
    </ResourceFigure>;

  const linkIcon = (iconDataUrl: string | null | undefined) => (
    <ResourceFigure>
      {/* A favicon is an inline data URI — next/image has nothing to optimize,
          and the fallback covers the sites that have none. */}
      {iconDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconDataUrl}
          alt=""
          aria-hidden
          className="size-4 rounded-[2px] object-contain"
        />
      ) : (
        <Link2
          className="size-4 text-sky-600 dark:text-sky-400"
          aria-hidden
        />
      )}
    </ResourceFigure>
  );

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {done.map((a) => {
        // A resource is a link when it says so AND carries an URL; anything
        // else is a file, which is what every row written before MIN-184 is.
        const url = a.kind === "link" ? (a.url ?? null) : null;
        // A PAGE resource (MIN-275): its title comes from the join, live, so a
        // renamed page is renamed here too; `file_name` is the snapshot taken
        // when it was added, and all a trashed page leaves behind.
        const pageId = a.kind === "page" ? (a.page_id ?? null) : null;
        const pageHref =
          pageId && a.project_id && a.page
            ? pageResourceHref(a.project_id, pageId)
            : null;
        const path = a.storage_path ?? null;
        const mime = a.mime_type ?? "application/octet-stream";
        const previewKind = !url && !pageId ? attachmentPreviewKind(mime) : null;
        const fullName = pageId
          ? (a.page?.title?.trim() || a.file_name)
          : a.file_name;
        const label = url
          ? t("openLink")
          : pageId
            ? pageHref
              ? t("openPage")
              : t("pageUnavailable")
            : previewKind
              ? t("preview")
              : t("download");
        const body = (
          <>
            {url
              ? linkIcon(a.icon_data_url)
              : pageId
                ? pageIcon(a.page?.icon)
                : (
                    <ResourceFigure>
                      <ResourceTypeIcon
                        mime={mime}
                        name={a.file_name}
                        className="size-4"
                      />
                    </ResourceFigure>
                  )}
            <span
              className={cn(
                "truncate",
                "min-w-0 font-medium text-foreground/80",
                // Page gone to the trash: the title remains readable, but nothing
                // does not pretend that it can be opened.
                pageId && !pageHref && "text-muted-foreground line-through"
              )}
            >
              <CompactResourceName name={fullName} />
            </span>
          </>
        );
        const removable = !!onRemove && (canRemove?.(a) ?? true);
        const inner = (
          <>
            {pageHref ? (
              // INTERNAL navigation — a wiki page is not a link to
              // the outside, and opening it in a tab would lose the context of the
              // ticket we are currently reading.
              <AppTooltip label={label}>
                <Link
                  href={pageHref}
                  aria-label={label}
                  className="flex min-w-0 items-center gap-[inherit] no-underline"
                >
                  {body}
                </Link>
              </AppTooltip>
            ) : pageId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="flex min-w-0 items-center gap-[inherit] outline-none"
                  >
                    {body}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("pageUnavailable")}</TooltipContent>
              </Tooltip>
            ) : url ? (
              <AppTooltip label={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex min-w-0 items-center gap-[inherit] no-underline"
                >
                  {body}
                </a>
              </AppTooltip>
            ) : previewKind && path ? (
              <AppTooltip label={label}>
                <button
                  type="button"
                  onClick={() => setPreview(a)}
                  className="flex min-w-0 items-center gap-[inherit]"
                >
                  {body}
                </button>
              </AppTooltip>
            ) : path ? (
              <AppTooltip label={label}>
                <a
                  href={fileHref?.(a, "download") ?? attachmentFileUrl(path, true)}
                  className="flex min-w-0 items-center gap-[inherit] no-underline"
                >
                  {body}
                </a>
              </AppTooltip>
            ) : (
              <AppTooltip label={fullName}>
                <span className="flex min-w-0 items-center gap-[inherit]">
                  {body}
                </span>
              </AppTooltip>
            )}
          </>
        );
        const key = a.id ?? url ?? pageId ?? path ?? a.file_name;

        return (
          <EntityPill
            key={key}
            radius={radius}
            highlight
            className={pillClassName}
            action={
              removable
                ? {
                    label: t("remove"),
                    onClick: () => onRemove(a),
                    icon: <X className="size-3" />,
                  }
                : undefined
            }
          >
            {inner}
          </EntityPill>
        );
      })}

      {inFlight
        .filter((p) => p.status === "uploading")
        .map((p) => (
          <EntityPill
            key={p.localId}
            radius={radius}
            highlight
            className={cn("text-muted-foreground", pillClassName)}
            action={
              onRemovePending
                ? {
                    label: t("remove"),
                    onClick: () => onRemovePending(p.localId),
                    icon: <X className="size-3" />,
                  }
                : undefined
            }
          >
            <ResourceFigure>
              <Spinner className="size-4 text-muted-foreground" />
            </ResourceFigure>
            <AppTooltip label={p.file_name}>
              <span className="min-w-0 truncate">
                <CompactResourceName name={p.file_name} />
              </span>
            </AppTooltip>
          </EntityPill>
        ))}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]">
          <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5 pr-14">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-medium">
                {preview?.file_name}
              </DialogTitle>
              {preview?.size_bytes != null && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatFileSize(preview.size_bytes, locale)}
                </p>
              )}
            </div>
            {preview && activePreviewPath && (
              <div className="flex shrink-0 items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a
                    href={
                      fileHref?.(preview, "download") ??
                      attachmentFileUrl(activePreviewPath, true)
                    }
                  >
                    {t("download")}
                  </a>
                </Button>
                {onRemove && (canRemove?.(preview) ?? true) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onRemove(preview);
                      setPreview(null);
                    }}
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-muted/30">
            {preview && activePreviewSrc && activePreviewKind && (
              <AttachmentPreview
                kind={activePreviewKind}
                src={activePreviewSrc}
                fileName={preview.file_name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
