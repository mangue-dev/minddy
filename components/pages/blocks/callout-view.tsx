"use client";

import { useLayoutEffect, useRef } from "react";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import { SmilePlus } from "lucide-react";
import { EmojiPicker } from "@/components/pages/emoji-picker";
import {
  PAGE_COLORS,
  type PageColor,
} from "@/components/pages/blocks/color";
import {
  automaticCalloutColor,
  CALLOUT_COLOR_ATTRIBUTE,
  CALLOUT_ICON_ATTRIBUTE,
} from "@/components/pages/blocks/callout";

function firstTextRect(root: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const value = text.textContent ?? "";
    const start = value.search(/\S/);
    if (start < 0) continue;
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 1);
    const rect = range.getClientRects()[0];
    if (rect?.height) return rect;
  }
  return null;
}

/**
 * Align the emoji with the actual first rendered line, rather than assuming a
 * paragraph line height. This stays correct when the first block is a heading
 * and when responsive wrapping or font loading changes its metrics.
 */
function useFirstLineIconAlignment(icon: string | null) {
  const iconRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const iconElement = iconRef.current;
    const callout = iconElement?.closest<HTMLElement>('[data-type="callout"]');
    const content = callout?.querySelector<HTMLElement>(
      ":scope > [data-callout-content]"
    );
    if (!iconElement || !callout || !content) return;

    let disposed = false;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const firstBlock = content.firstElementChild as HTMLElement | null;
      if (!firstBlock) return;
      const lineRect = firstTextRect(firstBlock) ?? firstBlock.getBoundingClientRect();
      const iconRect = firstTextRect(iconElement) ?? iconElement.getBoundingClientRect();
      if (!lineRect.height || !iconRect.height) return;

      const current =
        Number.parseFloat(
          callout.style.getPropertyValue("--page-callout-icon-offset")
        ) || 0;
      const correction =
        lineRect.top + lineRect.height / 2 -
        (iconRect.top + iconRect.height / 2);
      if (Math.abs(correction) < 0.25) return;
      callout.style.setProperty(
        "--page-callout-icon-offset",
        `${current + correction}px`
      );
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    resize.observe(iconElement);
    const mutations = new MutationObserver(schedule);
    mutations.observe(content, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    void document.fonts?.ready.then(() => {
      if (!disposed) schedule();
    });

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [icon]);

  return iconRef;
}

/** The browser view adds the emoji picker; the headless schema stays React-free. */
export function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Pages");
  const icon =
    typeof node.attrs.icon === "string" && node.attrs.icon.length > 0
      ? node.attrs.icon
      : null;
  const color =
    typeof node.attrs.color === "string" &&
    PAGE_COLORS.includes(node.attrs.color as PageColor)
      ? (node.attrs.color as PageColor)
      : null;
  const renderedColor = color ?? automaticCalloutColor(icon);
  const iconRef = useFirstLineIconAlignment(icon);

  return (
    <NodeViewWrapper
      as="aside"
      data-type="callout"
      {...{ [CALLOUT_COLOR_ATTRIBUTE]: renderedColor }}
      {...{ [CALLOUT_ICON_ATTRIBUTE]: icon ?? "" }}
      className="page-callout"
    >
      {editor.isEditable ? (
        <EmojiPicker
          value={icon}
          onChange={(nextIcon) => updateAttributes({ icon: nextIcon })}
        >
          <button
            ref={iconRef as React.RefObject<HTMLButtonElement | null>}
            type="button"
            contentEditable={false}
            draggable={false}
            aria-label={icon ? t("changeIcon") : t("addIcon")}
            className="page-callout-icon page-callout-icon-button"
          >
            {icon ?? <SmilePlus aria-hidden className="size-4" />}
          </button>
        </EmojiPicker>
      ) : icon ? (
        <span
          ref={iconRef as React.RefObject<HTMLSpanElement | null>}
          className="page-callout-icon"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <NodeViewContent
        as="div"
        data-callout-content=""
        className="page-callout-content"
      />
    </NodeViewWrapper>
  );
}

export function calloutNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(CalloutView) as unknown as NodeViewRenderer;
}
