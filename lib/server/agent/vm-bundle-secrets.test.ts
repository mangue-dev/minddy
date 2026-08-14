import { readFileSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

// `typescript-api` est un alias vers `typescript@5` (voir package.json) : depuis
// MIN-180 le dépôt vérifie avec `typescript@7`, qui ne livre plus l'API du
// compilateur. Même raison qu'à `subagent-runner-init.test.ts`, dont ce test
// reprend la forme — il lui faut un TypeScript en JS pour lire un arbre.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-223 — RIEN DE CE QUI PARTIRA DANS LA MICROVM NE DOIT POUVOIR ATTEINDRE UN
 * SECRET.
 *
 * Le contrat que ce test tient. La politique réseau fait que la VM ne DÉTIENT
 * aucun secret : le firewall pose la clé LLM après la sortie, et le plan de
 * contrôle prouve l'identité du run par un OIDC de la plateforme. Toute cette
 * construction s'effondre le jour où un module du bundle VM importe le client
 * Supabase en clé de service, ou lit `OPENROUTER_API_KEY` : la clé serait alors
 * dans l'environnement du process où le modèle exécute du shell arbitraire, et
 * un `env` suffirait.
 *
 * POURQUOI UN TEST STRUCTUREL, et pas une relecture. La faute n'a aucun symptôme :
 * le bundle grossit, tout fonctionne, et le trou n'existe que dans le graphe
 * d'imports. Elle s'introduit en une ligne — « je vais juste lire cette
 * préférence ici » — et personne ne la voit passer en revue de code, parce que
 * le module fautif, lu seul, est parfaitement raisonnable. C'est exactement la
 * forme d'un défaut qui se garde par un test et pas autrement.
 *
 * LES IMPORTS DE TYPE NE COMPTENT PAS, et c'est le point technique du fichier :
 * un `import type` disparaît à la compilation, donc n'existe pas dans le bundle.
 * `abandoned-spend.ts` importe `NormalizedUsage` d'`ai-usage.ts` de cette
 * façon — le compter donnerait une brèche imaginaire et le test crierait au loup
 * dès le premier jour. D'où la lecture de l'ARBRE plutôt qu'un `grep`.
 */

const REPO = process.cwd();

/**
 * L'ENTRÉE DU BUNDLE VM — UNE, désormais, et c'est celle qu'esbuild compile
 * (`scripts/build-agent-vm.mjs`). Depuis MIN-224 la liste n'est plus écrite à la
 * main : le graphe est parcouru depuis le vrai point d'entrée du harness, donc ce
 * que le test regarde est EXACTEMENT ce qui part dans la microVM. Un module tiré
 * par un nouvel import y entre sans que personne n'ait à penser à l'ajouter ici —
 * et c'est précisément le moment où ce test a quelque chose à dire.
 */
const VM_BUNDLE_ENTRIES = ["lib/server/agent/vm/main.ts"];

/** Ce qu'aucun module du bundle ne doit atteindre. */
const FORBIDDEN_MODULES = ["@/lib/supabase-service", "@supabase/supabase-js"];
const FORBIDDEN_ENV = ["OPENROUTER_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/**
 * AUCUNE BRÈCHE, et la liste est vide pour de bon depuis MIN-224.
 *
 * Celle qui restait — `agent-loop.ts` important `recordAiUsage` pour écrire au
 * ledger l'essai de stream abandonné (MIN-216) — était une dette écrite en
 * attendant que la boucle bouge. Elle a bougé : l'écriture passe maintenant par
 * `params.recordUsage`, que la fonction câble sur `recordAiUsage` et que la
 * microVM câble sur `POST /api/agent-vm/usage`. La boucle ne connaît plus le
 * chemin de la base.
 *
 * Ce tableau reste — vide — parce que c'est LUI qui rend le test lisible en
 * échec : une brèche qui apparaît se compare à « rien », pas à un `[]` anonyme.
 */
const KNOWN_BREACHES: string[] = [];

/** Résout un spécificateur d'import vers un fichier du dépôt, ou null (paquet). */
function resolveSpecifier(spec: string, from: string): string | null {
  const base = spec.startsWith("@/")
    ? join(REPO, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Les spécificateurs qu'un module tire À L'EXÉCUTION. Un `import type`, et un
 * import nommé dont TOUS les spécificateurs sont des types, ne survivent pas à
 * la compilation : ils ne sont pas des arêtes du bundle.
 */
function runtimeImports(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
  const out: string[] = [];
  const push = (node: ts.Node) => {
    if (ts.isStringLiteral(node)) out.push(node.text);
  };
  for (const stmt of src.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      if (
        clause &&
        !clause.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.every((e) => e.isTypeOnly)
      ) {
        continue;
      }
      push(stmt.moduleSpecifier);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && !stmt.isTypeOnly) {
      // Un ré-export tire le module à l'exécution, exactement comme un import.
      push(stmt.moduleSpecifier);
    }
  }
  // `await import("…")` : dynamique, mais toujours une arête du bundle.
  for (const m of readFileSync(file, "utf8").matchAll(/import\(\s*"([^"]+)"/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Toutes les brèches atteignables depuis les entrées, rendues comme le CHEMIN
 * D'IMPORT complet (`entrée → … → cible`).
 *
 * Le chemin et pas seulement la cible : « ai-usage.ts importe supabase-service »
 * est vrai partout dans le dépôt et n'apprend rien ; ce qui compte est par où le
 * bundle VM y arrive, parce que c'est cette arête-là qu'on coupe. Parcours en
 * LARGEUR pour que le chemin rapporté soit le plus court — donc le plus proche de
 * l'endroit où il y a quelque chose à faire.
 */
function breaches(): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  const queue: Array<{ file: string; path: string[] }> = VM_BUNDLE_ENTRIES.map((e) => ({
    file: join(REPO, e),
    path: [e],
  }));
  while (queue.length) {
    const { file, path } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const text = readFileSync(file, "utf8");
    for (const name of FORBIDDEN_ENV) {
      if (text.includes(`process.env.${name}`)) found.add([...path, `process.env.${name}`].join(" → "));
    }

    for (const spec of runtimeImports(file)) {
      if (FORBIDDEN_MODULES.includes(spec)) {
        found.add([...path, spec].join(" → "));
        continue;
      }
      const resolved = resolveSpecifier(spec, file);
      if (resolved && !seen.has(resolved)) {
        queue.push({ file: resolved, path: [...path, relative(REPO, resolved)] });
      }
    }
  }
  return [...found].sort();
}

describe("le bundle VM n'atteint aucun secret", () => {
  it("n'a pas d'autre brèche que celles qui sont écrites", () => {
    // Le message d'échec doit se lire sans ouvrir le test : c'est un chemin
    // d'import, et il dit quoi retirer.
    expect(breaches()).toEqual([...KNOWN_BREACHES].sort());
  });

  it("n'a plus de dette du tout — la dernière est partie avec la boucle", () => {
    expect(KNOWN_BREACHES).toHaveLength(0);
    // Les deux moitiés de ce qui l'a remplacée : la surface côté fonction, et le
    // fait que la boucle prenne son écriture en paramètre plutôt qu'en import.
    const controlPlane = readFileSync(join(REPO, "lib/server/agent/control-plane.ts"), "utf8");
    expect(controlPlane).toContain('surface === "/usage"');
    // Et le fait que le harness prenne son écriture en PARAMÈTRE plutôt qu'en
    // import : le superviseur reçoit `recordUsage`, il ne va pas le chercher.
    const supervisor = readFileSync(join(REPO, "lib/server/agent/vm/supervisor.ts"), "utf8");
    expect(supervisor).not.toContain('from "@/lib/server/ai-usage"');
  });

  it("part bien du point d'entrée que le build compile", () => {
    for (const entry of VM_BUNDLE_ENTRIES) {
      expect(existsSync(join(REPO, entry)), `${entry} n'existe plus`).toBe(true);
    }
    // Le test et le build doivent regarder le MÊME fichier : deux chemins écrits
    // à la main de part et d'autre finiraient par diverger, et le test garderait
    // alors un bundle qui n'est plus celui qu'on livre.
    const build = readFileSync(join(REPO, "scripts/build-agent-vm.mjs"), "utf8");
    for (const entry of VM_BUNDLE_ENTRIES) expect(build).toContain(entry);
  });

  it("ne compte pas un import de TYPE comme une arête du bundle", () => {
    // Le garde-fou du garde-fou : `agent-contract.ts` importe `AiFeature` et
    // `AiUsageBillTo` d'`ai-usage-shape.ts` en type seul, et rien d'autre. Si ce
    // test-ci tombe, `breaches()` est devenu un `grep` déguisé et signalera des
    // brèches qui n'existent pas.
    const contract = join(REPO, "lib/server/agent/agent-contract.ts");
    expect(runtimeImports(contract)).toEqual([]);
  });
});
