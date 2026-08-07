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
 * L'ENTRÉE DU BUNDLE VM — la liste, écrite ici, de ce que MIN-224 descendra dans
 * la microVM (cf. docs/orchestrateur-process-long.md §3 : « tout ce qui n'est pas
 * dans la liste de ce qui reste dans la fonction part dans la VM »). Le graphe
 * est parcouru depuis ces racines ; ajouter un module au bundle, c'est l'ajouter
 * ici, et c'est le moment où le test a quelque chose à dire.
 */
const VM_BUNDLE_ENTRIES = [
  "lib/server/agent/agent-loop.ts",
  "lib/server/agent/tools.ts",
  "lib/server/agent/prompt.ts",
  "lib/server/agent/subagent.ts",
  "lib/server/agent/edit.ts",
  "lib/server/agent/compact.ts",
  "lib/server/agent/prune.ts",
  "lib/server/agent/command-guard.ts",
  "lib/server/agent/repo-path.ts",
  "lib/server/agent/command-output.ts",
  "lib/server/agent/background.ts",
];

/** Ce qu'aucun module du bundle ne doit atteindre. */
const FORBIDDEN_MODULES = ["@/lib/supabase-service", "@supabase/supabase-js"];
const FORBIDDEN_ENV = ["OPENROUTER_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/**
 * LA SEULE BRÈCHE CONNUE, et elle est datée. `agent-loop.ts` importe
 * `recordAiUsage` pour écrire au ledger l'essai de stream abandonné (MIN-216) —
 * c'est un appel Supabase en clé de service, au beau milieu de ce qui doit
 * descendre dans la VM.
 *
 * Elle est ici plutôt que corrigée parce que ce ticket ne déplace pas une ligne
 * de la boucle : la corriger, c'est faire passer cette écriture par
 * `POST /api/agent-vm/usage`, et c'est MIN-224. Ce que le test garde en
 * attendant : que la liste ne GRANDISSE pas. Une deuxième brèche serait une
 * régression ; celle-ci est une dette écrite.
 */
const KNOWN_BREACHES = [
  "lib/server/agent/agent-loop.ts → lib/server/ai-usage.ts → @/lib/supabase-service",
];

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

  it("garde la dette bornée — une brèche, celle de MIN-216, et elle a un remplaçant", () => {
    expect(KNOWN_BREACHES).toHaveLength(1);
    // Le remplaçant existe déjà : la surface `POST /usage` du plan de contrôle.
    const controlPlane = readFileSync(join(REPO, "lib/server/agent/control-plane.ts"), "utf8");
    expect(controlPlane).toContain('surface === "/usage"');
  });

  it("compte les entrées du bundle, pour qu'un ajout se voie", () => {
    for (const entry of VM_BUNDLE_ENTRIES) {
      expect(existsSync(join(REPO, entry)), `${entry} n'existe plus`).toBe(true);
    }
  });

  it("ne compte pas un import de TYPE comme une arête du bundle", () => {
    // Le garde-fou du garde-fou : `abandoned-spend.ts` importe `NormalizedUsage`
    // d'`ai-usage.ts` en type seul. Si ce test-ci tombe, `breaches()` est devenu
    // un `grep` déguisé et signalera des brèches qui n'existent pas.
    const spend = join(REPO, "lib/server/agent/abandoned-spend.ts");
    expect(runtimeImports(spend)).not.toContain("@/lib/server/ai-usage");
  });
});
