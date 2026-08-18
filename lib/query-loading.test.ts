import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The UI loading flag reads on STATUS (`isPending`), never
 * on the current flight (`isLoading`).
 *
 * Why. The cache is rehydrated from localStorage on mount
 * (`PersistQueryClientProvider`, lib/query-provider.tsx), and this restore
 * is ASYNCHRONOUS: the first render is painted before it returns.
 * During this window, react-query forces `fetchStatus: "idle"` to all
 * queries — they are in `pending`, with no data, but nothing is in flight. Or
 * `isLoading = isPending && isFetching` (v5): it is therefore FALSE while there
 * still has nothing to show.
 *
 * What it looked like on the screen: each page painted its empty state — “none
 * ticket », “no session”, “empty trash” — the time of an image, then
 * its skeleton, then its contents. On ALL pages, on each load,
 * because the cause is the common provider and not this or that page.
 *
 * `isPending` says exactly "no data": it covers the restore like
 * the first fetch. Its only counterpart is that a DEACTIVATED query remains
 * `pending` forever — hence the `enabled && isPending` of the guarded hooks,
 * which uses the same expression as the `enabled` of the query.
 *
 * This test is structural because nothing else can be: both
 * flags have the same type, the same form of calling, and one of them is
 * silently false. A green type-check says nothing about this contract.
 */

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return out;
}

/**
 * `const { data, isLoading } = useQuery({` — direct reading of the result. The
 * class `[^{}]` accepts newlines: destructuring written to
 * multiple lines is the same bug, and it should not fly under the radar.
 */
const DESTRUCTURED = /\{[^{}]*\bisLoading\b[^{}]*\}\s*=\s*useQuery\s*\(/g;
/** `status.isLoading` — the result kept as an object (two queries in a hook). */
const MEMBER_ACCESS = /\.isLoading\b/g;

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  for (const file of sourceFiles()) {
    const source = readFileSync(file, "utf8");
    // Only files that talk to react-query are affected: `isLoading`
    // is also a completely legitimate PROP name elsewhere (see the fields of
    // command palette).
    if (!source.includes("@tanstack/react-query")) continue;
    const lines = source.split("\n");
    /** Line (1-based) of a character index in the file. */
    const lineAt = (index: number) => source.slice(0, index).split("\n").length;
    for (const pattern of [DESTRUCTURED, MEMBER_ACCESS]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = lineAt(match.index ?? 0);
        violations.push({
          file: file.slice(ROOT.length + 1),
          line,
          text: (lines[line - 1] ?? "").trim(),
        });
      }
    }
  }
  return violations;
}

describe("le drapeau de chargement", () => {
  it("reads from isPending, never from isLoading", () => {
    const violations = findViolations();
    const report = violations
      .map((v) => `${v.file}:${v.line}\n    ${v.text}`)
      .join("\n");
    expect(
      violations,
      `\`isLoading\` vaut FAUX pendant la réhydratation du cache disque, alors ` +
        `qu'il n'y a encore aucune donnée : l'écran vide s'y peint avant le ` +
        `contenu. Lire \`isPending\` (et \`enabled && isPending\` si la query a ` +
        `une garde). Voir l'en-tête de ce fichier.\n${report}`
    ).toEqual([]);
  });
});
