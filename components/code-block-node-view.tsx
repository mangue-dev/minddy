"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AnyExtension, NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ChevronsUpDown,
  WrapText,
} from "lucide-react";
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
const COLLAPSED_CODE_HEIGHT_PX = 460;

/** A searchable language picker and copy control for live TipTap code blocks. */
export function CodeBlockView({ node, editor, updateAttributes }: NodeViewProps) {
  const t = useTranslations("Common");
  const tAssistant = useTranslations("Assistant");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [wrapped, setWrapped] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pre = useRef<HTMLPreElement | null>(null);
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const selected = CODE_LANGUAGE_OPTIONS.find((option) => option.value === language);
  const languageLabel = selected?.label ?? (language || t("codePlainText"));

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const element = pre.current;
    if (!element) return;

    const measure = () => {
      const next = element.scrollHeight > COLLAPSED_CODE_HEIGHT_PX;
      setOverflows(next);
      if (!next) setExpanded(false);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [node.textContent, wrapped]);

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
    <NodeViewWrapper
      as="div"
      className="code-block-node-view"
      data-expanded={expanded ? "true" : "false"}
      data-overflowing={overflows ? "true" : "false"}
      data-wrapped={wrapped ? "true" : "false"}
    >
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
              <span className="truncate">{languageLabel}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </Button>
          }
        />
        <div className="code-block-node-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                size="sm"
                className="code-block-node-wrap"
                aria-label={t("codeWrap")}
                aria-pressed={wrapped}
                data-active={wrapped ? "true" : "false"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setWrapped((current) => !current)}
              >
                <WrapText className="size-4" />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>{t("codeWrap")}</TooltipContent>
          </Tooltip>
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
      </div>
      <pre ref={pre}>
        <NodeViewContent<"code"> as="code" />
      </pre>
      {overflows && (
        <div className="code-block-node-expand" contentEditable={false}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            {expanded ? tAssistant("collapse") : tAssistant("expand")}
          </Button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export function codeBlockNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(CodeBlockView) as unknown as NodeViewRenderer;
}

export function codeBlockEditorExtension(): AnyExtension {
  return withCodeBlockNodeView(codeBlockNodeView(), codeBlockLowlight);
}
