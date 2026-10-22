import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guards the glossary of docs/localization-and-copy.md: decisions that a
 * catalog edit or a machine translation must not silently undo.
 */

type Catalog = Record<string, unknown>;
const LOCALES = ["en", "fr", "de", "es", "it", "pt-BR"] as const;
const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [locale, JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Catalog]),
) as Record<(typeof LOCALES)[number], Catalog>;

function entries(catalog: Catalog, prefix = ""): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "string" ? [[prefix + key, value] as [string, string]] : entries(value as Catalog, `${prefix}${key}.`),
  );
}

const STATUSES: Record<Exclude<(typeof LOCALES)[number], "en">, Record<string, string>> = {
  fr: { triage: "Triage", backlog: "Backlog", todo: "À faire", in_progress: "En cours", in_review: "En revue", done: "Terminé", canceled: "Annulé", duplicate: "Doublon" },
  de: { triage: "Triage", backlog: "Backlog", todo: "Zu erledigen", in_progress: "In Bearbeitung", in_review: "In Prüfung", done: "Erledigt", canceled: "Abgebrochen", duplicate: "Duplikat" },
  es: { triage: "Clasificación", backlog: "Backlog", todo: "Pendiente", in_progress: "En curso", in_review: "En revisión", done: "Hecha", canceled: "Cancelada", duplicate: "Duplicada" },
  it: { triage: "Triage", backlog: "Backlog", todo: "Da fare", in_progress: "In corso", in_review: "In revisione", done: "Completato", canceled: "Annullato", duplicate: "Duplicato" },
  "pt-BR": { triage: "Triagem", backlog: "Backlog", todo: "A fazer", in_progress: "Em andamento", in_review: "Em revisão", done: "Concluído", canceled: "Cancelado", duplicate: "Duplicado" },
};

/** Mistranslations already fixed once; each pattern names the word it replaced. */
const FORBIDDEN: Partial<Record<(typeof LOCALES)[number], RegExp[]>> = {
  de: [/\bRückstand\b/, /\bBegründung\b/, /\bPull-Anfrage/, /\bMerge-Anfrage/],
  es: [/\b(a|en|de) la basura\b/, /Caja de entrada/, /\bgalleta/i],
  it: [/\bAI\b/, /\bRifiuti\b/, /\bOsservazion/],
  "pt-BR": [/^Filtro \{/, /\bLixo\b/, /Não raciocínio/, /Solicitaç(ão|ões) pull/],
};

describe("catalog glossary", () => {
  it("names the inbox as the glossary does", () => {
    expect((catalogs.it.Nav as Catalog).inbox).toBe("Posta in arrivo");
    expect((catalogs.es.Nav as Catalog).inbox).toBe("Bandeja de entrada");
  });

  it.each(Object.entries(STATUSES))("names issue statuses as the glossary does in %s", (locale, expected) => {
    expect(catalogs[locale as keyof typeof catalogs].Status).toEqual(expected);
  });

  it.each(Object.entries(FORBIDDEN))("keeps fixed mistranslations out of %s", (locale, patterns) => {
    const offending = entries(catalogs[locale as keyof typeof catalogs])
      .filter(([, value]) => patterns.some((pattern) => pattern.test(value)))
      .map(([key, value]) => `${key}: ${value}`);
    expect(offending).toEqual([]);
  });

  it.each(LOCALES.filter((locale) => locale !== "en"))("never translates feature names in %s", (locale) => {
    const translated = new Map(entries(catalogs[locale]));
    const offending = entries(catalogs.en)
      .flatMap(([key, value]) => ["Smart Assign", "Smart Fill"]
        .filter((name) => value.includes(name) && !translated.get(key)?.includes(name))
        .map((name) => `${key}: ${name}`));
    expect(offending).toEqual([]);
  });

  it("gives every Brazilian Portuguese plural an explicit zero form", () => {
    // Portuguese treats 0 as singular: without `=0`, "0 dia" instead of "0 dias".
    const offending = entries(catalogs["pt-BR"])
      .filter(([, value]) => /plural,/.test(value) && /\bone\s*\{/.test(value) && /\bother\s*\{/.test(value) && !/=0\s*\{/.test(value))
      .map(([key]) => key);
    expect(offending).toEqual([]);
  });
});
