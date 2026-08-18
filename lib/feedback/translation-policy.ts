import {
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";

/**
 * Should this return be translated — the rule, pure, out of base and out of LLM.
 *
 * It is written here rather than in the prompt because a model to which we
 * asks “translate if necessary” translates too much: it returns a French version
 * of an already French text as soon as he sees three English words there. The model
 * therefore answers a factual question — what language is this text in — and
 * it is this file that decides what to do with it.
 */

/** A project's translation settings, as the review reads them. */
export interface FeedbackTranslationSettings {
  /** `feedback_translate_enabled` — the project switch. */
  enabled: boolean;
  /** The language of the team, the one into which we translate. */
  teamLanguage: FeedbackLanguage;
  /** Languages ​​that we read without help (`feedback_no_translate_languages`). */
  skipLanguages: readonly string[];
}

/**
 * Translate, yes or no, knowing the detected language.
 *
 * `sourceLanguage` null means “the journal did not know”: if in doubt, we do not
 * translate — a false translation costs more than an absent translation,
 * since the team will read it without knowing that it is false.
 */
export function shouldTranslateFeedback(
  settings: FeedbackTranslationSettings,
  sourceLanguage: string | null
): boolean {
  if (!settings.enabled) return false;
  const source = normalizeLanguage(sourceLanguage);
  if (!source) return false;
  // Translating into your own language makes no sense, and this is the case most
  // frequent: most feedback already arrives in the team's language.
  if (source === settings.teamLanguage) return false;
  return !settings.skipLanguages.some(
    (skipped) => normalizeLanguage(skipped) === source
  );
}

/**
 * The whitelist as it is ACTUALLY applied.
 *
 * The team language is automatically part of it — it does not have to be checked
 * not to be translated, and displaying it as a choice would lead you to believe
 * that you can request the opposite. The rest is normalized and deduplicated: two
 * ways of writing `pt` do not make two entries.
 */
export function effectiveSkipLanguages(
  settings: FeedbackTranslationSettings
): FeedbackLanguage[] {
  const skipped = new Set<FeedbackLanguage>([settings.teamLanguage]);
  for (const raw of settings.skipLanguages) {
    const code = normalizeLanguage(raw);
    if (code) skipped.add(code);
  }
  return [...skipped];
}
