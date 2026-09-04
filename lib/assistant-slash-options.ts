export interface SlashSearchOption {
  label: string;
  description: string;
  keywords?: readonly string[];
}

export interface ComposerMenuTrigger {
  prefix: "/" | "$";
  query: string;
}

export interface ActiveComposerMenuQuery extends ComposerMenuTrigger {
  /** Offset of the triggering character in the text node. */
  start: number;
  /** Caret offset in the text node. */
  end: number;
}

const ACTIVE_COMPOSER_MENU = /(^|[\t \u00a0\r\n])([/$])([^/$\r\n]*)$/;
const DOUBLE_SPACE = /[ \u00a0]{2}/;

/** Read a command or skill picker trigger from a single-line composer value. */
export function composerMenuTrigger(text: string): ComposerMenuTrigger | null {
  const prefix = text[0];
  if ((prefix !== "/" && prefix !== "$") || /[\r\n]/.test(text)) return null;
  return { prefix, query: text.slice(1) };
}

/** Read a command or skill query immediately before the composer caret. */
export function findActiveComposerMenuQuery(
  textBeforeCaret: string,
): ActiveComposerMenuQuery | null {
  const match = ACTIVE_COMPOSER_MENU.exec(textBeforeCaret);
  if (!match) return null;
  const query = match[3];
  const prefix = match[2];
  if (
    query === undefined ||
    (prefix !== "/" && prefix !== "$") ||
    DOUBLE_SPACE.test(query)
  ) {
    return null;
  }

  const start = (match.index ?? 0) + (match[1]?.length ?? 0);
  return {
    start,
    end: textBeforeCaret.length,
    prefix,
    query,
  };
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
