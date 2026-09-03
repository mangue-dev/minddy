"use client";

import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import type { ExtraProps } from "react-markdown";
import { cn } from "mangue-ui";
import {
  isVercelAgentReviewUrl,
  MARKDOWN_LINK_CLASS,
  markdownLinkIconUrl,
} from "@/lib/markdown-link";

type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps;

/** The common visual treatment for links rendered from Markdown. */
export function MarkdownLink({
  node: _node,
  href,
  className,
  style,
  ...props
}: MarkdownLinkProps) {
  const iconUrl = markdownLinkIconUrl(href);
  const iconStyle = iconUrl
    ? ({ "--markdown-link-icon": `url(${JSON.stringify(iconUrl)})` } as CSSProperties)
    : undefined;

  return (
    <a
      href={href}
      className={cn(MARKDOWN_LINK_CLASS, className)}
      style={{ ...style, ...iconStyle }}
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
      <a
        href={href}
        className={cn(
          "inline-flex min-h-8 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground no-underline shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        <svg
          aria-hidden="true"
          className="size-3.5 shrink-0"
          viewBox="0 0 24 21"
          fill="currentColor"
        >
          <path d="M12 0 24 21H0L12 0Z" />
        </svg>
        <span>Request Vercel Agent Review</span>
      </a>
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
