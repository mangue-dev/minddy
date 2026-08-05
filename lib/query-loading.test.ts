import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le drapeau de chargement de l'UI se lit sur le STATUT (`isPending`), jamais
 * sur le vol en cours (`isLoading`).
 *
 * Pourquoi. Le cache est réhydraté depuis localStorage au montage
 * (`PersistQueryClientProvider`, lib/query-provider.tsx), et cette restauration
 * est ASYNCHRONE : le premier rendu se peint avant qu'elle ne rende la main.
 * Pendant cette fenêtre, react-query force `fetchStatus: "idle"` sur toutes les
 * queries — elles sont en `pending`, sans donnée, mais rien n'est en vol. Or
 * `isLoading = isPending && isFetching` (v5) : il vaut donc FAUX alors qu'il n'y
 * a encore rien à montrer.
 *
 * Ce que ça donnait à l'écran : chaque page peignait son état vide — « aucun
 * ticket », « aucune session », « corbeille vide » — le temps d'une image, puis
 * son squelette, puis son contenu. Sur TOUTES les pages, à chaque chargement,
 * parce que la cause est le provider commun et pas telle ou telle page.
 *
 * `isPending` dit exactement « aucune donnée » : il couvre la restauration comme
 * le premier fetch. Sa seule contrepartie est qu'une query DÉSACTIVÉE reste
 * `pending` pour toujours — d'où le `enabled && isPending` des hooks à garde,
 * qui reprend la même expression que le `enabled` de la query.
 *
 * Ce test est structurel parce que rien d'autre ne peut l'être : les deux
 * drapeaux ont le même type, la même forme d'appel, et l'un des deux est
 * silencieusement faux. Un type-check vert ne dit rien de ce contrat-là.
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
 * `const { data, isLoading } = useQuery({` — la lecture directe du résultat. La
 * classe `[^{}]` accepte les retours à la ligne : un destructuring écrit sur
 * plusieurs lignes est le même bug, et il ne doit pas passer sous le radar.
 */
const DESTRUCTURED = /\{[^{}]*\bisLoading\b[^{}]*\}\s*=\s*useQuery\s*\(/g;
/** `status.isLoading` — le résultat gardé en objet (deux queries dans un hook). */
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
    // Seuls les fichiers qui parlent à react-query sont concernés : `isLoading`
    // est aussi un nom de PROP tout à fait légitime ailleurs (cf. les champs du
    // command palette).
    if (!source.includes("@tanstack/react-query")) continue;
    const lines = source.split("\n");
    /** Ligne (1-based) d'un index de caractère dans le fichier. */
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
  it("se lit sur isPending, jamais sur isLoading", () => {
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
