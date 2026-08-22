"use client";

import { useEffect, useRef, useState } from "react";
import type { AnyExtension, NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Check, Code2, Copy, ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton, cn } from "mangue-ui";
import { withCodeBlockNodeView } from "@/components/code-block-lowlight";
import {
  CODE_LANGUAGE_OPTIONS,
  codeBlockLowlight,
} from "@/components/code-block-language-catalog";
import { SearchSelect } from "@/components/search-select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COPY_RESET_MS = 2000;

/** A searchable language picker and copy control for live TipTap code blocks. */
export function CodeBlockView({ node, editor, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Common");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const selected = CODE_LANGUAGE_OPTIONS.find((option) => option.value === language);
  const languageLabel = selected?.label ?? (language || t("codePlainText"));

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // Clipboard access can be unavailable in a non-secure or restricted context.
    }
  };

  return (
    <NodeViewWrapper as="div" className="code-block-node-view">
      <div className="code-block-node-header" contentEditable={false}>
        <SearchSelect
          value={language || null}
          onChange={(value) => updateAttributes({ language: value || null })}
          options={CODE_LANGUAGE_OPTIONS}
          searchPlaceholder={t("codeLanguageSearch")}
          emptyText={t("codeLanguageEmpty")}
          contentClassName="w-80 max-w-[calc(100vw-2rem)]"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!editor.isEditable}
              aria-label={t("codeLanguage")}
              className="code-block-node-language-trigger"
            >
              <Code2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{languageLabel}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          }
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              size="sm"
              className={cn("code-block-node-copy", copied && "text-primary")}
              aria-label={copied ? t("copied") : t("copy")}
              data-copied={copied ? "true" : "false"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void copy()}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>{copied ? t("copied") : t("copy")}</TooltipContent>
        </Tooltip>
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export function codeBlockNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(CodeBlockView) as unknown as NodeViewRenderer;
}

export function codeBlockEditorExtension(): AnyExtension {
  return withCodeBlockNodeView(codeBlockNodeView(), codeBlockLowlight);
}
