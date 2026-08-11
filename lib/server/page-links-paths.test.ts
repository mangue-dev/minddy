import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API
// du compilateur. Les tests structurels ont donc leur propre TypeScript, en JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-279 — les rétroliens sont écrits par TOUS les chemins d'écriture, ou ils
 * mentent.
 *
 * `page_links` est une table DÉRIVÉE, comme `pages.search_text` (MIN-276) et
 * comme l'historique (MIN-277). Rien, ni dans le schéma ni dans les types,
 * n'oblige un chemin d'écriture à la tenir à jour. Et le défaut a ici une
 * propriété désagréable de plus : il est invisible **depuis la surface qu'on
 * vient d'écrire**. Un ticket dont la description cite « @Spec » s'affiche
 * parfaitement ; c'est la page Spec, ailleurs, chez quelqu'un d'autre, qui
 * ignorera pour toujours qu'on s'appuie sur elle.
 *
 * C'est exactement le genre de trou qu'un test de comportement ne trouve pas :
 * il faudrait avoir DEVINÉ le chemin manquant pour écrire le cas qui le couvre.
 * D'où un test STRUCTUREL, qui PARCOURT les fichiers au lieu d'énumérer des
 * scénarios, et qui tient en une règle par famille :
 *
 *  • **une DESCRIPTION** — dans create-issue.ts, update-issue.ts et
 *    objectives.ts, toute fonction qui appelle `notifyDescriptionMentions`
 *    appelle `queuePageLinks`. Le marqueur n'est pas arbitraire : c'est déjà le
 *    point de convergence de « une description vient d'être écrite », celui par
 *    lequel passent la route, le MCP (`minddy_edit_issue_text`,
 *    `minddy_update_objective`), Numo et l'agent de code — tous repassent par
 *    `updateIssueFields` / `updateObjective`.
 *
 *  • **un CORPS de page** — dans pages.ts, toute fonction qui appelle
 *    `queueSearchText` appelle `queuePageBodyLinks`. Même marqueur que MIN-276,
 *    pour la même raison : les deux dérivent du même texte, au même instant.
 *
 * Ce que le test ne prétend pas couvrir : que la dérivation produise les BONS
 * liens. Ça, c'est `page-links.test.ts`, qui fait tourner le vrai module sur une
 * table en mémoire.
 */

function parse(relative: string): ts.SourceFile {
  const path = join(process.cwd(), relative);
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ESNext,
    true
  );
}

/** Le nom de la fonction qui contient ce nœud — ce qu'on nomme dans l'échec. */
function enclosingFunction(node: ts.Node): string {
  let cursor: ts.Node | undefined = node;
  while (cursor) {
    if (ts.isFunctionDeclaration(cursor) && cursor.name) return cursor.name.text;
    if (
      (ts.isFunctionExpression(cursor) || ts.isArrowFunction(cursor)) &&
      cursor.parent &&
      ts.isVariableDeclaration(cursor.parent) &&
      ts.isIdentifier(cursor.parent.name)
    ) {
      return cursor.parent.name.text;
    }
    cursor = cursor.parent;
  }
  return "<module>";
}

/**
 * Les fonctions d'un fichier qui appellent cette fonction-là, par leur nom.
 *
 * La fonction ENGLOBANTE et pas la fonction immédiate : dans create-issue.ts et
 * update-issue.ts, les effets de bord vivent dans une closure `runSideEffects`
 * déclarée à l'intérieur du geste — c'est bien le geste qu'on veut nommer, mais
 * la closure est un nom stable qui le désigne, et les deux marqueurs y tombent
 * ensemble. C'est tout ce que la règle demande : les deux au MÊME endroit.
 */
function callersOf(src: ts.SourceFile, callee: string): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee
    ) {
      found.add(enclosingFunction(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

describe("les chemins d'écriture d'une description", () => {
  const FILES = [
    "lib/server/create-issue.ts",
    "lib/server/update-issue.ts",
    "lib/server/objectives.ts",
  ];

  it("réécrivent tous les pages qu'ils citent", () => {
    const missing: string[] = [];
    let seen = 0;

    for (const file of FILES) {
      const src = parse(file);
      const writes = callersOf(src, "notifyDescriptionMentions");
      const links = callersOf(src, "queuePageLinks");
      seen += writes.size;
      for (const fn of writes) {
        if (!links.has(fn)) missing.push(`${file} → ${fn}`);
      }
    }

    // Le test ne vaut que s'il VOIT les chemins : une refonte qui les rendrait
    // invisibles à l'analyse le laisserait passer en silence. Quatre aujourd'hui
    // — création et modification, d'un ticket et d'un objectif.
    expect(seen).toBeGreaterThanOrEqual(4);

    expect(
      missing,
      `Ces fonctions écrivent une description sans rejouer ses rétroliens : ` +
        `${missing.join(", ")}. Appelez queuePageLinks avec la source et le ` +
        `texte, sinon les pages qu'elle cite ignoreront qu'elles le sont.`
    ).toEqual([]);
  });
});

describe("les chemins d'écriture du corps d'une page", () => {
  it("réécrivent tous les pages qu'ils citent", () => {
    const src = parse("lib/server/pages.ts");
    const writes = callersOf(src, "queueSearchText");
    const links = callersOf(src, "queuePageBodyLinks");

    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !links.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `rejouer ses liens : ${missing.join(", ")}. Appelez queuePageBodyLinks ` +
        `avec les ids écrits, à côté de queueSearchText — les deux dérivent du ` +
        `même texte au même instant.`
    ).toEqual([]);
  });
});
