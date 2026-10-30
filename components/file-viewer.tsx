"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, MoreHorizontalIcon, Delete02Icon, Edit04Icon } from "@hugeicons/core-free-icons";
import { ImageViewer, PreviewViewer } from "@/components/image-viewer";
import { Markdown } from "@/components/markdown";
import { normalizeMimeType } from "@/lib/inline-safe";
import { attachmentPreviewKind, isCsvAttachment, isMarkdownFileName, isPlainTextAttachment, withAttachmentPreviewTheme, type AttachmentPreviewKind } from "@/lib/attachment-preview";

function TextAttachmentPreview({ src, markdown }: { src: string; markdown: boolean }) {
  const t = useTranslations("Resources");
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setContent(null);
    setFailed(false);

    void fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("File preview request failed");
        return response.text();
      })
      .then((text) => {
        if (!controller.signal.aborted) setContent(text);
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }
        setFailed(true);
      });

    return () => controller.abort();
  }, [src]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {t("previewFailed")}
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {t("previewLoading")}
      </div>
    );
  }

  return (
    // Absolutely placed in the reader's bounded body: it scrolls inside the
    // reader while the filename and the actions stay in view.
    <div className="absolute inset-0 overflow-y-auto overscroll-contain bg-background p-6 sm:p-8">
      {markdown ? <Markdown breaks={false} className="mx-auto max-w-4xl">{content}</Markdown>
        : <pre className="whitespace-pre-wrap break-words font-mono text-sm">{content}</pre>}
    </div>
  );
}

/**
 * The browser's PDF viewer refuses sandboxed documents, and the preview
 * response is always sandboxed. The bytes are read once and shown from a
 * local blob typed `application/pdf`, which only the PDF viewer can render.
 */
function PdfAttachmentPreview({ src, fileName }: { src: string; fileName: string }) {
  const t = useTranslations("Resources");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("File preview request failed");
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        setUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {failed ? t("previewFailed") : t("previewLoading")}
      </div>
    );
  }
  return <iframe src={url} title={fileName} className="h-full w-full border-0 bg-white" />;
}

