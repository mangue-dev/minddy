import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Un test structurel a besoin d'un TypeScript en JS pour lire un arbre.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-210 — l'état de TOUR (`editedPaths`, `repoTouched`) traverse le checkpoint,
 * SAUF sur la fin de tour naturelle.
 *
 * Ce que ça coûtait de ne pas le faire. Les deux vivaient en RAM, locaux au chunk.
 * Chunk 1 : l'agent édite dix fichiers, délègue, la soft-deadline tombe, le tour
 * suspend. Chunk 2 : la fille rend son rapport, le parent lit, lance `npm test`
 * (qui passe — les tests ne type-checkent pas) et répond « c'est fait ». Le `Set`
 * est vide, le verrou est à `false` : aucun `tsc`, aucun bloc d'auto-relecture,
 * aucun event `status/type_check`. Le travail est commité, poussé, la PR est
 * ouverte, et rien nulle part ne dit que la vérification n'a pas tourné. Tout
 * ticket un peu lourd tient sur plus d'un chunk : le cas est la normale, pas le
 * bord.
 *
 * Et la moitié inverse compte autant : sur le chemin `completed`, le tour est
 * FINI — type-check et relecture ont parlé, `lastFilesSha` a avancé jusqu'à la
 * tête poussée. Y laisser fuiter `repoTouched` ferait relire au tour suivant un
 * diff désormais vide. D'où DEUX objets dans `execute.ts`, et un test qui vérifie
 * que chaque sortie prend le bon.
 *
 * Pourquoi un test STRUCTUREL. `executeAgentRun` ne s'atteint qu'avec une microVM,
 * une base et un modèle — il n'y a pas de test unitaire de ce chemin. Mais
 * l'invariant, lui, est lexical : quelles clés porte l'objet persisté par quelle
 * branche. Ça se lit dans l'arbre syntaxique, et c'est là qu'on le reprend. Le
 * compilateur ne dit rien : `editedPaths` et `repoTouched` sont optionnels, et un
 * checkpoint qui les oublie type parfaitement.
 */

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");

const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

/** Toutes les `const`/`let` du fichier, par nom — les noms visés sont uniques ici. */
function declarations(): Map<string, ts.VariableDeclaration> {
  const found = new Map<string, ts.VariableDeclaration>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      // Première liaison seulement : un homonyme plus bas ne doit pas voler l'ancre.
      if (!found.has(node.name.text)) found.set(node.name.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const decls = declarations();

/**
 * Les clés que cette expression POSE sur l'objet résultant — en suivant les
 * spreads jusqu'à leur déclaration, et les deux branches d'un `...(cond ? {…} : {})`
 * (la forme des clés optionnelles du checkpoint). C'est la SHAPE qu'on vérifie,
 * pas le texte : le jour où quelqu'un réorganise ces objets, le test suit tant que
 * les clés arrivent au bon endroit — et tombe dès qu'une clé change de camp.
 */
function producedKeys(expr: ts.Expression, seen = new Set<string>()): Set<string> {
  const keys = new Set<string>();
  const merge = (other: Set<string>) => {
    for (const k of other) keys.add(k);
  };

  if (ts.isParenthesizedExpression(expr)) return producedKeys(expr.expression, seen);
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return producedKeys(expr.expression, seen);
  }
  if (ts.isConditionalExpression(expr)) {
    merge(producedKeys(expr.whenTrue, seen));
    merge(producedKeys(expr.whenFalse, seen));
    return keys;
  }
  if (ts.isIdentifier(expr)) {
    if (seen.has(expr.text)) return keys;
    seen.add(expr.text);
    const decl = decls.get(expr.text);
    return decl?.initializer ? producedKeys(decl.initializer, seen) : keys;
  }
  /**
   * `fitCheckpoint(x)` (MIN-217) et le `.checkpoint` qu'on en lit : le rabotage ne
   * rend qu'un SOUS-ENSEMBLE des clés de son argument — il n'en invente aucune. La
   * question que pose ce test étant « quelle clé atterrit dans quel objet », c'est
   * donc `x` qu'il faut lire à travers lui. Sans cette traversée, `baseCheckpoint`
   * se lirait comme un objet SANS clés et les assertions passeraient à vide.
   */
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === "checkpoint") {
    return producedKeys(expr.expression, seen);
  }
  if (ts.isCallExpression(expr) && expr.expression.getText() === "fitCheckpoint") {
    return expr.arguments[0] ? producedKeys(expr.arguments[0], seen) : keys;
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const prop of expr.properties) {
      if (ts.isSpreadAssignment(prop)) {
        merge(producedKeys(prop.expression, seen));
      } else if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
        keys.add(prop.name.text);
      }
    }
  }
  return keys;
}

/** Les clés du checkpoint nommé, ou l'échec du test si l'ancre a disparu. */
function keysOf(name: string): Set<string> {
  const decl = decls.get(name);
  expect(decl, `\`${name}\` introuvable dans execute.ts`).toBeDefined();
  return producedKeys(decl!.initializer!);
}

