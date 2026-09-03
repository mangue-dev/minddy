export interface SlashSearchOption {
  label: string;
  description: string;
  keywords?: readonly string[];
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
