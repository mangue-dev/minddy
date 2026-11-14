"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AiInstructionProposalCard } from "@/components/ai-instruction-proposal-card";
import { AutoTextarea } from "@/components/auto-textarea";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  AI_INSTRUCTION_MAX_LENGTH,
  AI_INSTRUCTION_USE_CASES,
  normalizeAiLanguage,
  sameAiInstructions,
  type AiInstructions,
  type AiInstructionUseCase,
} from "@/lib/ai-instructions";
import { aiInstructionsKey, fetchProjectAiInstructionsApi } from "@/lib/ai-instructions-api";
import { FEEDBACK_LANGUAGES, languageLabel } from "@/lib/feedback/languages";
import { useProjects } from "@/lib/projects-context";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { Project } from "@/lib/types";

/** The select value of "no working language": Smart Fill follows each text. */
const FOLLOW_TEXT = "auto";

const FIELDS = {
  title: { label: "aiInstructionTitleLabel", example: "aiInstructionTitleExample", automation: "Smart Fill" },
  properties: { label: "aiInstructionPropertiesLabel", example: "aiInstructionPropertiesExample", automation: "Smart Fill" },
  objectives: { label: "aiInstructionObjectivesLabel", example: "aiInstructionObjectivesExample", automation: "Smart Fill" },
  assign: { label: "aiInstructionAssignLabel", example: "aiInstructionAssignExample", automation: "Smart Assign" },
} as const satisfies Record<AiInstructionUseCase, { label: string; example: string; automation: string }>;

const trimmed = (draft: AiInstructions): AiInstructions =>
  Object.fromEntries(AI_INSTRUCTION_USE_CASES.flatMap((useCase) => {
    const text = (draft[useCase] ?? "").trim();
    return text ? [[useCase, text]] : [];
  }));

/**
 * Project-level AI instructions (MIN-988): the working language Smart Fill
 * writes in, and optional instructions that adapt Smart Fill and Smart
 * Assign to the way one team works. Owner-only; members read them, since
 * they explain what the automations do with their issues.
 *
 * Nothing here is required: both automations work without any instruction,
 * so the tab opens on the language and a "New instruction" menu, not on four
 * empty fields that would read as a setup to complete. An instruction shows
 * only once it exists or was just added, and each can be removed.
 *
 * The language saves on change, like every select of the settings. The
 * instructions are a form with one Save: adding, editing and removing are
 * written together, and nothing is removed before that Save.
 *
 * When minddy drafted an instruction from repeated corrections, its proposal
 * sits above the instructions until the owner answers it.
 */
