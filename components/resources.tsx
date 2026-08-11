"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import {
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Link2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { EntityPill, PillIcon, type PillRadius } from "@/components/entity-pill";
import type { ResourceKind } from "@/lib/types";
import { normalizeWebUrl } from "@/lib/url-normalize";
import { usePagesQuery } from "@/lib/use-pages-query";
import { flattenPageTree } from "@/lib/pages";
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
  /** Page half (MIN-275) — the id, and the page itself when the read resolved
      it. `page` absent or null on a page resource means the page is in the
      trash (or the read carried no join): the chip stays, inert. */
  page_id?: string | null;
  page?: { id: string; title: string; icon: string | null } | null;
  /** Where the page lives — the chip links to it inside the app. */
  project_id?: string | null;
}

/** L'adresse d'une page dans l'app — la même que celle de l'arbre du wiki. */
export function pageResourceHref(projectId: string, pageId: string): string {
  return `/projects/${projectId}/pages/${pageId}`;
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

/** Ce qu'un sélecteur de page rend : de quoi écrire la ressource et l'afficher
    tout de suite, sans attendre que la ligne redescende du serveur. */
export interface PickedPage {
  id: string;
  title: string;
  icon: string | null;
}

/**
 * « Choisir une page » : l'arbre du wiki du projet, à plat dans son ordre
 * d'affichage et indenté par profondeur, dans le même shell cmdk que les autres
 * sélecteurs de l'app.
 *
 * L'arbre vient du cache du projet ([use-pages-query](../lib/use-pages-query.ts)),
 * celui que lisent déjà la sidebar, le fil d'Ariane et le bloc sous-page : une
 * page renommée ailleurs se cherche ici sous son nouveau nom, sans requête de
 * plus. Le cache n'est demandé qu'à l'OUVERTURE du dialog (`open` conditionne le
 * montage) — la sidebar d'un ticket n'a pas à charger le wiki pour afficher un
 * bouton.
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
      {/* Le champ de recherche est posé dans un `p-1 pb-0` : la liste reprend le
          MÊME retrait (4px) de chaque côté — sinon les options mordent un bord
          que le champ respecte — et son `pt` fait la gouttière qui manquait
          entre les deux. */}
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
 * La liste elle-même — séparée pour que la requête ne parte qu'une fois le
 * dialog ouvert (le hook n'est monté qu'alors).
 *
 * Liste À PLAT : les pages défilent dans l'ordre de la sidebar, mais sans
 * retrait d'imbrication. Ce qu'on fait ici est CHOISIR une page, pas se repérer
 * dans l'arbre — et une liste qu'on filtre en tapant perd de toute façon la
 * hiérarchie dès le premier caractère, ne laissant qu'un décalage sans sens.
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
            // Ce dialog s'ouvre DEPUIS un formulaire (le composer de ticket, celui
            // d'objectif) : le portail de Radix le sort du DOM du parent, mais pas
            // de l'arbre React — l'événement `submit` d'ici remonte donc jusqu'au
            // `onSubmit` de là-bas, qui créait le ticket au lieu d'ajouter le lien
            // (et sans le lien, `addLink` n'ayant pas encore rendu la main).
            // `preventDefault` ne suffit pas : il annule le comportement natif,
            // pas la propagation React.
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

/** Une teinte par genre de ressource, dans la table des pilules de contexte de
    Numo : une page est indigo ICI COMME LÀ-BAS. Un fichier garde le gris — il
    n'a pas de nature à annoncer, sa figure MIME le dit déjà. */
const KIND_TINT: Record<"file" | "link" | "page", string | undefined> = {
  file: undefined,
  link: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  page: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
};

/**
 * Common display for resources everywhere in the app — a file, a link and a
 * page read as the same chip, which is the whole point of the notion (MIN-184,
 * MIN-275). What differs is only what fits inside: a file shows its type icon
 * and its weight, a link its favicon, a page its emoji — and neither of those
 * two has a size to speak of.
 *
 * - `pill` — la pilule commune de minddy ([entity-pill.tsx](entity-pill.tsx)),
 *   celle du contexte de Numo : mêmes rayons concentriques, même figure teintée,
 *   même croix en surimpression. Le clic prévisualise une image, télécharge un
 *   autre fichier, ouvre un lien dans un onglet, une page dans l'app.
 * - `ultra-compact` — icon + truncated name only, for dense surfaces (chat
 *   bubbles, reply rows).
 *
 * `pending` renders the in-flight entries of a composer as spinner pills.
 */