function AttachmentPreview({
  kind,
  src,
  fileName,
  mimeType,
}: {
  kind: Exclude<AttachmentPreviewKind, "image">;
  src: string;
  fileName: string;
  mimeType?: string | null;
}) {
  const { resolvedTheme } = useTheme();
  if (kind === "document" && (isMarkdownFileName(fileName) || (!isCsvAttachment(mimeType, fileName) && isPlainTextAttachment(mimeType, fileName)))) {
    return <TextAttachmentPreview key={src} src={src} markdown={isMarkdownFileName(fileName)} />;
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
  if (normalizeMimeType(mimeType) === "application/pdf") {
    return <PdfAttachmentPreview key={src} src={src} fileName={fileName} />;
  }
  return (
    <iframe
      src={withAttachmentPreviewTheme(src, resolvedTheme)}
      title={fileName}
      sandbox=""
      className="h-full w-full border-0 bg-white"
    />
  );
}

/** Kept inside the native dialog: body portals are inert below its top layer. */
function FilePreviewActions({ close, downloadHref, fileName, onRemove, onRename }: {
  close: () => void;
  downloadHref: string;
  fileName: string;
  onRemove?: () => void;
  onRename?: () => void;
}) {
  const common = useTranslations("Common");
  const t = useTranslations("Resources");
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  // A pointer opening focuses the menu itself, so no item looks selected
  // before the arrow keys move to one; a keyboard opening focuses an item.
  const openedWithPointer = useRef(false);
  const dismiss = () => { setExpanded(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!expanded) return;
    const items = menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]");
    if (openedWithPointer.current) menu.current?.focus();
    else items?.[focusLast.current ? items.length - 1 : 0]?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setExpanded(false);
    };
    // Capture phase: the reader stops its events before they bubble to the document.
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [expanded]);

  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    dismiss();
    if (!isPlainNavigationClick(event) || new URL(downloadHref, window.location.href).origin === window.location.origin) return;
    // Cross-origin image URLs ignore the download attribute. Save their bytes locally.
    event.preventDefault();
    if (downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const response = await fetch(downloadHref);
      if (!response.ok) throw new Error("File download request failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" || (index < 0 && event.key === "ArrowDown") ? 0
        : event.key === "End" || (index < 0 && event.key === "ArrowUp") ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
    if ((event.key === " " || event.key === "Enter") && index >= 0) {
      event.preventDefault();
      items[index]?.click();
    }
    if (event.key === "Tab") setExpanded(false);
  };

  return <div className="flex flex-col items-center gap-2">
    {downloadFailed && <p role="alert" className="max-w-sm text-center text-sm text-destructive">{t("downloadFailed")}</p>}
    <div ref={container} className="relative flex items-center gap-2">
    <Button data-preview-close type="button" variant="outline" className="min-h-12 min-w-40 rounded-full px-8" onClick={close}>{common("close")}</Button>
    <Button ref={trigger} type="button" variant="outline" size="icon" className="size-12 rounded-full"
      aria-label={t("actions")} aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded ? menuId : undefined}
      // `detail` counts pointer clicks; Enter and Space dispatch a click with 0.
      onClick={event => { openedWithPointer.current = event.detail > 0; focusLast.current = false; setExpanded(value => !value); }}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openedWithPointer.current = false; focusLast.current = event.key === "ArrowUp"; setExpanded(true); } }}>
      <HugeiconsIcon icon={MoreHorizontalIcon} className="size-5" aria-hidden />
    </Button>
    {expanded && <div ref={menu} id={menuId} role="menu" aria-label={t("actions")} tabIndex={-1}
      onKeyDown={navigate}
      // Focus moving to the trigger is its own toggle: closing here first made
      // that click reopen the menu instead of closing it.
      onBlur={event => { if (event.relatedTarget && !container.current?.contains(event.relatedTarget)) setExpanded(false); }}
      className="absolute right-0 bottom-full z-10 mb-2 min-w-48 outline-none rounded-xl bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-border">
      <a role="menuitem" tabIndex={-1} href={downloadHref} download={fileName} aria-disabled={downloading} onClick={download}
        className="flex min-h-10 items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none">
        <HugeiconsIcon icon={Download01Icon} className="size-4" aria-hidden />{t("download")}
      </a>
      {/* Rename and Remove close the viewer first: their dialogs open in the
          page, which is inert below this native dialog's top layer. */}
      {onRename && <button type="button" role="menuitem" tabIndex={-1}
        className="flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
        onClick={() => { close(); onRename(); }}>
        <HugeiconsIcon icon={Edit04Icon} className="size-4" aria-hidden />{t("rename")}
      </button>}
      {onRemove && <div role="separator" className="-mx-2 my-1 h-px bg-menu-separator" />}
      {onRemove && <button type="button" role="menuitem" tabIndex={-1}
        className="flex min-h-10 w-full items-center gap-2 rounded-sm px-2 text-sm text-destructive hover:bg-destructive-surface-hover focus:bg-destructive-surface-hover focus:outline-none"
        onClick={() => { close(); onRemove(); }}>
        <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden />{t("remove")}
      </button>}
    </div>}
    </div>
  </div>;
}

/** One full-screen reader for stored issue resources and page files. */
export function FileViewer({ src, downloadHref, fileName, mimeType, open, onOpenChange, onRemove, onRename, layoutId }: {
  src: string;
  downloadHref: string;
  fileName: string;
  mimeType?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Asked once the viewer has closed; the caller confirms (MIN-742). */
  onRemove?: () => void;
  onRename?: () => void;
  /** An image flies from and back to the thumbnail carrying the same layout id. */
  layoutId?: string;
}) {
  const kind = attachmentPreviewKind(mimeType, fileName);
  if (!kind) return null;
  const action = (close: () => void) => <FilePreviewActions close={close} downloadHref={downloadHref} fileName={fileName} onRemove={onRemove} onRename={onRename} />;
  const props = { label: fileName, open, onOpenChange, action };
  if (kind === "image") return <ImageViewer {...props} src={src} alt={fileName} layoutId={layoutId} />;
  return <PreviewViewer {...props}>
    <div className="flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden border border-border bg-background shadow-lg">
      <div className="shrink-0 truncate border-b border-border px-5 py-3 text-sm font-medium">{fileName}</div>
      <div className="relative min-h-0 flex-1"><AttachmentPreview kind={kind} src={src} fileName={fileName} mimeType={mimeType} /></div>
    </div>
  </PreviewViewer>;
}
