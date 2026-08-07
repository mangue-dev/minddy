import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (cf. package.json et CLAUDE.md) :
// depuis MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Un test structurel a besoin d'un TypeScript en JS pour lire un arbre.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-212 — l'ADMISSION d'un chunk qui doit reprendre un sous-agent.
 *
 * Ce que ça évite. Une fille reprise reçoit `min(SUBAGENT_MAX_MS, restant du chunk −
 * réserve du parent)`, planché à 1 s. Sur un chunk de fin de fenêtre de drain — 40 à
 * 150 s, la norme dès que plusieurs runs se partagent les 270 s — elle repartait
 * avec UNE seconde : un round, une re-suspension, un parent garé qui rend
 * `suspended` sans dire un mot, un chunk re-queué. Un round par chunk, chacun payant
 * son réveil de microVM, jusqu'aux 20 continuations. Le jumeau temporel du zombie de
 * l'axe rounds.
 *
 * Deux invariants, et ils tiennent tout :
 *
 * 1. **`continuations` n'est PAS incrémenté.** Un chunk qui n'a rien joué n'est pas
 *    une continuation. Le compter comme telle recréerait exactement le zombie qu'on
 *    corrige : vingt refus, et le garde-fou anti-runaway tue le tour.
 * 2. **Le refus arrive AVANT le réveil de la microVM.** Toute la valeur du correctif
 *    est là : refuser après `getOrCreateAgentSandbox` paierait le réveil qu'on
 *    cherche justement à ne plus payer, vingt fois de suite.
 *
 * Pourquoi un test STRUCTUREL. `executeAgentRun` ne s'atteint qu'avec une microVM,
 * une base et un modèle — il n'y a pas de test unitaire de ce chemin (même raison
 * que `checkpoint-turn-state.test.ts`). L'arithmétique, elle, se teste à part
 * (`chunkFitsSubagentResume`, `isResumableSubagent`) ; ce qui reste est lexical :
 * quelles clés porte le stamp, et où le bloc se trouve dans la fonction. Le
 * compilateur ne dit rien — `continuations` est optionnel, un stamp qui l'ajoute
 * type parfaitement.
 */

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");

const source = ts.createSourceFile(
  EXECUTE_PATH,
  readFileSync(EXECUTE_PATH, "utf8"),
  ts.ScriptTarget.ESNext,
  true,
);

