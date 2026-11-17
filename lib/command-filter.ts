import { defaultFilter } from "cmdk";
import { foldSearchText } from "./search-fold";

/**
 * cmdk scoring filter for the command/search surfaces. Ranks matches
 * exact > prefix > all-words > substring > any-prefix. Pass it to cmdk's
 * `<Command filter={commandFilter} shouldFilter>`.
 */
export function commandFilter(value: string, search: string): number {
  // Accents do not count: "senal" finds "Señal" (lib/search-fold.ts).
  const v = foldSearchText(value);
  const s = foldSearchText(search).trim();
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

/**
 * cmdk's own scoring, fed folded text: the default filter of the `Command`
 * primitive (`components/ui/command.tsx`) and of the search menus, so
 * "senal" finds "Señal".
 */
export function foldedCommandFilter(value: string, search: string, keywords?: string[]): number {
  return defaultFilter(
    foldSearchText(value),
    foldSearchText(search),
    keywords?.map(foldSearchText),
  );
}
