"use client";


import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, AttachmentIcon, Cancel01Icon, Delete02Icon, Download01Icon, Edit04Icon, File02Icon, Link02Icon, LinkSquare02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import Link from "@/components/app-link";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { useOptionalPagePanelActions } from "@/lib/page-panel-context";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { SearchMenu } from "@/components/search-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityPill, type PillRadius } from "@/components/entity-pill";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import {
  attachmentPreviewKind,
} from "@/lib/attachment-preview";
import { FileViewer } from "@/components/file-viewer";
import type { ResourceKind } from "@/lib/types";
import { normalizeWebUrl } from "@/lib/url-normalize";
import { usePagesQuery } from "@/lib/use-pages-query";
import { flattenPageTree } from "@/lib/pages";
import {
  landedResources,
  type AttachmentUploads,
  type PendingResource,
} from "@/lib/use-attachment-uploads";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  ResourceCard,
  ResourceThumbnail,
  ResourceTile,
  tileExtension,
  type ResourceCardItem,
} from "@/components/resource-card";
import { formatFileSize } from "@/lib/page-files";
import {
  attachmentFileUrl,
  attachmentPreviewUrl,
  pageResourceHref,
  resourceDisplayName,
} from "@/lib/resource-links";
import {
  isRenamableResource,
  normalizeResourceName,
  resourceNameStemLength,
} from "@/lib/resource-name";

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
  /** The page's og:image thumbnail (MIN-742). */
  preview_data_url?: string | null;
  /** Page half (MIN-275) — the id, and the page itself when the read resolved
      it. `page` absent or null on a page resource means the page is in the
      trash (or the read carried no join): the chip stays, inert. */
  page_id?: string | null;
  page?: { id: string; title: string; icon: string | null } | null;
  /** Where the page lives — the chip links to it inside the app. */
  project_id?: string | null;
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
            <HugeiconsIcon icon={AttachmentIcon} className="size-4" />
          </Button>
        </span>
      </AppTooltip>
    </>
  );
}

/**
 * The « + » of a surface that takes BOTH halves of a resource (MIN-184):
 * a dropdown with *Attachment* — the same hidden file input as AttachButton —
 * and *Link*, which opens {@link AddLinkDialog}. With a project, *Page* opens
 * the searchable page picker under the same button.
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
  // The page picker hangs under this button once the menu has closed: the
  // anchor point is read from the trigger at that moment.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pagePendingRef = useRef(false);
  const [pageAnchor, setPageAnchor] = useState<{ x: number; y: number } | null>(null);
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
                ref={triggerRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("add")}
                disabled={disabled}
                className={cn("rounded-full text-muted-foreground", className)}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("add")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onCloseAutoFocus={(event) => {
            if (!pagePendingRef.current) return;
            // Opening the page picker: focus belongs to its search field, not
            // to the trigger, whose refocus would read as an outside click.
            pagePendingRef.current = false;
            event.preventDefault();
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) setPageAnchor({ x: rect.right, y: rect.bottom + 4 });
          }}
        >
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <HugeiconsIcon icon={AttachmentIcon} className="size-4" />
            <span>{t("addFile")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
            <HugeiconsIcon icon={Link02Icon} className="size-4" />
            <span>{t("addLink")}</span>
          </DropdownMenuItem>
          {pages && (
            <DropdownMenuItem onSelect={() => { pagePendingRef.current = true; }}>
              <HugeiconsIcon icon={File02Icon} className="size-4" />
              <span>{t("addPage")}</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onSubmit={onLink} />
      {pages && (
        <PagePickerMenu
          anchor={pageAnchor}
          onClose={() => setPageAnchor(null)}
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
 * "Choose a page": the project's wiki tree, flat in its display order, in the
 * same searchable dropdown as the app's other pickers (the relation picker's
 * issue search, for one) — a popover under the "+" on desktop, a bottom sheet
 * on phones.
 *
 * The tree comes from the project cache ([use-pages-query](../lib/use-pages-query.ts)),
 * the one that the sidebar, the breadcrumbs and the subpage block already read: a
 * page renamed elsewhere is searched here under its new name, without another
 * request. The cache is only requested when the menu OPENS (the options mount
 * with it) — the sidebar of a ticket does not have to load the wiki to display
 * a button.
 */
