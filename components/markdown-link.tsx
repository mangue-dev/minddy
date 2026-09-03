"use client";

import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import type { ExtraProps } from "react-markdown";
import { cn } from "mangue-ui";
import {
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
  className,
  ...props
}: MarkdownLinkProps) {
  return (
    <a
      className={cn("text-primary underline underline-offset-2", className)}
      {...props}
    />
  );
}

export const MARKDOWN_LINK_COMPONENTS = { a: MarkdownLink };
