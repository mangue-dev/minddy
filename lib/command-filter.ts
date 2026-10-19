/**
 * cmdk scoring filter for the command/search surfaces. Ranks matches
 * exact > prefix > all-words > substring > any-prefix. Pass it to cmdk's
 * `<Command filter={commandFilter} shouldFilter>`.
 */
export function commandFilter(value: string, search: string): number {
  const v = value.toLowerCase();
  const s = search.toLowerCase().trim();
  if (!s) return 1;

  if (v === s) return 1;

  const searchWords = s.split(/\s+/);
  const allWordsMatch = searchWords.every((w) => v.includes(w));

  const valueWords = v.split(/\s+/);
  const prefixMatch = searchWords.every((sw) =>
    valueWords.some((vw) => vw.startsWith(sw)),
  );

  if (prefixMatch) return 1;
  if (allWordsMatch) return 0.8;

  if (v.includes(s)) return 0.6;

  const anyPrefix = searchWords.some((sw) =>
    valueWords.some((vw) => vw.startsWith(sw)),
  );
  if (anyPrefix) return 0.4;

  return 0;
}
