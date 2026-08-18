import { readFileSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

// `typescript-api` is an alias for `typescript@5` (see package.json). Since
// MIN-180 the repository checks with `typescript@7`, which no longer ships the
// compiler API. As in `subagent-runner-init.test.ts`, this test therefore uses
// TypeScript from JavaScript to inspect a syntax tree.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-223 — NOTHING THAT GOES INTO THE MICROVM SHOULD BE ABLE TO ACHIEVE A
 * SECRET.
 *
 * The contract enforced by this test is that the VM must not hold any secrets.
 * The network policy sets the LLM key after the VM exits, and the control plane
 * proves the run's identity with a platform OIDC token. This whole construction
 * collapses if a module in the VM bundle imports the Supabase service client or
 * reads `OPENROUTER_API_KEY`: the key would then be present in the environment
 * where the model can execute arbitrary shell commands, and `env` would be enough.
 *
 * WHY A STRUCTURAL TEST, rather than a proofread. The fault has no symptoms:
 * the bundle grows, everything works, and the hole exists only in the import
 * graph. It can appear in one innocent line — "I'm just going to read this
 * preference here" — and no one notices during review because the offending
 * module is perfectly reasonable in isolation. This is exactly the kind of
 * defect that must be preserved by a test.
 *
 * WHAT IT DOES NOT KEEP, AND YOU SHOULD KNOW THIS BEFORE RELYING ON IT (MIN-357).
 * This test inspects the GRAPH IMPORTS and reads of `process.env` — not
 * payloads. A secret that arrives at the harness through the job, through a response from the
 * control plane or through a header will leave it green whatever we do: this is exactly
 * the case of the local path, where the execution token travels in `job.json` and where the
 * model key is SERVED to the harness (`/llm-key`). The guardrail which held
 * MIN-223 says nothing about this construction site; what holds it together are the tests for
 * `llm-proxy.ts`, `control-plane.ts` and `local-exec.ts`.
 *
 * TYPE IMPORTS DO NOT COUNT, and that is the technical point of this file:
 * a `import type` disappears on compilation, so does not exist in the bundle.
 * `abandoned-spend.ts` imports `NormalizedUsage` from `ai-usage.ts` this way.
 * Counting that import would report an imaginary breach and make the test cry
 * wolf from day one. Hence the syntax-tree traversal instead of a `grep`.
 */

const REPO = process.cwd();

/**
 * THE VM BUNDLE ENTRY — ONE, for now, and this is the one esbuild compiles
 * (`scripts/build-agent-vm.mjs`). Since MIN-224, the list is no longer written
 * manually: the graph is traversed from the real harness entry point, so what
 * this test examines is EXACTLY what goes into the microVM. A module pulled in
 * by a new import enters without anyone having to remember to add it here —
 * and that is precisely when this test has something to say.
 */
const VM_BUNDLE_ENTRIES = ["lib/server/agent/vm/main.ts"];

/** What no module in the bundle should achieve. */
const FORBIDDEN_MODULES = ["@/lib/supabase-service", "@supabase/supabase-js"];
const FORBIDDEN_ENV = ["OPENROUTER_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/**
 * NO BREACH, and the list is empty for good since MIN-224.
 *
 * The remaining entry — `agent-loop.ts` needed `recordAiUsage` to write the
 * aborted-stream ledger from MIN-216 — was a debt left while the loop was being
 * moved. It has moved: writes now go through `params.recordUsage`, which the
 * function connects to `recordAiUsage`, and the microVM connects to
 * `POST /api/agent-vm/usage`. The loop no longer knows the database path.
 *
 * This table remains empty because it makes failures readable: a newly detected
 * breach is compared with "nothing", rather than with an anonymous `[]`.
 */
const KNOWN_BREACHES: string[] = [];

/** Resolves an import specifier to a repository file, or null (package). */
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
 * The specifiers that a module pulls AT RUNTIME. An `import type`, and a named
 * import whose ALL specifiers are types, do not survive compilation: they are
 * not edges of the bundle.
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
      // A re-export pulls the module into execution, exactly like an import.
      push(stmt.moduleSpecifier);
    }
  }
  // `await import("…")`: dynamic, but still an edge of the bundle.
  for (const m of readFileSync(file, "utf8").matchAll(/import\(\s*"([^"]+)"/g)) {
    out.push(m[1]);
  }
  return out;
}

/**
 * All breaches reachable from the entries, rendered as the complete IMPORT
 * PATH (`entry → … → target`).
 *
 * The path matters, not just the target: “ai-usage.ts imports supabase-service”
 * is true throughout the repository and tells us nothing. What matters is how
 * the VM bundle reaches it, because that is the edge we need to cut. Traverse
 * breadth-first so the reported path is the shortest one — and therefore the
 * closest to the place where action is needed.
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
    // The failure message should make sense without opening the test: it is an
    // import path, and it says what to remove.
    expect(breaches()).toEqual([...KNOWN_BREACHES].sort());
  });

  it("n'a plus de dette du tout — la dernière est partie avec la boucle", () => {
    expect(KNOWN_BREACHES).toHaveLength(0);
    // The two halves of what replaced it: the surface on the function side, and
    // the loop taking its writer as a parameter rather than as an import.
    const controlPlane = readFileSync(join(REPO, "lib/server/agent/control-plane.ts"), "utf8");
    expect(controlPlane).toContain('surface === "/usage"');
    // And the fact that the harness receives the writer as a PARAMETER rather
    // than an import: the supervisor receives `recordUsage` and does not fetch it.
    const supervisor = readFileSync(join(REPO, "lib/server/agent/vm/supervisor.ts"), "utf8");
    expect(supervisor).not.toContain('from "@/lib/server/ai-usage"');
  });

  it("part bien du point d'entrée que le build compile", () => {
    for (const entry of VM_BUNDLE_ENTRIES) {
      expect(existsSync(join(REPO, entry)), `${entry} n'existe plus`).toBe(true);
    }
    // The test and the build must inspect the SAME file: two paths maintained
    // by hand would eventually diverge, and the test would then validate a
    // bundle that is no longer the one we deliver.
    const build = readFileSync(join(REPO, "scripts/build-agent-vm.mjs"), "utf8");
    for (const entry of VM_BUNDLE_ENTRIES) expect(build).toContain(entry);
  });

  it("ne compte pas un import de TYPE comme une arête du bundle", () => {
    // The guardrail behind the guardrail: `agent-contract.ts` imports `AiFeature`
    // and `AiUsageBillTo` from `ai-usage-shape.ts` as types only, and nothing else.
    // If this test fails, `breaches()` has become a disguised `grep` and will
    // report breaches that do not exist.
    const contract = join(REPO, "lib/server/agent/agent-contract.ts");
    expect(runtimeImports(contract)).toEqual([]);
  });
});
