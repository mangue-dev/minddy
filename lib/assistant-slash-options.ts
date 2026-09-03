export interface SlashSearchOption {
  label: string;
  description: string;
  keywords?: readonly string[];
}

export interface ComposerMenuTrigger {
  prefix: "/" | "$";
  query: string;
}

/** Read a command or skill picker trigger from a single-line composer value. */
export function composerMenuTrigger(text: string): ComposerMenuTrigger | null {
  const prefix = text[0];
  if ((prefix !== "/" && prefix !== "$") || /[\r\n]/.test(text)) return null;
  return { prefix, query: text.slice(1) };
}

/** Match slash entries by visible copy and optional cross-locale aliases. */
export function filterSlashOptions<T extends SlashSearchOption>(
  options: readonly T[],
  query: string,
): T[] {
  const normalized = query.trim().toLowerCase();
  return options.filter((option) =>
    normalized
      ? [option.label, option.description, ...(option.keywords ?? [])].some((term) =>
          term.toLowerCase().includes(normalized),
        )
      : true,
  );
}