export function ResourcePills({
  resources,
  pending,
  variant = "pill",
  radius = "full",
  onRemove,
  canRemove,
  onRemovePending,
  className,
  pillClassName,
}: {
  resources?: ResourceLike[];
  pending?: PendingResource[];
  variant?: "pill" | "ultra-compact";
  /** Rayon de la pilule — la figure suit (rayons concentriques). `md` pour
      l'imbrication du composer de Numo. */
  radius?: PillRadius;
  onRemove?: (resource: ResourceLike) => void;
  /** Per-resource gate for the X (default: every one when onRemove is set). */
  canRemove?: (resource: ResourceLike) => boolean;
  onRemovePending?: (localId: string) => void;
  className?: string;
  /** Applied to each chip — e.g. `shadow-none` in the Numo composer. */
  pillClassName?: string;
}) {
  const t = useTranslations("Resources");
  const [preview, setPreview] = useState<ResourceLike | null>(null);

  const done = resources ?? [];
  const inFlight = pending ?? [];
  if (done.length === 0 && inFlight.length === 0) return null;

  const compact = variant === "ultra-compact";
  const compactClass = cn(
    "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground/90",
    pillClassName
  );

  /** The chip's leading square — a MIME type icon, a favicon, or an emoji. */
  const iconTile = (inner: React.ReactNode, tint?: string) =>
    compact ? (
      inner
    ) : (
      <PillIcon radius={radius} tint={tint}>
        {inner}
      </PillIcon>
    );

  /** L'emoji de la page, ou l'icône par défaut du wiki — même tuile que le
      reste, pour que les trois genres se lisent sur une seule ligne. */
  const pageIcon = (emoji: string | null | undefined) =>
    iconTile(
      emoji ? (
        <span className={compact ? "text-[10px] leading-none" : "text-[11px] leading-none"}>
          {emoji}
        </span>
      ) : (
        <FileText
          className={compact ? "size-3 shrink-0 text-muted-foreground" : "h-3 w-3"}
          aria-hidden
        />
      ),
      // Un emoji porte sa propre couleur : la teinte irait contre lui.
      emoji ? undefined : KIND_TINT.page
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
      ),
      iconDataUrl ? undefined : KIND_TINT.link
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
        const image = !url && !pageId && isImage(mime);
        const label = url
          ? t("openLink")
          : pageId
            ? pageHref
              ? t("openPage")
              : t("pageUnavailable")
            : image
              ? t("preview")
              : t("download");
        const body = (
          <>
            {url
              ? linkIcon(a.icon_data_url)
              : pageId
                ? pageIcon(a.page?.icon)
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
                !compact && "min-w-0 font-medium text-foreground/80",
                // Page partie à la corbeille : le titre reste lisible, mais rien
                // ne prétend qu'on peut l'ouvrir.
                pageId && !pageHref && "text-muted-foreground line-through"
              )}
            >
              {pageId ? (a.page?.title?.trim() || a.file_name) : a.file_name}
            </span>
            {!compact && !url && !pageId && (
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(a.size_bytes ?? 0, t("mb"), t("kb"))}
              </span>
            )}
          </>
        );
        const removable = !!onRemove && (canRemove?.(a) ?? true);
        const inner = (
          <>
            {pageHref ? (
              // Navigation INTERNE — une page du wiki n'est pas un lien vers
              // l'extérieur, et l'ouvrir dans un onglet perdrait le contexte du
              // ticket qu'on est en train de lire.
              <Link
                href={pageHref}
                title={label}
                aria-label={label}
                className="flex min-w-0 items-center gap-[inherit] hover:underline"
              >
                {body}
              </Link>
            ) : pageId ? (
              <span
                title={label}
                className="flex min-w-0 items-center gap-[inherit]"
              >
                {body}
              </span>
            ) : url ? (
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
          </>
        );
        const key = a.id ?? url ?? pageId ?? path ?? a.file_name;

        // La forme dense garde son enveloppe à elle : elle vit dans une bulle de
        // conversation, où la pilule commune serait deux fois trop grande.
        if (compact) {
          return (
            <span key={key} className={compactClass}>
              {inner}
              {removable && (
                <button
                  type="button"
                  onClick={() => onRemove(a)}
                  title={t("remove")}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                  <span className="sr-only">{t("remove")}</span>
                </button>
              )}
            </span>
          );
        }

        return (
          <EntityPill
            key={key}
            radius={radius}
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
        .map((p) =>
          compact ? (
            <span
              key={p.localId}
              className={cn(compactClass, "text-muted-foreground")}
            >
              <Spinner className="size-3 shrink-0" />
              <span className="truncate">{p.file_name}</span>
              {onRemovePending && (
                <button
                  type="button"
                  onClick={() => onRemovePending(p.localId)}
                  title={t("remove")}
                  className="shrink-0 rounded-full p-0.5 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                  <span className="sr-only">{t("remove")}</span>
                </button>
              )}
            </span>
          ) : (
            <EntityPill
              key={p.localId}
              radius={radius}
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
              <PillIcon radius={radius}>
                <Spinner className="h-3 w-3" />
              </PillIcon>
              <span className="min-w-0 truncate">{p.file_name}</span>
            </EntityPill>
          )
        )}

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
