"use client";

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
} from "@/components/code-block-language-catalog";
import { SearchSelect } from "@/components/search-select";
import {
  CodeBlockLanguageTrigger,
  CodeBlockSurface,
} from "@/components/code-block-surface";

/** A searchable language picker and copy control for live TipTap code blocks. */
export function CodeBlockView({ node, editor, updateAttributes }: NodeViewProps) {
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
                disabled={!editor.isEditable}
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

export function codeBlockNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(CodeBlockView) as unknown as NodeViewRenderer;
}

export function codeBlockEditorExtension(): AnyExtension {
  return withCodeBlockNodeView(codeBlockNodeView(), codeBlockLowlight);
}
