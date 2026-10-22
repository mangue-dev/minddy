"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SettingsEmpty, SettingsGroup, SettingsListRow } from "@/components/settings/settings-ui";
import { useAccountPreference } from "@/components/settings/use-account-preference";
import {
  DICTATION_VOCABULARY_META_KEY,
  MAX_VOCABULARY_ENTRIES,
  MAX_VOCABULARY_TERM_CHARS,
  normalizeVocabularyTerm,
  resolveDictationVocabulary,
  sanitizeVocabulary,
  type VocabularyEntry,
} from "@/lib/dictation-vocabulary";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Account → Preferences → Vocabulary (MIN-773): the words dictation should
 * spell the user's way. A term alone teaches the spelling; a term with what it
 * is "heard as" also replaces that word in every dictation. Stored with the
 * other dictation preferences (see lib/dictation-vocabulary.ts for the caps).
 */
export function DictationVocabularySection() {
  const t = useTranslations("Account");
  const tc = useTranslations("Common");
  const [vocabulary, setVocabulary, ready] = useAccountPreference<VocabularyEntry[]>(
    DICTATION_VOCABULARY_META_KEY,
    resolveDictationVocabulary,
  );
  const [term, setTerm] = useState("");
  const [heardAs, setHeardAs] = useState("");
  const [toRemove, setToRemove] = useState<VocabularyEntry | null>(null);

  const full = vocabulary.length >= MAX_VOCABULARY_ENTRIES;
  const canAdd = ready && !full && !!normalizeVocabularyTerm(term);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!canAdd) return;
    const next = sanitizeVocabulary([...vocabulary, { term, heardAs }]);
    if (next.length === vocabulary.length) {
      // Already in the list: nothing to save, clear the fields all the same.
      setTerm("");
      setHeardAs("");
      return;
    }
    void setVocabulary(next);
    setTerm("");
    setHeardAs("");
  };

  const remove = async () => {
    if (!toRemove) return;
    await setVocabulary(vocabulary.filter((entry) => entry !== toRemove));
  };

  return (
    <>
      <SettingsGroup
        anchor={SETTINGS_SECTIONS.accountDictationVocabulary}
        title={t("vocabularyTitle")}
        help={t("vocabularyHelp")}
      >
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 py-3.5">
          <Input
            aria-label={t("vocabularyHeardAsLabel")}
            placeholder={t("vocabularyHeardAsPlaceholder")}
            value={heardAs}
            maxLength={MAX_VOCABULARY_TERM_CHARS}
            onChange={(event) => setHeardAs(event.target.value)}
            disabled={!ready || full}
            className="min-w-0 flex-1 basis-40"
          />
          <HugeiconsIcon icon={ArrowRight02Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            aria-label={t("vocabularyTermLabel")}
            placeholder={t("vocabularyTermPlaceholder")}
            value={term}
            maxLength={MAX_VOCABULARY_TERM_CHARS}
            onChange={(event) => setTerm(event.target.value)}
            disabled={!ready || full}
            className="min-w-0 flex-1 basis-40"
          />
          <Button type="submit" variant="outline" disabled={!canAdd}>
            {t("vocabularyAdd")}
          </Button>
        </form>
        {vocabulary.length === 0 ? (
          <SettingsEmpty>{t("vocabularyEmpty")}</SettingsEmpty>
        ) : (
          vocabulary.map((entry) => (
            <SettingsListRow
              key={`${entry.term}\u0000${entry.heardAs ?? ""}`}
              title={entry.term}
              subtitle={
                entry.heardAs
                  ? t("vocabularyReplaces", { heardAs: entry.heardAs })
                  : t("vocabularySpelling")
              }
              action={
                <IconButton
                  size="sm"
                  aria-label={t("vocabularyRemove", { term: entry.term })}
                  onClick={() => setToRemove(entry)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </IconButton>
              }
            />
          ))
        )}
        {full && (
          <SettingsEmpty>{t("vocabularyFull", { max: MAX_VOCABULARY_ENTRIES })}</SettingsEmpty>
        )}
      </SettingsGroup>

      <ConfirmDeleteDialog
        open={!!toRemove}
        onOpenChange={(open) => !open && setToRemove(null)}
        title={t("vocabularyRemoveTitle", { term: toRemove?.term ?? "" })}
        description={t("vocabularyRemoveDescription")}
        confirmLabel={t("vocabularyRemoveConfirm")}
        cancelLabel={tc("cancel")}
        onConfirm={remove}
      />
    </>
  );
}
