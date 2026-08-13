import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (voir package.json) : depuis
// MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Même raison qu'en [subagent-runner-init.test.ts](subagent-runner-init.test.ts).
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

import {
  AGENT_TOOLS,
  NOTEBOOK_AGENT_TOOLS,
  PR_REVIEW_TOOLS,
  type AgentToolDef,
} from "./tools";

/**
 * TOUT TOOL SERVI À L'AGENT A SA LIGNE DANS LE FIL.
 *
 * `TOOL_META` ([tool-call-display.tsx](../../../components/assistant/tool-call-display.tsx))
 * est la table qui donne à un appel son icône et sa phrase. Un tool qui n'y est
 * pas ne lève rien : il retombe sur `getDefaultLabel`, c'est-à-dire
 * « Traitement… » puis « Terminé », sous l'icône grille du repli.
 *
 * Ce que ça a coûté. `create_pr` n'y était pas — l'acte le PLUS visible d'un run,
 * celui qui rend le travail, s'affichait comme une ligne anonyme au milieu de
 * douze lectures de fichiers nommées, elles. Onze autres tools étaient dans le
 * même cas : les trois écritures d'une session de relecture, les six tools des
 * pull requests du projet, le verdict d'une chaîne, la lecture d'une page et
 * celle d'un retour du board. Aucun type-check ne le dit : `TOOL_META` est un
 * `Record<string, ToolMeta>`, il accepte n'importe quel jeu de clés.
 *
 * Un test STRUCTUREL, parce que le composant est du React client et que la suite
 * ne monte rien (`environment: "node"`, `include: ["lib/**"]`). On ne rend donc
 * pas la ligne : on lit les clés de la table dans l'arbre syntaxique, et on les
 * oppose aux jeux de tools que le serveur sert vraiment.
 */

const DISPLAY_PATH = join(
  process.cwd(),
  "components/assistant/tool-call-display.tsx",
);

/** Les clés de l'objet littéral `TOOL_META`, lues dans l'arbre. */
function toolMetaKeys(): Set<string> {
  const src = ts.createSourceFile(
    DISPLAY_PATH,
    readFileSync(DISPLAY_PATH, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
  let literal: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "TOOL_META" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literal = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  const found = literal as ts.ObjectLiteralExpression | null;
  if (!found) throw new Error("TOOL_META introuvable dans tool-call-display.tsx");
  const keys = new Set<string>();
  for (const prop of found.properties) {
    const name = prop.name;
    if (!name) continue;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
  }
  return keys;
}

const names = (tools: AgentToolDef[]) => tools.map((t) => t.function.name);

describe("les lignes du fil d'un run", () => {
  it("nomme les 3 jeux de tools de l'agent, sans exception", () => {
    const keys = toolMetaKeys();
    const served = new Set([
      ...names(AGENT_TOOLS),
      ...names(NOTEBOOK_AGENT_TOOLS),
      ...names(PR_REVIEW_TOOLS),
    ]);
    /**
     * `update_plan` et `ask_user` sont des tools de CONTRÔLE : le premier ne
     * devient jamais un `tool_call` (il part en event `plan_update`, rendu par la
     * carte au-dessus du composer), le second devient un event `question`. Ils
     * n'ont donc pas de ligne à porter — `ask_user` en a une quand même, pour les
     * questions passées du fil de Numo.
     */
    served.delete("update_plan");
    expect([...served].filter((name) => !keys.has(name)).sort()).toEqual([]);
  });

  it("nomme `webfetch`, qui arrive sous le nom d'opencode", () => {
    // Seul tool du fil qui n'a pas de vis-à-vis maison : il n'est dans aucun jeu
    // de `tools.ts` (c'est un intégré d'opencode, cf. `ourToolName`), donc le
    // contrôle ci-dessus ne le voit pas.
    expect(toolMetaKeys().has("webfetch")).toBe(true);
  });
});
