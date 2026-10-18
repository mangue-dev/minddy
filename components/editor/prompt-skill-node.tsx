"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { SkillChip } from "@/components/assistant/skill-chip";
import { PROMPT_SKILL_NODE } from "@/lib/prompt-document";

interface PromptSkillStorage {
  /** Opens the preview of the skill at this path; set by the prompt editor
   when it can load one. */
  preview: ((path: string) => void) | null;
}

declare module "@tiptap/core" {
  interface Storage {
    promptSkill: PromptSkillStorage;
  }
}

function PromptSkillView({ node, editor }: NodeViewProps) {
  const path = String(node.attrs.path ?? "");
  const preview = editor.storage.promptSkill?.preview;
  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <SkillChip name={String(node.attrs.name ?? "")} onClick={preview ? () => preview(path) : undefined} />
    </NodeViewWrapper>
  );
}

/**
 * A repository skill in a routine instruction (MIN-728): the badge the former
 * field showed, written "/name" in the stored text (lib/prompt-document.ts).
 */
export const PromptSkillNode = Node.create<Record<string, never>, PromptSkillStorage>({
  name: PROMPT_SKILL_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addStorage() {
    return { preview: null };
  },

  addAttributes() {
    return {
      path: { default: "" },
      name: { default: "" },
      description: { default: "" },
    };
  },

  parseHTML() {
    return [{
      tag: "span[data-prompt-skill]",
      getAttrs: (element) => {
        const node = element as HTMLElement;
        return {
          path: node.dataset.skillPath ?? "",
          name: node.dataset.promptSkill ?? "",
          description: node.dataset.skillDescription ?? "",
        };
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, {
      "data-prompt-skill": node.attrs.name,
      "data-skill-path": node.attrs.path,
      "data-skill-description": node.attrs.description,
    }), `/${node.attrs.name}`];
  },

  renderText({ node }) {
    return `/${node.attrs.name}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(PromptSkillView);
  },
});
