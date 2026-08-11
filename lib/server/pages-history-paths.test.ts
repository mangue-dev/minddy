import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API
// du compilateur. Les tests structurels ont donc leur propre TypeScript, en JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-277 — une écriture de page porte SON AUTEUR et archive ce qu'elle
 * recouvre, ou l'historique ment.
 *
 * Le jumeau de `pages-search-paths.test.ts`, et pour la même raison de fond :
 * rien, dans le schéma comme dans les types, n'oblige un chemin d'écriture à
 * poser `updated_by` ni à insérer sa ligne de `page_versions`. Un chemin qui
 * l'oublie ne casse rien de visible — il rend une écriture anonyme et
 * irréversible, ce qui ne se découvre que le jour de l'incident, quand
 * quelqu'un demande « qui a écrit ça » et « remets-moi la version d'avant ».
 *
 * La règle, qui se relit sans retracer les appels : **dans
 * `lib/server/pages.ts`, toute fonction qui écrit `content` appelle `writtenBy`
 * ET `stampPageWrite`.** Un chemin ajouté plus tard sans l'un des deux fait
 * tomber ce test en nommant la fonction fautive.
 *
 * `stampPageWrite` n'archive rien sur une création (`previous: null`) : le point
 * d'appel y est conservé exprès, pour que la règle n'ait aucune exception à
 * retenir — et pour que ce test reste une lecture, pas une liste de cas.
 *
 * Ce qu'il ne prétend pas couvrir : que l'archivage garde le BON état, ni que la
 * coalescence coalesce. Ça, c'est `pages.test.ts`, qui fait tourner le vrai
 * noyau sur une table en mémoire.
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
 * La TABLE visée par un `.insert(…)` / `.update(…)` — `service.from("pages")`.
 *
 * Sans elle, l'analyse compterait l'insertion d'une ligne d'HISTORIQUE
 * (`page_versions`, qui porte elle aussi une colonne `content`) comme un chemin
 * d'écriture de page, et exigerait de l'archiveur qu'il s'archive lui-même.
 */
function targetTable(node: ts.CallExpression): string | null {
  let cursor: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(cursor) || ts.isCallExpression(cursor)) {
    if (
      ts.isCallExpression(cursor) &&
      ts.isPropertyAccessExpression(cursor.expression) &&
      cursor.expression.name.text === "from"
    ) {
      const arg = cursor.arguments[0];
      return arg && ts.isStringLiteral(arg) ? arg.text : null;
    }
    cursor = ts.isCallExpression(cursor) ? cursor.expression : cursor.expression;
  }
  return null;
}

/**
 * Les fonctions qui ÉCRIVENT le corps, et celles qui signent / archivent.
 *
 * Même analyse que pour la projection de recherche : un `.insert(…)` /
 * `.update(…)` qui porte `content`, dans le littéral qu'on lui passe ou dans une
 * variable construite plus haut (`patch`, `rows`). La corbeille et la
 * restauration écrivent aussi la table mais jamais le corps — elles ne doivent
 * donc rien signer d'autre que ce qu'elles touchent.
 */
function scan() {
  const src = parsePages();
  const writes = new Set<string>();
  const signed = new Set<string>();
  const archived = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (
        (method === "insert" || method === "update") &&
        targetTable(node) === "pages"
      ) {
        const writesBody = node.arguments.some((arg) =>
          ts.isIdentifier(arg) ? mentionsContent(enclosingNode(node)) : mentionsContent(arg)
        );
        if (writesBody) writes.add(enclosingFunction(node));
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "writtenBy") signed.add(enclosingFunction(node));
      if (node.expression.text === "stampPageWrite") {
        archived.add(enclosingFunction(node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  return { writes, signed, archived };
}

describe("les chemins d'écriture du corps d'une page", () => {
  it("portent tous leur auteur", () => {
    const { writes, signed } = scan();

    // Le test ne vaut que s'il VOIT les chemins : une refonte qui les rendrait
    // invisibles à l'analyse le laisserait passer en silence.
    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !signed.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `dire QUI : ${missing.join(", ")}. Étalez writtenBy(actorId, kind) sur la ` +
        `ligne écrite, sinon l'en-tête de la page nommera le dernier auteur connu ` +
        `— ou personne.`
    ).toEqual([]);
  });

  it("archivent tous l'état qu'ils recouvrent", () => {
    const { writes, archived } = scan();

    const missing = [...writes].filter((fn) => !archived.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts recouvrent le corps d'une page sans ` +
        `l'archiver : ${missing.join(", ")}. Appelez stampPageWrite avec l'état lu ` +
        `avant l'écriture (previous: null sur une création), sinon ce qu'elles ` +
        `écrasent est perdu pour de bon.`
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