export function AiInstructionsSection({ project, isOwner }: { project: Project; isOwner: boolean }) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const { updateProject } = useProjects();
  const queryClient = useQueryClient();
  const queryKey = aiInstructionsKey(project.id);
  const { data, isError } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchProjectAiInstructionsApi(project.id, signal),
  });

  const savedLanguage = normalizeAiLanguage(project.ai_language) ?? FOLLOW_TEXT;
  const [language, setLanguage] = useState<string>(savedLanguage);
  const [savingLanguage, setSavingLanguage] = useState(false);
  useEffect(() => {
    setLanguage(savedLanguage);
  }, [savedLanguage]);

  const changeLanguage = async (next: string) => {
    if (!isOwner || savingLanguage || next === language) return;
    const previous = language;
    setLanguage(next);
    setSavingLanguage(true);
    try {
      await updateProject(project.id, { ai_language: next === FOLLOW_TEXT ? null : next });
    } catch (e) {
      setLanguage(previous);
      toast.error((e as Error).message);
    } finally {
      setSavingLanguage(false);
    }
  };

  const saved = data?.instructions;
  const [draft, setDraft] = useState<AiInstructions>({});
  const [saving, setSaving] = useState(false);
  // A refetch brings a new saved map (an accepted proposal, Numo, another
  // tab): adopt it only when the draft holds no unsaved edit.
  const synced = useRef<AiInstructions>({});
  useEffect(() => {
    if (!saved) return;
    const previous = synced.current;
    synced.current = saved;
    setDraft((current) =>
      sameAiInstructions(trimmed(current), previous) || sameAiInstructions(trimmed(current), saved)
        ? saved
        : current
    );
  }, [saved]);

  // The use cases shown: those with a saved or drafted text, and those the
  // owner just added from the menu, in the settings' fixed order.
  const [opened, setOpened] = useState<ReadonlySet<AiInstructionUseCase>>(new Set());
  const [focusNext, setFocusNext] = useState<AiInstructionUseCase | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<AiInstructionUseCase>>(new Set());
  const shown = AI_INSTRUCTION_USE_CASES.filter(
    (useCase) => !removed.has(useCase) && (opened.has(useCase) || !!saved?.[useCase] || !!draft[useCase])
  );
  const addable = AI_INSTRUCTION_USE_CASES.filter((useCase) => !shown.includes(useCase));
  useEffect(() => {
    if (!focusNext) return;
    document.getElementById(`ai-instruction-${focusNext}`)?.focus();
    setFocusNext(null);
  }, [focusNext]);

  const without = (set: ReadonlySet<AiInstructionUseCase>, useCase: AiInstructionUseCase) => {
    const next = new Set(set);
    next.delete(useCase);
    return next;
  };
  const add = (useCase: AiInstructionUseCase) => {
    setRemoved((current) => without(current, useCase));
    setOpened((current) => new Set(current).add(useCase));
    setFocusNext(useCase);
  };
  // Leaves the form only: the saved instruction goes at the next Save.
  const remove = (useCase: AiInstructionUseCase) => {
    setOpened((current) => without(current, useCase));
    setRemoved((current) => new Set(current).add(useCase));
    setDraft((current) => ({ ...current, [useCase]: "" }));
  };

  const dirty = !!saved && !sameAiInstructions(trimmed(draft), saved);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saved) return;
    setSaving(true);
    try {
      // Every use case travels, so an emptied field removes its instruction.
      const next = trimmed(draft);
      await updateProject(project.id, {
        ai_instructions: Object.fromEntries(
          AI_INSTRUCTION_USE_CASES.map((useCase) => [useCase, next[useCase] ?? ""])
        ),
      });
      queryClient.setQueryData(queryKey, { instructions: next, proposal: data?.proposal ?? null });
      setOpened(new Set());
      setRemoved(new Set());
      toast.success(t("aiInstructionsSaved"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectAiInstructions}
        title={t("aiInstructionsTab")}
        help={t("aiInstructionsHelp")}
        footer={
          isOwner && (shown.length > 0 || dirty) ? (
            <Button type="submit" disabled={saving || !dirty}>
              {saving && <Spinner />}
              {tc("save")}
            </Button>
          ) : undefined
        }
      >
        <SettingsRow
          htmlFor="ai-language"
          label={t("aiLanguageLabel")}
          hint={t("aiLanguageHint")}
          control={
            <Select
              value={language}
              onValueChange={(next) => void changeLanguage(next)}
              disabled={!isOwner || savingLanguage}
            >
              <SelectTrigger id="ai-language" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FOLLOW_TEXT}>{t("aiLanguageAuto")}</SelectItem>
                {FEEDBACK_LANGUAGES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {languageLabel(code, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {isOwner && data?.proposal && (
          <SettingsRow orientation="vertical" label={t("aiProposalRowLabel")}>
            <AiInstructionProposalCard key={data.proposal.id} proposal={data.proposal} />
          </SettingsRow>
        )}

        {isError && (
          <SettingsRow
            orientation="vertical"
            label={<span className="text-sm font-normal text-destructive">{t("aiInstructionsLoadError")}</span>}
          />
        )}

        {saved && (isOwner || shown.length > 0) && (
          <SettingsRow
            label={t("aiInstructionsRowLabel")}
            hint={t("aiInstructionsRowHint")}
            control={
              isOwner && addable.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      <HugeiconsIcon icon={Add01Icon} className="size-4" aria-hidden />
                      {t("aiInstructionNew")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {addable.map((useCase) => (
                      <DropdownMenuItem key={useCase} onSelect={() => add(useCase)}>
                        {t(FIELDS[useCase].label)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          />
        )}

        {saved &&
          shown.map((useCase) => {
            const id = `ai-instruction-${useCase}`;
            const value = draft[useCase] ?? "";
            return (
              <SettingsRow
                key={useCase}
                orientation="vertical"
                htmlFor={id}
                label={
                  <>
                    <span>{t(FIELDS[useCase].label)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      {/* The count shows once the text nears the limit it will hit. */}
                      {value.length >= AI_INSTRUCTION_MAX_LENGTH * 0.8 && (
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">
                          {value.length}/{AI_INSTRUCTION_MAX_LENGTH}
                        </span>
                      )}
                      {isOwner && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("aiInstructionRemove")}
                          onClick={() => remove(useCase)}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} className="size-4" aria-hidden />
                        </Button>
                      )}
                    </span>
                  </>
                }
                hint={t(FIELDS[useCase].example)}
                control={
                  <AutoTextarea
                    id={id}
                    value={value}
                    onChange={(e) => setDraft((current) => ({ ...current, [useCase]: e.target.value }))}
                    placeholder={t("aiInstructionPlaceholder", { automation: FIELDS[useCase].automation })}
                    maxLength={AI_INSTRUCTION_MAX_LENGTH}
                    disabled={!isOwner}
                    className="min-h-9 w-full rounded-lg bg-control px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-control-hover disabled:opacity-60"
                  />
                }
              />
            );
          })}
      </SettingsGroup>
    </form>
  );
}
