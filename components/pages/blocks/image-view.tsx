"use client";

import { useEditorEditable } from "@/components/editor/use-editor-editable";
import { HugeiconsIcon } from "@hugeicons/react";
import { ImageNotFound01Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { useCallback, useId, useRef, useState } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
// `cx` and not `cn`: block views keep a dependency-free class join so the
// block register stays importable outside the browser (see lib/cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  clampImageWidth,
} from "@/components/pages/blocks/image";
import { FileViewer } from "@/components/file-viewer";
import { IMAGE_HERO_TRANSITION } from "@/components/image-viewer";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { fileDownloadHref } from "@/lib/page-files";
import { usePageUploadsContext } from "@/components/pages/page-uploads";

/**
 * The view of an image block (MIN-280). Four states, and the fourth is the one which
 * makes the difference between a feature and a demo:
 *
 * - the image is there: it is displayed at its width, with its caption;
 * - it LEAVES: the local preview as a watermark, and the progress on top. We
 * sees what we have just pasted even before the network has finished, which is
 * half the convenience of a paste;
 * - the sending has FAILED: the file is still in memory, we try again with a click
 * without having to search for it;
 * - the block has NEITHER an address NOR sending in progress — a tab closed at the wrong
 * time. We say it, and it is removed like any block. Never an
 * empty square which we do not know if it still loads.
 *
 * The LEGEND is an ordinary input field, not a text node: it lives
 * in the `alt` attribute (so in the alternative text of the markdown, cf.
 * blocks/image.ts). Making it ProseMirror content would have meant one more
 * node, one more cursor position, and one more markdown round trip to reinvent
 * for the same sentence.
 */