/** Le bloc `if (result.status === "completed") { … }` — la fin de tour naturelle. */
function completedBranch(): ts.Statement {
  let found: ts.Statement | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isIfStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      node.expression.left.getText() === "result.status" &&
      ts.isStringLiteral(node.expression.right) &&
      node.expression.right.text === "completed"
    ) {
      found = node.thenStatement;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(found, "`if (result.status === \"completed\")` introuvable dans execute.ts").not.toBeNull();
  return found as unknown as ts.Statement;
}

/** Les identifiants LUS dans un sous-arbre (une clé d'objet n'est pas une lecture). */
function valueReads(root: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isMember = ts.isPropertyAccessExpression(parent) && parent.name === node;
      // `{ checkpoint: … }` : la clé n'est pas une lecture. `{ checkpoint }`
      // (shorthand) en EST une — et c'est justement la forme qui nous intéresse.
      const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
      if (!isMember && !isKey) names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/**
 * L'argument nommé `prop` passé à l'appel de `callee`. C'est ainsi que `repoTouched`
 * est semé depuis MIN-240 : le verrou appartient au crochet de fin de tour
 * (`makeTurnEndHook`, partagé avec la microVM) et non plus à une `let` du fichier.
 *
 * ANCRÉ SUR L'APPEL, et pas sur « un `repoTouched:` quelque part » : `execute.ts` en
 * porte trois — la graine du crochet, celle du payload de la microVM, et la clé
 * ÉCRITE au checkpoint (`{ repoTouched: true }`). Une recherche par nom seul se
 * serait satisfaite de n'importe laquelle, et ce test aurait continué de passer
 * pendant que la graine du crochet disparaissait. Vérifié : sans l'ancre, il passe
 * en effet.
 */
function argOf(callee: string, prop: string): string | undefined {
  let found: string | undefined;
  const visit = (node: ts.Node) => {
    if (!found && ts.isCallExpression(node) && node.expression.getText() === callee) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === prop) {
            found = p.initializer.getText();
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Où chaque moitié de l'état de tour est semée, dans la forme qui est la sienne. */
const TURN_STATE_SEEDS: Record<(typeof TURN_STATE)[number], () => string | undefined> = {
  // Une liaison locale : `const editedPaths = new Set(run.checkpoint?.editedPaths ?? [])`.
  editedPaths: () => decls.get("editedPaths")?.initializer?.getText(),
  // Un argument du crochet de fin de tour, qui possède le verrou depuis MIN-240.
  repoTouched: () => argOf("makeTurnEndHook", "repoTouched"),
};

const TURN_STATE = ["editedPaths", "repoTouched"] as const;

describe("état de tour dans le checkpoint (execute.ts)", () => {
  it("le checkpoint des repos qui poursuivent le tour porte l'état de tour", () => {
    const keys = keysOf("checkpoint");
    // Le fond du ticket : sans ces deux clés, le chunk suivant repart aveugle.
    for (const key of TURN_STATE) {
      expect([...keys], `\`checkpoint\` doit porter \`${key}\``).toContain(key);
    }
    // Et le reste du run continue de voyager (garde-fou anti-régression du split).
    for (const key of ["messages", "lastFilesSha", "instructions"]) {
      expect([...keys], `\`checkpoint\` doit porter \`${key}\``).toContain(key);
    }
  });

  it("le checkpoint de la FIN DE TOUR ne porte pas l'état de tour", () => {
    const keys = keysOf("baseCheckpoint");
    for (const key of TURN_STATE) {
      expect(
        [...keys],
        `\`baseCheckpoint\` ne doit PAS porter \`${key}\` : le tour est fini, ` +
          "le faire fuiter déclencherait au tour suivant une auto-relecture sans rien à relire.",
      ).not.toContain(key);
    }
    for (const key of ["messages", "lastFilesSha", "instructions"]) {
      expect([...keys], `\`baseCheckpoint\` doit porter \`${key}\``).toContain(key);
    }
  });

  it("la branche `completed` persiste la base, jamais le checkpoint d'état de tour", () => {
    const reads = valueReads(completedBranch());
    expect(
      reads.has("baseCheckpoint"),
      "la fin de tour doit persister `baseCheckpoint` — si l'ancre a bougé, ce test doit tomber, pas passer en silence",
    ).toBe(true);
    expect(
      reads.has("checkpoint"),
      "la fin de tour ne doit PAS persister le checkpoint porteur de l'état de tour (MIN-210)",
    ).toBe(false);
  });

  it("les deux liaisons du chunk sont SEMÉES depuis le checkpoint", () => {
    for (const name of TURN_STATE) {
      const seed = TURN_STATE_SEEDS[name]();
      expect(seed, `\`${name}\` n'est semé nulle part dans execute.ts`).toBeDefined();
      expect(
        seed,
        `\`${name}\` doit repartir de \`run.checkpoint\` — sinon l'état de tour est écrit ` +
          "dans le checkpoint mais jamais relu, et le bug reste entier.",
      ).toContain("run.checkpoint");
    }
  });
});
