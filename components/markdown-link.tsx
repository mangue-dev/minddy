"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";
import type { ExtraProps } from "react-markdown";
import { cn } from "@/lib/utils";
import { isPlainNavigationClick } from "@/components/editor-node-link";
import { pageLinkTarget } from "@/lib/page-link";
import { useOptionalPagePanelActions } from "@/lib/page-panel-context";
import {
  isVercelAgentReviewUrl,
  MARKDOWN_LINK_CLASS,
  markdownLinkIconUrl,
} from "@/lib/markdown-link";

type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps;

function VercelAgentReviewLink({
  href,
  className,
  children,
  tabIndex,
  ...props
}: Omit<MarkdownLinkProps, "node">) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">(
    "loading",
  );

  useEffect(() => {
    const image = anchorRef.current?.querySelector("img");
    if (!image) {
      setImageState("failed");
    } else if (image.complete) {
      setImageState(image.naturalWidth > 0 ? "loaded" : "failed");
    }
  }, [href]);

  if (imageState === "failed") return null;

  return (
    <a
      {...props}
      ref={anchorRef}
      href={href}
      aria-hidden={imageState === "loaded" ? undefined : true}
      tabIndex={imageState === "loaded" ? tabIndex : -1}
      className={cn(
        "inline-block no-underline",
        imageState !== "loaded" && "invisible pointer-events-none",
        className,
      )}
      onLoadCapture={(event) => {
        if (event.target instanceof HTMLImageElement) setImageState("loaded");
      }}
      onErrorCapture={(event) => {
        if (event.target instanceof HTMLImageElement) setImageState("failed");
      }}
    >
      {children}
    </a>
  );
}

/**
 * The common visual treatment for links rendered from Markdown. A link to a
 * page of the app (a comment, a Numo answer) opens it in the page panel on a
 * plain click (MIN-777); a modified click keeps the browser's behavior.
 */
export function MarkdownLink({
  node: _node,
  href,
  className,
  style,
  onClick,
  ...props
}: MarkdownLinkProps) {
  const pagePanel = useOptionalPagePanelActions();
  const iconUrl = markdownLinkIconUrl(href);
  const iconStyle = iconUrl
    ? ({ "--markdown-link-icon": `url(${JSON.stringify(iconUrl)})` } as CSSProperties)
    : undefined;

  return (
    <a
      href={href}
      className={cn(MARKDOWN_LINK_CLASS, className)}
      style={{ ...style, ...iconStyle }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !pagePanel || !isPlainNavigationClick(event)) return;
        const page = pageLinkTarget(href, window.location.origin);
        if (!page) return;
        event.preventDefault();
        pagePanel.openPage(page.projectId, page.pageId);
      }}
      {...props}
    />
  );
}

/** Standard text link for surfaces that must preserve forge-authored layouts. */
export function PlainMarkdownLink({
  node: _node,
  href,
  className,
  children,
  ...props
}: MarkdownLinkProps) {
  if (isVercelAgentReviewUrl(href)) {
    return (
      <VercelAgentReviewLink
        href={href}
        className={className}
        {...props}
      >
        {children}
      </VercelAgentReviewLink>
    );
  }

  return (
    <a
      href={href}
      className={cn("text-primary underline underline-offset-2", className)}
      {...props}
    >
      {children}
    </a>
  );
}

export const MARKDOWN_LINK_COMPONENTS = { a: MarkdownLink };