export function ImageView({ node, editor, updateAttributes, getPos, deleteNode }: NodeViewProps) {
  const editable = useEditorEditable(editor);
  const t = useTranslations("Pages");
  const tResources = useTranslations("Resources");
  const tCommon = useTranslations("Common");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const uploads = usePageUploadsContext();
  const src = (node.attrs.src as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? "";
  const width = clampImageWidth(node.attrs.width);
  const uploadId = (node.attrs.uploadId as string | null) ?? null;
  const upload = uploadId ? uploads?.get(uploadId) : undefined;

  const wrapper = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  /* ── Resizing ─────────────────────── ──────────────────────── */

  // As a percentage of the COLUMN, never in pixels (see blocks/image.ts): the
  // handle therefore reads the width of the container on each movement, and the mouse
  // has nothing to do with the actual size of the file.
  const startResize = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!editor.isEditable) return;
      const container = wrapper.current;
      if (!container) return;
      event.preventDefault();
      const full = container.getBoundingClientRect().width;
      if (full <= 0) return;
      const left = container.getBoundingClientRect().left;
      setDragging(true);

      const move = (moveEvent: PointerEvent) => {
        const ratio = ((moveEvent.clientX - left) / full) * 100;
        updateAttributes({
          width: Math.min(
            IMAGE_MAX_WIDTH,
            Math.max(IMAGE_MIN_WIDTH, Math.round(ratio))
          ),
        });
      };
      const stop = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    },
    [editor, updateAttributes]
  );

  /* ── Preview on click ───────────────────────── ────────────────────────── */

  const [zoomed, setZoomed] = useState(false);
  // The opened image flies from the block and back, as in the documentation.
  const heroId = useId();
  const reducedMotion = useReducedMotion();
  const layoutId = src && !reducedMotion ? `editor-image-${heroId}` : undefined;
  const displayed = src ?? upload?.previewUrl ?? null;
  const failed = upload?.status === "failed";
  // Neither address nor sending: the block survived a tab closed in the middle of sending.
  const abandoned = !src && !upload;

  return (
    <LayoutGroup id={heroId}>
    <NodeViewWrapper
      as="div"
      ref={wrapper}
      // No ring and no rounded crop when the block is selected (MIN-282): a
      // ring framed the caption too, and a radius cut the alternative text the
      // browser draws inside a broken image. A selected image shows the
      // editor's selection box instead, painted over the block like on every
      // other block (`.ProseMirror-selectednode`, `.is-block-selected`,
      // app/globals.css).
      className="group/image-block my-2 flex flex-col items-start"
      contentEditable={false}
    >
      {displayed ? (
        <div
          className="group/image relative max-w-full"
          style={{ width: width ? `${width}%` : "100%" }}
        >
          {/* A bare `img` tag, not `next/image`: the source is a
 302 redirect to a signed URL, which Next's optimizer can neither cache nor resize — it would do one more
 round trip to render exactly the same byte. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <button type="button" disabled={!src} aria-label={t("imageOpen")} aria-haspopup="dialog"
            className="block w-full text-left disabled:cursor-default"
            onClick={() => { if (src) setZoomed(true); }}>
          {/* `layoutDependency`: the hero flight runs when the preview opens or
              closes, never when the width changes — a resize animated every
              step, so the image trailed behind the handle. */}
          <motion.span layoutId={layoutId} layoutDependency={zoomed} className="block"
            animate={{ opacity: zoomed ? 0 : 1 }}
            transition={{ ...IMAGE_HERO_TRANSITION, opacity: { duration: reducedMotion ? 0 : 0.12 } }}>
          <img
            src={displayed}
            alt={alt}
            // Signed-URL blocks decode off the critical path: a page with
            // many images must not fetch and decode them all on open.
            loading="lazy"
            decoding="async"
            /**
 * Dragging does not start from the IMAGE, it starts from the block (MIN-282).
 *
 * An image is natively draggable, and it is this that the
 * browser takes when you drag it — not the node that contains it.
 * The transfer then carries HTML (`<img src=…>`), so nothing but
 * ProseMirror recognizes it as a move: it falls back to its default
 * collage and INSERTS a second image. A drag of three
 * pixels, the one you do without meaning to by clicking, duplicated
 * the block.
 *
 * `draggable={false}` returns the gesture to the container, which ProseMirror
 * already knows how to drag (`draggable: true` in node schema,
 * blocks/image.ts). Dragging an image therefore MOVES it, instead of copying it — what the gutter handle already does, and what
 * made the gesture appear.
 *
 * What we lose: dragging the image to the desktop or another
 * tab. Opening it wide with a click returns it to this gesture.
 */
            draggable={false}
            className={cx(
              "h-auto w-full",
              src && "cursor-zoom-in",
              !src && "opacity-60"
            )}
          />
          </motion.span>
          </button>

          {upload?.status === "uploading" && (
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((upload.progress || 0) * 100)}%` }}
              />
            </div>
          )}

          {editable && src && (
            // The width handle: on the right edge, revealed on hover.
            // `touch-none` because a swipe would otherwise scroll the
            // page under the handle instead of following it.
            <span
              role="slider"
              tabIndex={-1}
              aria-label={t("imageResize")}
              aria-valuemin={IMAGE_MIN_WIDTH}
              aria-valuemax={IMAGE_MAX_WIDTH}
              aria-valuenow={width ?? IMAGE_MAX_WIDTH}
              onPointerDown={startResize}
              className={cx(
                "absolute top-1/2 right-1 h-10 w-1.5 -translate-y-1/2 cursor-ew-resize touch-none rounded-full bg-foreground/40 opacity-0 transition-opacity",
                "group-hover/image:opacity-100",
                dragging && "opacity-100"
              )}
            />
          )}
        </div>
      ) : (
        <div
          className={cx(
            "flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-sm",
            failed || abandoned ? "text-muted-foreground" : "text-muted-foreground"
          )}
        >
          <HugeiconsIcon icon={ImageNotFound01Icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {failed
              ? t("uploadFailed", { name: upload!.file.name })
              : abandoned
                ? t("imageMissing")
                : t("uploadInProgress", { name: upload?.file.name ?? "" })}
          </span>
          {failed && uploadId && (
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => uploads?.retry(uploadId)}
            >
              <HugeiconsIcon icon={Undo02Icon} className="size-3" />
              {t("uploadRetry")}
            </button>
          )}
        </div>
      )}

      {(editable || alt) && src && (
        <input
          value={alt}
          readOnly={!editable}
          placeholder={t("imageCaption")}
          aria-label={t("imageCaption")}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          // The keyboard belongs to the field as long as we write on it: without that, ⌫ on
          // an empty caption would go up to ProseMirror and delete the image
          // that we are in the process of captioning.
          onKeyDown={(event) => event.stopPropagation()}
          onFocus={() => {
            // `getPos` returns `undefined` when the node is no longer in the
            // document — the view survives its own deletion for a moment.
            const pos = getPos?.();
            if (typeof pos === "number") editor.commands.setNodeSelection(pos);
          }}
          // An empty caption is an offer, shown on hover and while typing in
          // it; a written one is content and stays. A touch screen has no
          // hover, so the offer stays there.
          className={cx(
            "mt-1 w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60",
            !alt &&
              "opacity-0 transition-opacity group-hover/image-block:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
          )}
          style={{ maxWidth: width ? `${width}%` : "100%" }}
        />
      )}

      {src && <FileViewer
        src={src}
        downloadHref={fileDownloadHref(src) ?? src}
        fileName={alt || upload?.file.name || t("blockImage")}
        mimeType="image/png"
        open={zoomed}
        onOpenChange={setZoomed}
        layoutId={layoutId}
        onRemove={editable ? () => setConfirmRemove(true) : undefined}
      />}
      {/* Removing from the viewer asks first (MIN-742). */}
      {/* Mounted on demand: a page can hold many blocks. */}
      {confirmRemove && <ConfirmDeleteDialog
        open
        onOpenChange={setConfirmRemove}
        title={tResources("removeConfirmTitle", { name: alt || upload?.file.name || t("blockImage") })}
        description={tResources("removeBlockConfirmDescription")}
        confirmLabel={tResources("remove")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => deleteNode()}
      />}

    </NodeViewWrapper>
    </LayoutGroup>
  );
}

/**
 * The view, ready to be grafted onto the image node — by the page editor, which
 * injects it into `pageExtensions({ nodeViews })`. It lives HERE and not on the
 * node because this file is a client module: the node is mounted outside the
 * browser by the markdown projection (see blocks/subpage-view.tsx).
 */
export function imageNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(ImageView) as unknown as NodeViewRenderer;
}
