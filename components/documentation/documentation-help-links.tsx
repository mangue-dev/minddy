"use client";

import { useMemo, type ComponentPropsWithoutRef } from "react";
import { defaultRehypePlugins } from "streamdown";
import type { Element, Root, RootContent } from "hast";
import Link from "next/link";
import type { DocumentationArticle } from "@/lib/documentation";
import type { Locale } from "@/i18n/config";
import { resolveDocumentationPath } from "@/lib/documentation-core.mjs";
import { resolveDocumentationHelpLink } from "@/lib/documentation-help-links";
import { MarkdownLink } from "@/components/markdown-link";
import { MessageResponse, type MessageResponseProps } from "@/components/ai-elements/message";
import { DocumentationIcon } from "./documentation-icon";

type Sections = DocumentationArticle["sections"];

export function DocumentationHelpResponse({ appUrl, articleId, locale, sections, references = true, ...props }: {
  appUrl: string; articleId: string | null; locale: Locale; sections: Sections; references?: boolean;
} & Pick<MessageResponseProps, "children" | "isAnimating" | "mode">) {
  const components = useMemo(() => documentationHelpLinkComponents(appUrl, articleId, locale, sections), [appUrl, articleId, locale, sections]);
  const plugins = useMemo<MessageResponseProps["rehypePlugins"]>(() => [...Object.values(defaultRehypePlugins), [rehypeDocumentationSectionReferences, sections]], [sections]);
  // Streamdown's memo comparison ignores renderer and plugin changes. Remount
  // the response when its guide context changes, keeping the conversation intact.
  const contextKey = JSON.stringify([appUrl, articleId, locale, sections, references]);
  return <MessageResponse key={contextKey} components={components} rehypePlugins={references ? plugins : undefined} {...props} />;
}

/** Enrich known section markers in prose, preserving code and existing links. */
export function rehypeDocumentationSectionReferences(sections: Sections) {
  const titles = new Map(sections.map(section => [section.id, section.title]));
  return (tree: Root) => {
    function visit(parent: Root | Element) {
      if (parent.type === "element" && ["a", "code", "pre"].includes(parent.tagName)) return;
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === "element") visit(child);
        if (child.type !== "text") return [child];
        const parts: RootContent[] = [];
        let start = 0;
        for (const match of child.value.matchAll(/\{#([a-z0-9-]+)\}/g)) {
          const title = titles.get(match[1]);
          if (!title) continue;
          if (match.index > start) parts.push({ type: "text", value: child.value.slice(start, match.index) });
          parts.push({ type: "element", tagName: "a", properties: { href: `#${match[1]}` }, children: [{ type: "text", value: title }] });
          start = match.index + match[0].length;
        }
        if (!parts.length) return [child];
        if (start < child.value.length) parts.push({ type: "text", value: child.value.slice(start) });
        return parts;
      }) as typeof parent.children;
    }
    visit(tree);
  };
}

export function documentationHelpLinkComponents(appUrl: string, articleId: string | null, locale: Locale, sections: Sections) {
  function HelpLink({ href, children, node: _node, ...props }: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
    const guide = href ? resolveDocumentationHelpLink(href, appUrl) : null;
    const target = guide ? new URL(guide.href, appUrl) : undefined;
    const fragment = href?.startsWith("#") ? href : guide?.articleId === articleId && target && resolveDocumentationPath(target.pathname)?.locale === locale ? target.hash : undefined;
    const section = fragment ? sections.find(section => `#${section.id}` === fragment) : undefined;
    if (section) return <a {...props} href={fragment} target="_self" className="markdown-link" data-documentation-citation>
      <span aria-hidden className="mr-1">#</span>{section.title}
    </a>;
    if (guide) return <Link {...props} href={guide.href} target="_self" className="markdown-link" data-documentation-citation>
      <DocumentationIcon articleId={guide.articleId} className="mr-1 inline size-[0.9em] align-[-0.08em]" />{children}
    </Link>;
    return <MarkdownLink href={href} {...props}>{children}</MarkdownLink>;
  }
  return { a: HelpLink };
}
