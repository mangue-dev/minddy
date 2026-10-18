"use client";

import { useEditorEditable } from "@/components/editor/use-editor-editable";
import type { AnyExtension, NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
import { withCodeBlockNodeView } from "@/components/code-block-lowlight";
import {
  CODE_LANGUAGE_OPTIONS,
  codeBlockLowlight,
} from "@/components/code-block-full-language-catalog";
import { SearchSelect } from "@/components/search-select";
import {
  CodeBlockLanguageTrigger,
  CodeBlockSurface,
} from "@/components/code-block-surface";

/** A searchable language picker and copy control for live TipTap code blocks. */
export function CodeBlockView({ node, editor, updateAttributes }: NodeViewProps) {
  const editable = useEditorEditable(editor);
  const t = useTranslations("Common");
  const language = typeof node.attrs.language === "string" ? node.attrs.language : "";
  const selected = CODE_LANGUAGE_OPTIONS.find((option) => option.value === language);
  const languageLabel = selected?.label ?? (language || t("codePlainText"));

  return (
    <NodeViewWrapper as="div">
      <CodeBlockSurface
        code={node.textContent}
        languageControl={
          <SearchSelect
            value={language || null}
            onChange={(value) => updateAttributes({ language: value || null })}
            options={CODE_LANGUAGE_OPTIONS}
            searchPlaceholder={t("codeLanguageSearch")}
            emptyText={t("codeLanguageEmpty")}
            contentClassName="w-80 max-w-[calc(100vw-2rem)]"
            trigger={
              <CodeBlockLanguageTrigger
                label={languageLabel}
                disabled={!editable}
              />
            }
          />
        }
      >
        <NodeViewContent<"code"> as="code" />
      </CodeBlockSurface>
    </NodeViewWrapper>
  );
}

/**
 * Events in the block's header (language picker, wrap, copy, expand) are the
 * header's own. Tiptap keeps an event from ProseMirror only when it lands on
 * the `BUTTON` itself: a click on the label or the chevron inside it went to
 * ProseMirror, which moved the selection and focus into the code, and the
 * language menu, losing focus, closed as soon as it opened (MIN-728).
 */
export function stopCodeBlockChromeEvent({ event }: { event: Event }): boolean {
  const target = event.target as Element | null;
  if (!target || typeof target.closest !== "function") return false;
  if (event.type.startsWith("drag") || event.type === "drop") return false;
  return target.closest(".code-block-node-header") !== null;
}

export function codeBlockNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(CodeBlockView, {
    stopEvent: stopCodeBlockChromeEvent,
  }) as unknown as NodeViewRenderer;
}

export function codeBlockEditorExtension(): AnyExtension {
  return withCodeBlockNodeView(codeBlockNodeView(), codeBlockLowlight);
}