function PagePickerMenu({
  anchor,
  onClose,
  projectId,
  onSelect,
}: {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  projectId: string;
  onSelect: (page: PickedPage) => void;
}) {
  const t = useTranslations("Resources");
  return (
    <SearchMenu
      open={anchor !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      position={anchor}
      align="end"
      modal
      hideEmpty
      searchPlaceholder={t("pageSearchPlaceholder")}
      contentClassName="w-72"
    >
      {anchor && (
        <PageOptions
          projectId={projectId}
          onSelect={(page) => {
            onClose();
            onSelect(page);
          }}
        />
      )}
    </SearchMenu>
  );
}

/**
 * The list itself — separated so that the request only starts once the
 * menu is opened (the hook is only mounted then).
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
    <CommandGroup>
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
            {page.icon ?? <HugeiconsIcon icon={File02Icon} className="inline size-3.5 opacity-70" />}
          </span>
          <span className="truncate">{page.title.trim() || t("untitledPage")}</span>
        </CommandItem>
      ))}
    </CommandGroup>
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
            autoFocus={allowInputAutoFocus()}
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

/**
 * “Rename”: one field holding the current name, the part before the
 * extension selected so typing keeps `.pdf` (MIN-742). Same form discipline
 * as {@link AddLinkDialog}: it opens from inside other forms.
 */
export function RenameResourceDialog({
  resource,
  onOpenChange,
  onSubmit,
}: {
  /** The resource being renamed; `null` closes the dialog. */
  resource: ResourceLike | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (resource: ResourceLike, fileName: string) => void | Promise<void>;
}) {
  const t = useTranslations("Resources");
  const tCommon = useTranslations("Common");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!resource) return;
    setValue(resource.file_name);
    setError(null);
    setBusy(false);
  }, [resource]);

  return (
    <Dialog open={resource !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          if (!allowInputAutoFocus()) return;
          event.preventDefault();
          const input = inputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(0, resourceNameStemLength(input.value));
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("renameDialogTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            // See AddLinkDialog: the parent form must not receive this submit.
            e.stopPropagation();
            if (!resource) return;
            const name = normalizeResourceName(value);
            if (!name) {
              setError(t("renameEmpty"));
              return;
            }
            if (name === resource.file_name) {
              onOpenChange(false);
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await onSubmit(resource, name);
              onOpenChange(false);
            } catch (err) {
              setError((err as Error).message || t("renameFailed"));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("renameLabel")}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy && <Spinner className="size-4" />}
              {t("rename")}
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
    // An editor inside the surface already placed the pasted image inline.
    if (e.defaultPrevented) return;
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
      // An editor inside the surface already placed the dropped image inline.
      if (e.defaultPrevented) {
        depth.current = 0;
        setDragging(false);
        return;
      }
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
      {icon ?? <HugeiconsIcon icon={AttachmentIcon} className="size-4 shrink-0" aria-hidden />}
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

/**
 * Common display for resources everywhere in the app — a file, a link and a
 * page read as the same chip, which is the whole point of the notion (MIN-184,
 * MIN-275). What differs is only the direct leading figure: a color-coded file
 * type icon, a link favicon, or a page emoji.
 *
 * It uses the exact same envelope as Numo's context pills. The leading slot has
 * the same geometry too, while keeping the colored file icon free of any tile.
 * Clicking previews a browser-compatible file, downloads an unsupported one,
 * opens a link in a tab, or opens a page in the page panel (MIN-777).
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
  onRename,
  canRename,
  draft = false,
  variant = "card",
  className,
  pillClassName,
  fileHref,
}: {
  resources?: ResourceLike[];
  pending?: PendingResource[];
  /** Pill radius — figure follows (concentric rays). `md` for
 Numo composer nesting. */
  radius?: PillRadius;
  /** Runs once the person confirmed the removal (MIN-742). */
  onRemove?: (resource: ResourceLike) => void;
  /** Per-resource gate for the X (default: every one when onRemove is set). */
  canRemove?: (resource: ResourceLike) => boolean;
  /** Cancels an upload in flight, after the same confirmation. */
  onRemovePending?: (localId: string) => void;
  /** Rename a file or a link (MIN-742). A rejection stays in the dialog. */
  onRename?: (resource: ResourceLike, fileName: string) => void | Promise<void>;
  /** Per-resource gate for the pencil (default: `canRemove`). Pages are
      never renamed: they show their page's live title. */
  canRename?: (resource: ResourceLike) => boolean;
  /** The resources belong to a composer and are not saved yet: removing one
      only takes it out of what will be sent. */
  draft?: boolean;
  /**
   * `card` (default, MIN-742): Finder-like cards with the image or the type's
   * icon, the name on two lines and the size. `pill`: the compact chip, for a
   * strip that shares one line with other context chips (Numo's composer).
   */
  variant?: "card" | "pill";
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
  const pagePanel = useOptionalPagePanelActions();
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [preview, setPreview] = useState<ResourceLike | null>(null);
  const [renaming, setRenaming] = useState<ResourceLike | null>(null);
  // What waits for its confirmation: a saved or landed resource, or an
  // upload in flight (by its local id).
  const [removing, setRemoving] = useState<
    { resource: ResourceLike } | { pending: PendingResource } | null
  >(null);

  const done = resources ?? [];
  const inFlight = pending ?? [];
  if (done.length === 0 && inFlight.length === 0) return null;

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
        <HugeiconsIcon icon={File02Icon} className="size-4 text-indigo-500 dark:text-indigo-400" aria-hidden />
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
        <HugeiconsIcon icon={Link02Icon} className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
      )}
    </ResourceFigure>
  );

  const cards = variant === "card";

  return (
    <div className={cn("flex flex-wrap", cards ? "items-start gap-2" : "items-center gap-1.5", className)}>
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
        const pageProjectId = a.project_id ?? null;
        const openPageInPanel =
          pagePanel && pageId && pageProjectId && pageHref
            ? () => pagePanel.openPage(pageProjectId, pageId)
            : null;
        const path = a.storage_path ?? null;
        const mime = a.mime_type ?? "application/octet-stream";
        const previewKind =
          !url && !pageId ? attachmentPreviewKind(mime, a.file_name) : null;
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
        const renamable = !!onRename && isRenamableResource(a) &&
          (canRename?.(a) ?? canRemove?.(a) ?? true);
        // The pill's hover commands; a card puts them in its menu instead.
        const actions = [
          ...(renamable
            ? [{
                label: t("rename"),
                onClick: () => setRenaming(a),
                icon: <HugeiconsIcon icon={Edit04Icon} className="size-3" />,
              }]
            : []),
          ...(removable
            ? [{
                label: t("remove"),
                onClick: () => setRemoving({ resource: a }),
                icon: <HugeiconsIcon icon={Cancel01Icon} className="size-3" />,
              }]
            : []),
        ];
        const key = a.id ?? url ?? pageId ?? path ?? a.file_name;

        if (cards) {
          const typeTile = (
            <ResourceTile
              icon={<ResourceTypeIcon mime={mime} name={a.file_name} className="size-6" />}
              label={tileExtension(a.file_name)}
            />
          );
          const faviconTile = (
            <ResourceTile
              icon={a.icon_data_url ? (
                // A favicon is an inline data URI: nothing to optimize.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.icon_data_url} alt="" aria-hidden className="size-6 rounded-[3px] object-contain" />
              ) : (
                <HugeiconsIcon icon={Link02Icon} className="size-6 text-sky-600 dark:text-sky-400" aria-hidden />
              )}
            />
          );
          // A link shows its page's social image when it has one, else the
          // favicon tile (MIN-742).
          const figure = url ? (
            a.preview_data_url
              ? <ResourceThumbnail src={a.preview_data_url} fallback={faviconTile} />
              : faviconTile
          ) : pageId ? (
            <ResourceTile
              icon={a.page?.icon ? (
                <span className="text-2xl leading-none">{a.page.icon}</span>
              ) : (
                <HugeiconsIcon icon={File02Icon} className="size-6 text-indigo-500 dark:text-indigo-400" aria-hidden />
              )}
            />
          ) : previewKind === "image" && path ? (
            <ResourceThumbnail
              src={fileHref?.(a, "preview") ?? attachmentFileUrl(path)}
              fallback={typeTile}
            />
          ) : typeTile;
          // A click or a right-click on the card opens these (MIN-742).
          const items: ResourceCardItem[] = [
            ...(pageHref
              ? [{
                  key: "open", label: t("openPage"), icon: <HugeiconsIcon icon={File02Icon} />, href: pageHref, internal: true,
                  ...(openPageInPanel ? { onSelect: openPageInPanel } : {}),
                }]
              : url
                ? [{ key: "open", label: t("openLink"), icon: <HugeiconsIcon icon={LinkSquare02Icon} />, href: url, external: true }]
                : previewKind && path
                  ? [{ key: "open", label: t("preview"), icon: <HugeiconsIcon icon={ViewIcon} />, onSelect: () => setPreview(a) }]
                  : []),
            ...(renamable
              ? [{ key: "rename", label: t("rename"), icon: <HugeiconsIcon icon={Edit04Icon} />, onSelect: () => setRenaming(a) }]
              : []),
            ...(path
              ? [{ key: "download", label: t("download"), icon: <HugeiconsIcon icon={Download01Icon} />, href: fileHref?.(a, "download") ?? attachmentFileUrl(path, true), download: true }]
              : []),
            ...(removable
              ? [{ key: "remove", label: t("remove"), icon: <HugeiconsIcon icon={Delete02Icon} />, destructive: true, onSelect: () => setRemoving({ resource: a }) }]
              : []),
          ];
          const detail = url
            ? hostOf(url)
            : pageId
              ? t("addPage")
              : formatFileSize(a.size_bytes ?? 0, locale);
          return (
            <ResourceCard
              key={key}
              name={fullName}
              detail={detail}
              figure={figure}
              items={items}
              menuLabel={t("actions")}
              struck={!!pageId && !pageHref}
              className={pillClassName}
            />
          );
        }
        const inner = (
          <>
            {pageHref ? (
              // INTERNAL navigation — a wiki page is not a link to
              // the outside, and opening it in a tab would lose the context of the
              // ticket we are currently reading. A plain click reads it in the
              // page panel, beside that ticket (MIN-777).
              <AppTooltip label={label}>
                <Link
                  href={pageHref}
                  aria-label={label}
                  onClick={(event) => {
                    if (!openPageInPanel || !isPlainNavigationClick(event)) return;
                    event.preventDefault();
                    openPageInPanel();
                  }}
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
                  aria-label={`${label}: ${fullName}`} aria-haspopup="dialog"
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
        return (
          <EntityPill
            key={key}
            radius={radius}
            highlight
            className={pillClassName}
            actions={actions}
          >
            {inner}
          </EntityPill>
        );
      })}

      {inFlight
        .filter((p) => p.status === "uploading")
        .map((p) => cards ? (
          <ResourceCard
            key={p.localId}
            busy
            name={p.file_name}
            detail={formatFileSize(p.size_bytes, locale)}
            figure={<ResourceTile icon={<Spinner className="size-5 text-muted-foreground" />} label={tileExtension(p.file_name)} />}
            menuLabel={t("actions")}
            items={onRemovePending ? [{
              key: "remove",
              label: t("remove"),
              icon: <HugeiconsIcon icon={Delete02Icon} />,
              destructive: true,
              onSelect: () => setRemoving({ pending: p }),
            }] : []}
            className={pillClassName}
          />
        ) : (
          <EntityPill
            key={p.localId}
            radius={radius}
            highlight
            className={cn("text-muted-foreground", pillClassName)}
            action={
              onRemovePending
                ? {
                    label: t("remove"),
                    onClick: () => setRemoving({ pending: p }),
                    icon: <HugeiconsIcon icon={Cancel01Icon} className="size-3" />,
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

      {preview && activePreviewSrc && activePreviewPath && <FileViewer
        src={activePreviewSrc}
        downloadHref={fileHref?.(preview, "download") ?? attachmentFileUrl(activePreviewPath, true)}
        fileName={preview.file_name}
        mimeType={preview.mime_type}
        open
        onOpenChange={open => { if (!open) setPreview(null); }}
        onRemove={onRemove && (canRemove?.(preview) ?? true) ? () => setRemoving({ resource: preview }) : undefined}
        onRename={onRename && isRenamableResource(preview) && (canRename?.(preview) ?? canRemove?.(preview) ?? true)
          ? () => setRenaming(preview)
          : undefined}
      />}

      {onRename && (
        <RenameResourceDialog
          resource={renaming}
          onOpenChange={(open) => { if (!open) setRenaming(null); }}
          onSubmit={onRename}
        />
      )}

      <ConfirmDeleteDialog
        open={removing !== null}
        onOpenChange={(open) => { if (!open) setRemoving(null); }}
        title={t("removeConfirmTitle", {
          name: removing
            ? "pending" in removing
              ? removing.pending.file_name
              : resourceDisplayName(removing.resource)
            : "",
        })}
        description={
          removing && "pending" in removing
            ? t("removeUploadConfirmDescription")
            : draft
              ? t("removeDraftConfirmDescription")
              : t("removeConfirmDescription")
        }
        confirmLabel={t("remove")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          if (!removing) return;
          if ("pending" in removing) onRemovePending?.(removing.pending.localId);
          else onRemove?.(removing.resource);
        }}
      />
    </div>
  );
}

/**
 * The chips of a composer's queue (create dialogs, comment and reply
 * composers): landed entries by their future id, uploads in flight, removal
 * and renaming before anything is saved (MIN-742).
 */
export function ComposerResourcePills({
  uploads,
  className,
  radius,
  pillClassName,
}: {
  uploads: Pick<AttachmentUploads, "pending" | "remove" | "rename">;
  className?: string;
  radius?: PillRadius;
  pillClassName?: string;
}) {
  return (
    <ResourcePills
      resources={landedResources(uploads.pending)}
      pending={uploads.pending}
      radius={radius}
      draft
      onRemove={(a) => {
        if (a.id) uploads.remove(a.id);
      }}
      onRemovePending={uploads.remove}
      onRename={(a, fileName) => {
        if (a.id) uploads.rename(a.id, fileName);
      }}
      className={className}
      pillClassName={pillClassName}
    />
  );
}

/** `https://www.linear.app/docs` → `linear.app`: what a link card shows under its title. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
