import {
  languageNameByLocale,
  supportedLocaleForTag,
  type Locale,
} from "@/i18n/config";

const ISSUE_TERM: Record<Locale, string> = {
  en: '"issue"',
  fr: "« ticket »",
  de: "„Ticket“",
  "pt-BR": '"tarefa"',
  it: '"ticket"',
  es: '"incidencia"',
};

const WRITING_GUIDANCE: Record<Locale, string> = {
  en: "Use idiomatic English.",
  fr: "Use idiomatic French with all accents and diacritics.",
  de: "Use idiomatic German with correct capitalization and umlauts.",
  "pt-BR":
    "Use idiomatic Brazilian Portuguese with all accents and diacritics.",
  it: "Use idiomatic Italian with all accents and diacritics.",
  es: "Use idiomatic Spanish with all accents and diacritics.",
};

/** Resolve stored or browser locale values to a supported application locale. */
export function resolveApplicationLocale(
  locale: string | null | undefined,
): Locale {
  return supportedLocaleForTag(locale) ?? "en";
}

/** Human-readable language guidance for prompts that produce user-facing copy. */
export function responseLanguageInstruction(
  locale: string | null | undefined,
  options: { mentionIssueTerm?: boolean } = {},
): string {
  const resolved = resolveApplicationLocale(locale);
  const issueTerm = options.mentionIssueTerm
    ? ` The product term for an issue is ${ISSUE_TERM[resolved]}.`
    : "";
  return `${languageNameByLocale[resolved]}. ${WRITING_GUIDANCE[resolved]}${issueTerm}`;
}
