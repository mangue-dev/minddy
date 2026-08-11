import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API
// du compilateur. Les tests structurels ont donc leur propre TypeScript, en JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-276 — `search_text` est écrite par TOUS les chemins d'écriture du corps,
 * ou elle ment.
 *
 * La colonne dérivée est la seule chose que la recherche lit. Elle est écrite
 * par un rattrapage (`queueSearchText`), et non par la base : rien, dans le
 * schéma comme dans les types, n'oblige un chemin d'écriture à l'appeler. Un
 * `insert` ou un `update` qui porte `content` sans son rattrapage ne casse
 * rien de visible — il rend juste une page introuvable par son contenu, en
 * silence, et pour toujours. C'est exactement le genre de trou qu'un test de
 * comportement ne trouve pas : il faudrait avoir DEVINÉ le chemin manquant pour
 * écrire le cas qui le couvre.
 *
 * D'où un test STRUCTUREL, et sa règle, qui se relit sans retracer les appels :
 * **dans `lib/server/pages.ts`, toute fonction qui écrit `content` appelle
 * `queueSearchText`.** Un chemin ajouté plus tard sans son rattrapage fait
 * tomber ce test en nommant la fonction fautive.
 *
 * Ce qu'il ne prétend pas couvrir : que le rattrapage écrive le BON texte. Ça,
 * c'est `pages.test.ts`, qui fait tourner le vrai noyau sur une table en
 * mémoire.
 */

const PAGES_PATH = join(process.cwd(), "lib/server/pages.ts");

function parsePages(): ts.SourceFile {
  return ts.createSourceFile(
    PAGES_PATH,
    readFileSync(PAGES_PATH, "utf8"),
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

/** La ligne écrit-elle un corps ? `{ content: … }` ou `row.content = …`. */
function mentionsContent(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isPropertyAssignment(n) && n.name.getText() === "content") found = true;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === "content"
    ) {
      found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Le nœud de fonction qui contient ce nœud, pour n'inspecter que son corps. */
function enclosingNode(node: ts.Node): ts.Node {
  let cursor: ts.Node | undefined = node;
  while (cursor) {
    if (
      ts.isFunctionDeclaration(cursor) ||
      ts.isFunctionExpression(cursor) ||
      ts.isArrowFunction(cursor)
    ) {
      return cursor;
    }
    cursor = cursor.parent;
  }
  return node;
}

/**
 * Les fonctions qui ÉCRIVENT le corps, et celles qui rattrapent le texte.
 *
 * Ce qu'on cherche : un appel `.insert(…)` / `.update(…)` qui porte `content`.
 * Il le porte de deux façons, et les deux comptent — dans le littéral qu'on lui
 * passe (`{ content: doc }`, le miroir du parent), ou dans une VARIABLE
 * construite plus haut (`patch`, `rows`), auquel cas c'est le `content:` ou le
 * `.content =` de la même fonction qui le dit.
 *
 * La distinction est ce qui garde le test juste : la corbeille et la
 * restauration écrivent aussi la table, mais jamais le corps — elles ne
 * doivent donc pas être exigées de rattraper quoi que ce soit.
 */
function scan() {
  const src = parsePages();
  const writes = new Set<string>();
  const syncs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "insert" || method === "update") {
        const writesBody = node.arguments.some((arg) =>
          ts.isIdentifier(arg) ? mentionsContent(enclosingNode(node)) : mentionsContent(arg)
        );
        if (writesBody) writes.add(enclosingFunction(node));
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "queueSearchText"
    ) {
      syncs.add(enclosingFunction(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  return { writes, syncs };
}

describe("les chemins d'écriture du corps d'une page", () => {
  it("écrivent tous leur texte de recherche", () => {
    const { writes, syncs } = scan();

    // Le test ne vaut que s'il VOIT les chemins : une refonte qui les rendrait
    // invisibles à l'analyse le laisserait passer en silence.
    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !syncs.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `rejouer sa projection : ${missing.join(", ")}. Appelez queueSearchText ` +
        `avec les ids écrits, sinon la page reste introuvable par son contenu.`
    ).toEqual([]);
  });

  it("couvrent les quatre gestes connus", () => {
    const { writes } = scan();
    // Un garde-fou du garde-fou : si l'un de ces noms disparaît, c'est que le
    // module a bougé, et la règle ci-dessus doit être relue plutôt que crue.
    for (const fn of ["createPage", "duplicatePage", "updatePage", "syncParentBody"]) {
      expect(writes.has(fn), `${fn} n'est plus vu comme un chemin d'écriture`).toBe(
        true
      );
    }
  });
});
