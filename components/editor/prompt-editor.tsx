"use client";

import { LayersIcon as Layers } from "@hugeicons/core-free-icons";
import type { Editor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SkillPreviewDialog } from "@/components/assistant/skill-preview-dialog";
import { onEditorDom } from "@/components/editor/editor-dom";
import { PromptSkillNode } from "@/components/editor/prompt-skill-node";
import { RichEditor, type RichEditorMentions } from "@/components/editor/rich-editor";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { PageSlashItem } from "@/components/pages/page-slash-command";
import type { AssistantMention } from "@/lib/assistant-types";
import {
  PROMPT_SKILL_NODE,
  promptFromDocument,
  promptToDocument,
  skillNode,
} from "@/lib/prompt-document";
import {
  MAX_SELECTED_SKILLS,
  type RepositorySkill,
  type RepositorySkillSummary,
} from "@/lib/repository-skills";

/** Text pieces stay text: only a mention picked from the menu, or one the
 instruction saved with its id, becomes a pill (lib/prompt-document.ts). */
const keepText = (text: string) => [{ type: "text" as const, text }];

function skillCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === PROMPT_SKILL_NODE) count += 1;
  });
  return count;
}

/**
 * An agent instruction in the shared editor (MIN-728): the routine prompt.
 *
 * The same engine, mention menu, pills and selection behavior as every other
 * text surface, on a paragraph-only catalog. What it stores is unchanged from
 * the former field: plain text where "@Label" is a mention and "/name" a
 * repository skill, plus the identity of each mention with its occurrence.
 * "/" offers the repository's skills; a badge opens its preview.
 */
export function PromptEditor({
  value,
  mentions: savedMentions,
  onChange,
  mentionSources,
  skills,
  loadSkill,
  placeholder,
  ariaLabel,
  disabled = false,
  autoFocus,
  className,
  contentClassName,
}: {
  value: string;
  /** The saved identities of the mentions in `value`. */
  mentions: readonly AssistantMention[];
  onChange: (text: string, mentions: AssistantMention[]) => void;
  mentionSources: DocumentEditorMentions;
  /** Repository skills offered after "/"; `undefined` while they load. */
  skills?: readonly RepositorySkillSummary[];
  loadSkill?: (skill: RepositorySkillSummary) => Promise<RepositorySkill | null>;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [initial] = useState<JSONContent>(() =>
    promptToDocument(value, { mentions: savedMentions, skills }));
  const [previewSkill, setPreviewSkill] = useState<RepositorySkillSummary | null>(null);

  // What this editor last reported: a `value` equal to it is our own echo,
  // anything else is an external write (dictation, a reset).
  const emitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sourcesRef = useRef(mentionSources);
  sourcesRef.current = mentionSources;
  const skillsRef = useRef(skills);
  skillsRef.current = skills;
  const savedRef = useRef(savedMentions);
  savedRef.current = savedMentions;

  const engineMentions = useMemo<RichEditorMentions>(() => ({
    items: () => sourcesRef.current.options,
    onQuery: () => sourcesRef.current.onQuery?.(),
    scan: keepText,
  }), []);

  const handleChange = useCallback((content: JSONContent) => {
    const { text, mentions } = promptFromDocument(content);
    if (text === emitted.current) return;
    emitted.current = text;
    onChangeRef.current(text, mentions);
  }, []);

  // "/" lists the skills; one already in the instruction is not offered
  // twice, and the instruction holds at most MAX_SELECTED_SKILLS.
  const slashActions = useMemo<PageSlashItem[] | undefined>(() => skills?.map((skill) => ({
    key: `skill:${skill.path}`,
    label: skill.name,
    icon: Layers,
    keywords: [skill.description, skill.path],
    run: (target, range) => {
      let present = false;
      target.state.doc.descendants((node) => {
        if (node.type.name === PROMPT_SKILL_NODE && node.attrs.path === skill.path) present = true;
      });
      const chain = target.chain().focus().deleteRange(range);
      if (present || skillCount(target) >= MAX_SELECTED_SKILLS) {
        chain.run();
        return;
      }
      chain.insertContent([skillNode(skill), { type: "text", text: " " }]).run();
    },
  })), [skills]);

  const extensions = useMemo(() => [PromptSkillNode], []);

  // A badge opens its preview when the skill can be loaded.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.storage.promptSkill.preview = loadSkill
      ? (path) => {
          const skill = skillsRef.current?.find((candidate) => candidate.path === path);
          if (skill) setPreviewSkill(skill);
        }
      : null;
  }, [editor, loadSkill]);

  // An external write replaces the content; so does the arrival of the
  // skills, which turns their "/name" text into badges — but never under
  // the caret of someone typing.
  const lastSkills = useRef(skills);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const external = value !== emitted.current;
    const skillsArrived = lastSkills.current !== skills;
    if (!external && !(skillsArrived && !editor.isFocused)) return;
    lastSkills.current = skills;
    emitted.current = value;
    editor.commands.setContent(
      promptToDocument(value, { mentions: savedRef.current, skills }),
      { emitUpdate: false });
    if (editor.isFocused) editor.commands.focus("end");
  }, [editor, value, skills]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !ariaLabel) return;
    return onEditorDom(editor, (dom) => {
      dom.setAttribute("aria-label", ariaLabel);
    });
  }, [editor, ariaLabel]);

  return (
    <div
      className={cn("relative cursor-text", className)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && editor && !editor.isDestroyed) editor.commands.focus("end");
      }}
    >
      <RichEditor
        initialContent={initial}
        onChange={handleChange}
        onEditor={setEditor}
        blocks="prompt"
        blockChrome={false}
        size="compact"
        mentions={engineMentions}
        mentionLinks={mentionSources.links ?? null}
        editable={!disabled}
        placeholder={placeholder}
        slashActions={slashActions}
        extensions={extensions}
        autoFocus={autoFocus}
        immediateRender
        contentClassName={contentClassName}
      />
      {loadSkill ? (
        <SkillPreviewDialog
          skill={previewSkill}
          open={previewSkill !== null}
          onOpenChange={(next) => {
            if (!next) setPreviewSkill(null);
          }}
          loadSkill={loadSkill}
        />
      ) : null}
    </div>
  );
}
