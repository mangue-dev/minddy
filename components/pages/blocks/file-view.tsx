"use client";

import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { Download, File as FileIcon, RotateCcw } from "lucide-react";
import { cx } from "@/components/pages/blocks/cx";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { fileDownloadHref, formatFileSize } from "@/lib/page-files";
import { usePageUploadsContext } from "@/components/pages/page-uploads";

/**
 * The view of a file block (MIN-280): a line, with the name, the weight and the
 * download. Same four states as the image view, for the same reason
 * — an unsuccessful upload must be seen and tried again, not leave a
 * silent block in the document.
 *
 * The download is a real anchor: the ⌘-click, the middle click and
 * "save as" from the context menu come with it, and no `onClick` * knows how to redo them. `editor-node-link` is not decorative: it is the mark by
 * which the editor leaves this anchor alone (cf.
 * components/editor-node-link.ts and the `PROSE` of page-editor.tsx).
 *
 * The download address depends on the form of the `src` — application or URL
 * signed by a published page: cf. `fileDownloadHref` (lib/page-files.ts).
 */
export function FileView({ node, selected }: NodeViewProps) {
  const t = useTranslations("Pages");
  const locale = useLocale();
  const uploads = usePageUploadsContext();

  const src = (node.attrs.src as string | null) ?? null;
  const uploadId = (node.attrs.uploadId as string | null) ?? null;
  const upload = uploadId ? uploads?.get(uploadId) : undefined;
  const name =
    (node.attrs.name as string | null) || upload?.file.name || t("blockFile");
  const size = (node.attrs.size as number | null) ?? upload?.file.size ?? 0;

  // The rule lives in lib/page-files.ts, along with the rest of what this module knows
  // of a file address — and it is tested there.
  const href = src ? fileDownloadHref(src) : null;

  const failed = upload?.status === "failed";
  const abandoned = !src && !upload;
  const weight = formatFileSize(size, locale);

  return (
    <NodeViewWrapper
      as="div"
      className={cx(
        "my-1 flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors",
        src && "hover:bg-muted",
        // Selected, the line DARKENS and nothing more (MIN-282):
        // the blue ring doubled a frame that this block already has, and two lines
        // concentric with two rays reads like a rendering defect. THE
        // radius, he remains - here he draws a map, he does not crop anything.
        selected && "bg-muted"
      )}
      contentEditable={false}
    >
      <FileIcon
        className={cx("size-4 shrink-0 text-muted-foreground", !src && "opacity-60")}
      />

      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block truncate text-base font-normal",
            src ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {failed
            ? t("uploadFailed", { name })
            : abandoned
              ? t("fileMissing")
              : upload
                ? t("uploadInProgress", { name })
                : weight}
        </span>
      </span>

      {upload?.status === "uploading" && (
        <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full bg-primary transition-[width]"
            style={{ width: `${Math.round((upload.progress || 0) * 100)}%` }}
          />
        </span>
      )}

      {failed && uploadId && (
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => uploads?.retry(uploadId)}
        >
          <RotateCcw className="size-3" />
          {t("uploadRetry")}
        </button>
      )}

      {href && (
        <a
          href={href}
          // The name of the file when the browser saves itself: on a
          // Signed URL from another host it is ignored (it is the signature which
          // carries the provision), on ours it costs nothing.
          download={name}
          className={cx(
            NODE_LINK_CLASS,
            "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
          )}
          // Like the image (MIN-282): an anchor is natively draggable, and the
          // slipped which carries its URL. Dropped in the document, there
          // wrote a link — one more block born from an unwanted gesture
          // TO DO. The block moves by its handle, not by its button.
          draggable={false}
          // `handleNodeLinkClick` has already cut the Link extension AND
          // default anchor behavior (components/editor-node-link.ts):
          // without this relay, the ordinary click would no longer do anything at all. There
          // response carries a `Content-Disposition: attachment`, so the assignment
          // download without leaving the page. MODIFIED clicks are not
          // preempted — the browser serves them better than us.
          onClick={(event) => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            window.location.href = event.currentTarget.href;
          }}
        >
          <Download className="size-3" />
          {t("fileDownload")}
        </a>
      )}
    </NodeViewWrapper>
  );
}

/** See `imageNodeView`: the view is injected by the surface, not named by the
 block file — the register must remain importable outside the browser. */
export function fileNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(FileView) as unknown as NodeViewRenderer;
}
