import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS, GLOBAL_ASSISTANT_TOOLS } from "./tools";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Le contrat entre un OUTIL de Numo et sa LIGNE dans le fil.
 *
 * Chaque appel d'outil s'affiche dans la conversation par une ligne — une icône
 * et une phrase (« Agent de code démarré », « 3 retours trouvés »). Cette phrase
 * vient de `TOOL_META`, indexée par le NOM de l'outil, et l'absence d'entrée ne
 * casse rien : le composant retombe sur « Traitement… » puis « Terminé ».
 *
 * C'est exactement ce qui rend l'oubli invisible. Douze outils avaient dérivé
 * ainsi — lancer l'agent de code, lire une pull request, promouvoir un retour
 * s'affichaient tous « Traitement… », pendant que créer une catégorie
 * s'affichait par son nom. Ajouter un outil et oublier sa ligne ne lève rien,
 * ne journalise rien, et ne se voit qu'à l'écran.
 *
 * Le test lit la SOURCE du composant plutôt que de l'importer : c'est un module
 * client (JSX, lucide), et ce qu'on veut épingler est une table de noms, pas un
 * rendu. Même geste que lib/i18n-contract.test.ts, pour la même raison — la
 * faute n'existe qu'ENTRE deux fichiers.
 */

const DISPLAY = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "components",
  "assistant",
  "tool-call-display.tsx"
);

const source = readFileSync(DISPLAY, "utf8");
const metaBlock = source.slice(source.indexOf("const TOOL_META"));

/** Les clés de premier niveau de TOOL_META (2 espaces d'indentation). */
const labelled = new Set(
  [...metaBlock.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1])
);

/** Les clés du namespace ToolCall que ces libellés demandent au catalogue. */
const usedKeys = new Set(
  [...metaBlock.matchAll(/\bt\("([a-zA-Z0-9_]+)"/g)].map((m) => m[1])
);

/** Les deux modes : le mode projet et le mode global, qui ajoute ses propres
    outils (list_projects, list_global_filter_options). Une ligne manquante dans
    l'un ou l'autre se voit pareil à l'écran. */
const EVERY_TOOL = [
  ...new Set(
    [...ASSISTANT_TOOLS, ...GLOBAL_ASSISTANT_TOOLS].map((t) => t.function.name)
  ),
];

describe("chaque outil de Numo porte sa ligne dans le fil", () => {
  it.each(EVERY_TOOL)("%s a une entrée dans TOOL_META", (name) => {
    expect(labelled).toContain(name);
  });
});

describe("les libellés d'outil existent dans les DEUX catalogues", () => {
  const catalogs: [string, Record<string, unknown>][] = [
    ["en", en.ToolCall as Record<string, unknown>],
    ["fr", fr.ToolCall as Record<string, unknown>],
  ];

  it.each(catalogs)("%s porte toutes les clés utilisées", (_locale, catalog) => {
    const missing = [...usedKeys].filter((k) => !(k in catalog));
    expect(missing).toEqual([]);
  });
});
