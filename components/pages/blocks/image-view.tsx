"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import { ImageOff, RotateCcw } from "lucide-react";
// `cx` and not `cn` of mango-ui: the barrel draws the emoji selector, and the
// block register would cease to be importable outside the browser (see cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import {
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  clampImageWidth,
} from "@/components/pages/blocks/image";
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
export function ImageView({ node, editor, updateAttributes, getPos }: NodeViewProps) {
  const t = useTranslations("Pages");
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
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const displayed = src ?? upload?.previewUrl ?? null;
  const failed = upload?.status === "failed";
  // Neither address nor sending: the block survived a tab closed in the middle of sending.
  const abandoned = !src && !upload;

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapper}
      // Neither contour nor rounded corners when the block is selected (MIN-282).
      //
      // The ring framed the ENTIRE block, legend included, and its radius cut
      // what affects the angles — starting with the alternative text, that the
      // browser draws IN the image box when it doesn't load.
      //
      // There is therefore NO more selection mark on the image, and it is
      // assumed: what designates the block is the gutter when hovered (the handle
      // and the `+`), as on any other block of the document. Nothing
      // else in this editor is not painting because it is selected.
      className="my-2 flex flex-col items-start"
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
          <img
            src={displayed}
            alt={alt}
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
            onClick={() => {
              if (src) setZoomed(true);
            }}
          />

          {upload?.status === "uploading" && (
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((upload.progress || 0) * 100)}%` }}
              />
            </div>
          )}

          {editor.isEditable && src && (
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
          <ImageOff className="size-4 shrink-0" />
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
              <RotateCcw className="size-3" />
              {t("uploadRetry")}
            </button>
          )}
        </div>
      )}

      {(editor.isEditable || alt) && src && (
        <input
          value={alt}
          readOnly={!editor.isEditable}
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
          className="mt-1 w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60"
          style={{ maxWidth: width ? `${width}%` : "100%" }}
        />
      )}

      {zoomed && src && (
        // Preview on click: a layer, closed by ESC or by any click
        // Or. No mango-ui dialog — block register should remain
        // importable outside the browser, and this view is already all you need.
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("imageOpen")}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
          onClick={() => setZoomed(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
    </NodeViewWrapper>
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
