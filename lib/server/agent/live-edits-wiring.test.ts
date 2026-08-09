import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (voir package.json), et ce
// n'est pas une coquille : depuis MIN-180 le dépôt vérifie avec `typescript@7`,
// qui ne livre plus l'API du compilateur. Même raison que
// [subagent-runner-init.test.ts](subagent-runner-init.test.ts).
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-248 bis — TOUT exec-tool prévient le fil de ses éditions.
 *
 * Ce que ça a coûté de ne pas le vérifier. Le crochet `onEdit` n'était câblé que
 * sur l'exec-tool du parent, et seulement dans la fonction ([execute.ts]) : la
 * microVM ([vm/turn.ts]) ne le posait nulle part. Or `agent_loop_in_vm_projects`
 * avait déjà basculé le projet sur lequel on regardait — la feature ne pouvait
 * s'afficher sur AUCUN run observé. Le plan de contrôle, lui, savait déjà lire un
 * champ `files` que personne ne lui envoyait. Rien ne l'a dit : les deux moteurs
 * type-checkent, et le test du crochet exerçait l'exec-tool sans passer par un
 * moteur.
 *
 * Et la même faute avait une seconde moitié : les exec-tools des FILLES, dans les
 * deux moteurs. La sandbox est partagée (MIN-112), donc un fichier qu'une fille
 * édite est un fichier du tour — le `files_changed` de fin de tour ne les
 * distingue pas. Une délégation d'une demi-heure ne montrait rien au fil.
 *
 * Pourquoi un test STRUCTUREL. Le vrai chemin ne s'atteint qu'avec une microVM,
 * une base et un modèle ; les tests de comportement couvrent le parent de chaque
 * moteur, mais pas les filles. La règle, elle, est purement lexicale — « aucun
 * `makeExecTool` sans `onEdit` » se lit dans l'arbre. Un cinquième appel un jour
 * fera échouer ce test : c'est l'objet, il oblige à décider plutôt qu'à oublier.
 */

const ENGINES = ["lib/server/agent/execute.ts", "lib/server/agent/vm/turn.ts"];

/** Les propriétés passées à chaque `makeExecTool({ … })` du fichier. */
function execToolCalls(relPath: string): string[][] {
  const abs = join(process.cwd(), relPath);
  const src = ts.createSourceFile(
    abs,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
  const calls: string[][] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "makeExecTool" &&
      node.arguments.length === 1 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      calls.push(
        node.arguments[0].properties
          .map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : ""))
          .filter(Boolean),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return calls;
}

describe("le crochet `onEdit` est câblé sur TOUS les exec-tools", () => {
  it.each(ENGINES)("%s", (engine) => {
    const calls = execToolCalls(engine);
    // Deux par moteur : le parent et les filles. Le compte est vérifié pour qu'un
    // appel DÉPLACÉ (ou disparu) ne fasse pas passer le test par le vide.
    expect(calls, `aucun makeExecTool trouvé dans ${engine}`).toHaveLength(2);
    for (const props of calls) {
      expect(props, `un makeExecTool de ${engine} sans onEdit`).toContain("onEdit");
    }
  });

  it("les deux moteurs en câblent le même nombre — la garantie ne dépend pas de `loop_in_vm`", () => {
    const [fn, vm] = ENGINES.map((e) => execToolCalls(e).length);
    expect(vm).toBe(fn);
  });
});
