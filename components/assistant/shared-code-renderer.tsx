"use client";

import { createElement, type ComponentProps, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import {
  CodeBlockLanguageLabel,
  CodeBlockSurface,
} from "@/components/code-block-surface";
import {
  CODE_LANGUAGE_OPTIONS,
  codeBlockLowlight,
} from "@/components/code-block-language-catalog";

type StreamdownCodeProps = ComponentProps<"code"> & {
  node?: unknown;
  "data-block"?: string | boolean;
};

type HighlightNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string | string[] };
  children?: HighlightNode[];
};

function highlightedNode(node: HighlightNode, key: number): ReactNode {
  if (node.type === "text") return node.value ?? "";
  if (node.type !== "element") return null;
  const className = Array.isArray(node.properties?.className)
    ? node.properties.className.join(" ")
    : node.properties?.className;
  return createElement(
    "span",
    { className, key },
    node.children?.map(highlightedNode),
  );
}

function highlightedCode(code: string, language: string | undefined): ReactNode {
  if (!language || !codeBlockLowlight.registered(language)) return code;
  try {
    return (codeBlockLowlight.highlight(language, code).children as HighlightNode[]).map(
      highlightedNode,
    );
  } catch {
    return code;
  }
}

/** Streamdown marks fenced code by cloning its child with `data-block`.
 * Replacing that child lets Agent responses use the Page code-block surface
 * without changing Streamdown's tables, links, incomplete-Markdown handling,
 * or inline code. */
export function PageCodeRenderer({
  children,
  className,
  node: _node,
  "data-block": dataBlock,
  ...props
}: StreamdownCodeProps) {
  const t = useTranslations("Common");
  if (dataBlock !== undefined) {
    const language = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
    const code = Array.isArray(children)
      ? children.map((child) => (typeof child === "string" ? child : "")).join("")
      : typeof children === "string"
        ? children
        : "";
    const selected = CODE_LANGUAGE_OPTIONS.find((option) => option.value === language);
    const languageLabel = selected?.label ?? (language || t("codePlainText"));
    return (
      <CodeBlockSurface
        code={code}
        className="w-full"
        languageControl={<CodeBlockLanguageLabel label={languageLabel} />}
      >
        <code className={language ? `language-${language}` : undefined}>
          {highlightedCode(code, language)}
        </code>
      </CodeBlockSurface>
    );
  }

  return (
    <code
      className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}
      {...props}
    >
      {children}
    </code>
  );
}

export const PAGE_CODE_COMPONENTS = { code: PageCodeRenderer };
