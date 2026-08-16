import {
  resolveKeyToken,
  type CheatsheetSection,
} from "@/lib/keyboard/shortcuts";

type TranslatedCheatsheet = {
  sectionTitle: (key: CheatsheetSection["titleKey"]) => string;
  shortcutLabel: (key: CheatsheetSection["shortcuts"][number]["labelKey"]) => string;
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function shortcutKeys(shortcut: CheatsheetSection["shortcuts"][number]): string {
  return [...shortcut.keys, ...(shortcut.altKeys ?? [])]
    .flat()
    .map(resolveKeyToken)
    .join(" ");
}

export function filterCheatsheet(
  cheatsheet: CheatsheetSection[],
  query: string,
  translated: TranslatedCheatsheet
): CheatsheetSection[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return cheatsheet;

  return cheatsheet
    .map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter((shortcut) =>
        [
          translated.sectionTitle(section.titleKey),
          translated.shortcutLabel(shortcut.labelKey),
          shortcutKeys(shortcut),
        ].some((value) => normalize(value).includes(normalizedQuery))
      ),
    }))
    .filter((section) => section.shortcuts.length > 0);
}