function find<T extends ts.Node>(match: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (match(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** La déclaration `const <name> = …` du fichier (les noms visés sont uniques ici). */
function declaration(name: string): ts.VariableDeclaration {
  const decl = find(
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name,
  )[0];
  expect(decl, `\`${name}\` introuvable dans execute.ts — l'ancre du test a bougé`).toBeDefined();
  return decl;
}

/** Les clés que pose un littéral d'objet, `satisfies`/`as`/parenthèses traversés. */
function keysOf(expr: ts.Expression | undefined): Set<string> {
  if (!expr) return new Set();
  if (ts.isParenthesizedExpression(expr)) return keysOf(expr.expression);
  if (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) return keysOf(expr.expression);
  const keys = new Set<string>();
  if (ts.isObjectLiteralExpression(expr)) {
    for (const prop of expr.properties) {
      if (prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
        keys.add(prop.name.text);
      }
    }
  }
  return keys;
}

/** Le `if` le plus EXTERNE qui contient ce nœud : le garde d'admission entier. */
function enclosingGate(node: ts.Node): ts.IfStatement {
  const gates = find(ts.isIfStatement).filter(
    (s) => s.getStart() <= node.getStart() && node.getEnd() <= s.getEnd(),
  );
  expect(gates.length, "le stamp de refus doit vivre sous un `if` d'admission").toBeGreaterThan(0);
  return gates.reduce((outer, s) => (s.getStart() < outer.getStart() ? s : outer));
}

/** Les identifiants LUS dans un sous-arbre (une clé d'objet n'est pas une lecture). */
function valueReads(root: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isMember = ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
      if (!isMember && !isKey) names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** Position du premier appel à `name(…)`. */
function callPos(name: string): number {
  const call = find(
    (n): n is ts.CallExpression =>
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name,
  )[0];
  expect(call, `appel à \`${name}\` introuvable dans execute.ts`).toBeDefined();
  return call.getStart();
}

const deferStamp = declaration("deferStamp");
const gate = enclosingGate(deferStamp);

/** La propriété `budgetGuard:` passée au registre de sous-agents. */
const budgetGuard = find(
  (n): n is ts.PropertyAssignment =>
    ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "budgetGuard",
)[0];

describe("admission d'un chunk qui doit reprendre un sous-agent (execute.ts)", () => {
  it("re-queue SANS incrémenter `continuations` ni réécrire le checkpoint", () => {
    const keys = keysOf(deferStamp.initializer);
    // Le fond du ticket. Vingt refus comptés comme des continuations, et le
    // garde-fou anti-runaway tue le tour — le zombie qu'on vient de corriger.
    expect(
      [...keys],
      "`deferStamp` ne doit PAS porter `continuations` : un chunk qui n'a rien joué " +
        "n'est pas une continuation (MIN-212)",
    ).not.toContain("continuations");
    // Rien n'a bougé : réécrire le checkpoint ne pourrait que le dégrader.
    expect([...keys], "`deferStamp` ne doit PAS réécrire `checkpoint`").not.toContain("checkpoint");
    // Et ce qu'il DOIT porter : remise en file, et un délai pour que le drain
    // affamé qui vient de le claim ne le reprenne pas dans la même fenêtre.
    for (const key of ["status", "not_before"]) {
      expect([...keys], `\`deferStamp\` doit porter \`${key}\``).toContain(key);
    }
  });

  it("décide avec les prédicats PARTAGÉS, sur le checkpoint du run", () => {
    const reads = valueReads(gate);
    // `isResumableSubagent` est celui de `restore`/`resumeSuspended` : une copie
    // locale refuserait des chunks pour une fille que le registre ne reprendrait
    // pas, et le run resterait garé jusqu'au garde-fou.
    for (const fn of ["isResumableSubagent", "chunkFitsSubagentResume", "stampRun"]) {
      expect([...reads], `l'admission doit passer par \`${fn}\``).toContain(fn);
    }
    expect(
      gate.getText(),
      "l'admission se décide sur `run.checkpoint` — le seul état lisible avant la microVM",
    ).toContain("run.checkpoint");
    // Un message utilisateur non consommé passe devant : le déparker vaut mieux
    // que d'épargner un round de fille.
    expect([...reads], "un message en attente doit rouvrir l'admission").toContain(
      "hasPendingRunMessages",
    );
    // `suspended` et non `completed` : le tour continue, il attend juste un chunk
    // à budget plein.
    expect(gate.getText(), "le refus doit rendre `suspended`").toContain('return "suspended"');
  });

  it("refuse AVANT le réveil de la microVM", () => {
    // Toute la valeur du correctif : ce qu'on ne veut plus payer, c'est le réveil.
    expect(
      gate.getStart(),
      "le garde d'admission doit précéder `getOrCreateAgentSandbox` — sinon le chunk " +
        "refusé paie quand même le réveil de la microVM (MIN-212)",
    ).toBeLessThan(callPos("getOrCreateAgentSandbox"));
  });
});

describe("lancement d'un sous-agent en cours de chunk (execute.ts)", () => {
  /**
   * La voie SŒUR de l'admission, et le reste du même ticket. `budgetGuard` opposait
   * le restant du chunk au minimum de la FILLE (`SUBAGENT_MIN_MS`, 30 s), alors que
   * la fille reçoit ce restant MOINS la réserve du parent (120 s) : entre les deux,
   * un `spawn_agent` passait et le lanceur lui rendait la seconde du
   * `Math.max(1_000, budget)` — le zombie temporel, refermé côté reprise et resté
   * ouvert côté lancement.
   *
   * Structurel pour la même raison que le reste du fichier : la garde est une
   * closure sur `chunkRemainingMs`, inatteignable sans microVM. Ce qui se teste,
   * c'est QUEL seuil elle lit — et le compilateur, lui, accepte les deux.
   */
  it("garde le MÊME seuil que l'admission d'une reprise", () => {
    expect(
      budgetGuard,
      "`budgetGuard` introuvable dans execute.ts — l'ancre du test a bougé",
    ).toBeDefined();
    const reads = valueReads(budgetGuard.initializer);
    expect(
      [...reads],
      "`budgetGuard` doit décider par `chunkFitsSubagentResume`, comme l'admission : " +
        "deux seuils écrits à la main divergent (MIN-212, MIN-213)",
    ).toContain("chunkFitsSubagentResume");
    expect(
      [...reads],
      "`budgetGuard` ne doit PAS opposer `SUBAGENT_MIN_MS` au restant du chunk : " +
        "c'est le budget de la FILLE, réserve du parent non déduite (MIN-212)",
    ).not.toContain("SUBAGENT_MIN_MS");
  });
});
