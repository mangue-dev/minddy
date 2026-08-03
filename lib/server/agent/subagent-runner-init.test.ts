import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { Subagents, type SubagentRecord, type SubagentRunner } from "./subagent";

/**
 * MIN-169 — la closure `subagentRunner` d'`execute.ts` ne doit lire AUCUNE
 * liaison locale déclarée après elle.
 *
 * Ce que ça a coûté de ne pas le vérifier. `resumeSuspended()` relance les filles
 * suspendues au chunk précédent en appelant `runner.run` SYNCHRONEMENT, et pour
 * une fille reprise le corps de `run` n'a aucun `await` avant d'évaluer l'objet
 * passé à `runAgentLoop` : la branche d'amorçage (prompt système, instructions du
 * dépôt) est sautée, son historique est déjà là. Cet objet contient `budgetUsd`,
 * qui était déclaré cent lignes PLUS BAS que l'appel à `resumeSuspended()` — donc
 * dans sa zone morte temporelle. Chaque fille reprise mourait sur
 * `ReferenceError: Cannot access 'budgetUsd' before initialization` (lu
 * `Cannot access 'e1' before initialization` en production, où le bundle est
 * minifié), le `.catch` de `launch` en faisait un rapport d'échec, et deux
 * explorations qui avaient déjà travaillé un chunk entier ne rendaient rien.
 *
 * Pourquoi un test STRUCTUREL. Le vrai runner ne s'atteint qu'avec une microVM,
 * une base et un modèle : il n'y a pas de test unitaire de ce chemin. Mais la
 * faute, elle, est purement lexicale — elle se lit dans l'arbre syntaxique, et
 * c'est là qu'on la reprend. Le compilateur, lui, ne dit rien : une capture de
 * closure est légale quel que soit l'ordre des déclarations ; seul l'INSTANT de
 * l'appel décide, et `tsc` ne le connaît pas.
 *
 * La barrière retenue est `new Subagents(` : à partir de cette expression le
 * runner est confié à un registre qui peut l'appeler, et tout ce qu'il capture
 * doit être initialisé. C'est plus strict que le seul `resumeSuspended()` — et
 * c'est voulu : la règle « le runner est complet avant d'être remis à qui peut
 * l'appeler » se relit sans avoir à retracer les chemins d'appel.
 */

const EXECUTE_PATH = join(process.cwd(), "lib/server/agent/execute.ts");

function parseExecute(): ts.SourceFile {
  return ts.createSourceFile(
    EXECUTE_PATH,
    readFileSync(EXECUTE_PATH, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
}

/** Les deux ancres du contrôle, cherchées par leur nom dans l'arbre. */
function findAnchors(src: ts.SourceFile) {
  let runner: ts.VariableDeclaration | null = null;
  let barrier: ts.NewExpression | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "subagentRunner" &&
      node.initializer
    ) {
      runner = node;
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Subagents"
    ) {
      barrier = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return { runner: runner as ts.VariableDeclaration | null, barrier: barrier as ts.NewExpression | null };
}

/** Fonction englobante d'un nœud : la portée des liaisons qui nous intéressent. */
function enclosingFunction(node: ts.Node): ts.Node | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/** Tous les noms liés par un sous-arbre (déclarations, paramètres, déstructurations). */
function boundNames(root: ts.Node, opts: { skip?: ts.Node } = {}): Map<string, number> {
  const names = new Map<string, number>();
  const add = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) {
      if (!names.has(name.text)) names.set(name.text, name.getStart());
      return;
    }
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) add(el.name);
    }
  };
  const visit = (node: ts.Node) => {
    if (node === opts.skip) return;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) add(node.name);
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (!names.has(node.name.text)) names.set(node.name.text, node.name.getStart());
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return names;
}

/** L'identifiant est-il une LECTURE de valeur, ou juste un nom de propriété ? */
function readsAValue(id: ts.Identifier): boolean {
  const parent = id.parent;
  // `x.budgetUsd` : `budgetUsd` est un membre, pas la liaison locale.
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  // `{ budgetUsd: something }` : la clé n'est pas une lecture. En revanche
  // `{ budgetUsd }` (shorthand) EN EST une — c'est justement la forme du bug.
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (ts.isQualifiedName(parent) && parent.right === id) return false;
  return true;
}

describe("subagentRunner (execute.ts) — captures initialisées", () => {
  it("ne lit aucune liaison locale déclarée après `new Subagents(`", () => {
    const src = parseExecute();
    const { runner, barrier } = findAnchors(src);

    // Si les ancres bougent, le test doit TOMBER, pas passer en silence : un
    // contrôle qui ne contrôle plus rien est pire que pas de contrôle.
    expect(runner, "`const subagentRunner` introuvable dans execute.ts").not.toBeNull();
    expect(barrier, "`new Subagents(` introuvable dans execute.ts").not.toBeNull();

    const body = runner!.initializer!;
    const scope = enclosingFunction(runner!);
    expect(scope, "portée englobante de `subagentRunner` introuvable").not.toBeNull();

    // Ce que la closure déclare elle-même masque l'extérieur (`model`, `result`,
    // `job`…) : ces noms-là ne disent rien de l'ordre des déclarations du dessus.
    const shadowed = boundNames(body);
    const outer = boundNames(scope!, { skip: body });

    const offenders: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && !shadowed.has(node.text) && readsAValue(node)) {
        const declaredAt = outer.get(node.text);
        if (declaredAt !== undefined && declaredAt > barrier!.getStart()) {
          const line = src.getLineAndCharacterOfPosition(declaredAt).line + 1;
          const used = src.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          offenders.push(`\`${node.text}\` lu ligne ${used}, déclaré ligne ${line}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);

    expect(
      [...new Set(offenders)],
      "Ces liaisons sont dans leur zone morte quand `resumeSuspended()` relance une " +
        "fille : le sous-agent meurt sur un ReferenceError avant de produire son rapport " +
        "(MIN-169). Déclarez-les au-dessus de `const subagentRunner`.",
    ).toEqual([]);
  });
});

/**
 * Le danger que le contrôle ci-dessus existe pour couvrir : la reprise appelle le
 * runner AVANT de rendre la main. Tant que c'est vrai, tout ce que la closure
 * capture doit être initialisé au moment où `resumeSuspended()` est appelé — et
 * ce test-ci le prouve à l'exécution plutôt que sur parole.
 */
describe("resumeSuspended", () => {
  it("appelle le runner de façon synchrone", () => {
    let calledSynchronously = false;
    const runner: SubagentRunner = {
      run: () => {
        calledSynchronously = true;
        return new Promise(() => {});
      },
    };
    const subagents = new Subagents(runner, { maxParallel: 2, favorites: [] });

    const suspended: SubagentRecord = {
      id: "sub-1",
      task: "auditer le dépôt",
      mode: "explore",
      model: null,
      thinkingEffort: null,
      status: "suspended",
      rounds: 4,
      costUsd: 0.02,
      startedAt: 0,
      delivered: false,
      messages: [{ role: "system", content: "…" }],
      slot: 1,
    };
    subagents.restore([suspended]);

    expect(subagents.resumeSuspended()).toBe(1);
    // Aucun `await` entre les deux lignes : si la relance était différée, le
    // contrôle lexical du dessus perdrait sa raison d'être.
    expect(calledSynchronously).toBe(true);
  });
});
