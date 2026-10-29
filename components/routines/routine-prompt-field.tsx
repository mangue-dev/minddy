"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LayersIcon } from "@hugeicons/core-free-icons";

import { DictateButton } from "@/components/ai-elements/dictate-button";
import { MentionLinksProvider } from "@/components/mention-links";
import { DeferredDocumentEditor } from "@/components/editor/document-editor-lazy";
import type { PageSlashItem } from "@/components/pages/page-slash-command";
import { RoutineSkillCommand } from "@/components/routines/routine-skill-command";
import type { AssistantMention } from "@/lib/assistant-types";
import { promptFromMarkdown, promptToMarkdown } from "@/lib/prompt-document";
import type { RepositorySkillSummary } from "@/lib/repository-skills";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useMembersQuery } from "@/lib/use-members-query";
import { useRepositorySkills } from "@/lib/use-repository-skills";

/** Hard ceiling of an instruction, server side like here (`MAX_PROMPT_LENGTH`). */
const MAX_PROMPT_LENGTH = 20000;

/**
 * The INSTRUCTION field of a routine — the same at creation (`job` step of the
 * wizard) and on the routine's page. It is the shared document editor (ticket
 * descriptions, plans, pages): same blocks, same "/" menu, same "@" mentions.
 * The one addition is "$", which inserts a repository skill as the
 * `$name` token Numo reads. The instruction is still stored as text with
 * "@Label" tokens and their identities (lib/prompt-document.ts).
 *
 * In the wizard the field is framed, capped at about ten lines and carries
 * dictation (`pb-12` keeps its corner free). `bare` is the instruction written
 * in place on the routine's page: no frame, no cap, no microphone.
 */
export function RoutinePromptField({
  projectId,
  baseBranch,
  value,
  mentions = [],
  onChange,
  disabled,
  autoFocus,
  bare = false,
}: {
  projectId: string;
  baseBranch?: string | null;
  value: string;
  mentions?: AssistantMention[];
  onChange: (value: string, mentions: AssistantMention[]) => void;
  /** Read only (a creation under way, a reader of the routine). */
  disabled?: boolean;
  autoFocus?: boolean;
  /** Written in place on the routine's page: no frame, no cap, no dictation. */
  bare?: boolean;
}) {
  const t = useTranslations("Routines");
  const tPicker = useTranslations("Picker");
  const tPickerRef = useRef(tPicker);
  tPickerRef.current = tPicker;
  const { members } = useMembersQuery(projectId || null, !!projectId);
  const mentionSupport = useDescriptionMentions(projectId || null, members);
  const repositorySkills = useRepositorySkills(
    projectId || null,
    "cloud",
    "routine-prompt",
    baseBranch?.trim() || null,
  );
  const skillsRef = useRef<readonly RepositorySkillSummary[] | undefined>(repositorySkills.skills);
  skillsRef.current = repositorySkills.skills;
  // Built once (the editor's extensions must keep their identity); the skills
  // are read at each "$", so they can arrive after the editor.
  const extensions = useMemo(() => [RoutineSkillCommand.configure({
    items: (): PageSlashItem[] => (skillsRef.current ?? []).map((skill) => ({
      key: `skill:${skill.path}`,
      label: skill.name,
      icon: LayersIcon,
      keywords: [skill.description, skill.path],
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).insertContent(`$${skill.name} `).run();
      },
    })),
    placeholder: () => tPickerRef.current("typeToSearch"),
  })], []);

  // The editor owns its text: only a change from outside (dictation, a
  // rewrite saved elsewhere) remounts it with the new instruction.
  const markdown = useMemo(() => promptToMarkdown(value, mentions), [value, mentions]);
  const emitted = useRef(markdown);
  const [editorKey, setEditorKey] = useState(0);
  useEffect(() => {
    if (markdown === emitted.current) return;
    emitted.current = markdown;
    setEditorKey((key) => key + 1);
  }, [markdown]);

  const update = (text: string, resolvedMentions: AssistantMention[]) => {
    const nextText = text.slice(0, MAX_PROMPT_LENGTH);
    const nextMentions = text === nextText ? resolvedMentions : [];
    emitted.current = promptToMarkdown(nextText, nextMentions);
    onChange(nextText, nextMentions);
  };

  return (
    <MentionLinksProvider value={mentionSupport.links ?? null}>
      <div className="relative">
        <div
          className={bare
            ? "min-h-16"
            : "max-h-64 min-h-36 overflow-y-auto rounded-lg border border-input px-3 pt-2 pb-12 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"}
        >
          <DeferredDocumentEditor
            key={editorKey}
            value={markdown}
            mentions={mentionSupport}
            extensions={extensions}
            onChange={(next) => {
              const parsed = promptFromMarkdown(next, mentions);
              update(parsed.text, parsed.mentions);
            }}
            readOnly={disabled}
            autoFocus={autoFocus}
            ariaLabel={t("promptLabel")}
            className="text-sm"
          />
        </div>
        {/* Dictation appends to the existing instruction. */}
        {bare ? null : <DictateButton
          context="routine_instruction"
          floating
          disabled={disabled}
          // From outside the editor: the editor remounts with the new text.
          onTranscription={(text) =>
            onChange((value.trim() ? `${value.trim()} ${text}` : text).slice(0, MAX_PROMPT_LENGTH), mentions)
          }
        />}
      </div>
    </MentionLinksProvider>
  );
}
