import { describe, expect, it } from "vitest";

import { fitReadResult } from "./exec-tool";
import { toolMemoryKey } from "./agent-loop";
import { TOOL_RESULT_MAX_CHARS } from "./prune";
import type { ReadWindow } from "./repo-host";

/**
 * MIN-248, constat annexe : un `read_file` qui MENT sur ce qu'il rend.
 *
 * Le résultat d'un tool traverse `JSON.stringify` puis `headTail`, qui élide le
 * MILIEU. Une lecture de fichier entier de 45 Ko sortait donc à ~6 Ko trouée en son
 * centre — et le pied de page ne disait rien, parce qu'il ne parlait que de la
 * FENÊTRE demandée (`win.truncated`). Le modèle croyait avoir tout lu, ne trouvait
 * pas ce qu'il cherchait, et relisait. C'est la moitié du tapis roulant.
 */

/** Une fenêtre de `lines` lignes numérotées, de `chars` caractères chacune. */
function window(lines: number, chars: number, opts?: Partial<ReadWindow>): ReadWindow {
  const startLine = opts?.startLine ?? 1;
  const numbered = Array.from({ length: lines }, (_, i) => `${startLine + i}\t${"a".repeat(chars)}`);
  return {
    content: numbered.join("\n"),
    totalLines: lines,
    returnedLines: lines,
    truncated: false,
    ...opts,
    startLine,
  };
}

const jsonSize = (s: string) => JSON.stringify(s).length;

describe("fitReadResult", () => {
  it("laisse une petite lecture intacte, sans pied de page", () => {
    const win = window(10, 20);
    expect(fitReadResult(win.content, win)).toBe(win.content);
  });

  it("garde le pied de page de FENÊTRE quand tout tient", () => {
    const win = window(50, 20, { totalLines: 500, truncated: true });
    const out = fitReadResult(win.content, win);
    expect(out).toContain("[Showing lines 1-50 of 500. Use offset/limit to read more.]");
  });

  it("coupe par la QUEUE et le DIT, au lieu de trouer le milieu en silence", () => {
    // 45 Ko demandés, 6 Ko de budget : le cas du ticket.
    const win = window(600, 75);
    expect(jsonSize(win.content)).toBeGreaterThan(40_000);

    const out = fitReadResult(win.content, win);

    // 1. Ça tient dans le budget : `headTail` n'a plus rien à élider.
    expect(jsonSize(out)).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    // 2. Le DÉBUT est intact — pas de trou.
    expect(out.startsWith("1\t")).toBe(true);
    // 3. Et la coupe est ANNONCÉE, avec la dernière ligne réellement rendue.
    const last = out.split("\n\n[")[0].split("\n").length;
    expect(out).toContain(`showing lines 1-${last} of 600`);
    expect(out).toContain(`offset=${last + 1}`);
    expect(last).toBeGreaterThan(1);
    expect(last).toBeLessThan(600);
  });

  it("compte les lignes du FICHIER, pas celles du bloc de conventions en tête", () => {
    // Le bloc AGENTS.md (MIN-247) est collé devant la lecture : il n'est pas
    // numéroté, et le confondre avec du contenu décalerait le pied de page.
    const win = window(600, 75, { startLine: 101, totalLines: 5000 });
    const block = "# Conventions\nline\nline\nline";
    const out = fitReadResult(`${block}\n\n${win.content}`, win);

    expect(jsonSize(out)).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(out.startsWith("# Conventions")).toBe(true);
    expect(out).toContain("showing lines 101-");
    // La borne haute annoncée est celle de la dernière ligne NUMÉROTÉE rendue.
    const body = out.split("\n\n[Output truncated")[0];
    const lastNumbered = body.split("\n").filter((l) => /^\d+\t/.test(l)).pop() ?? "";
    const lastLine = Number(lastNumbered.split("\t")[0]);
    expect(out).toContain(`showing lines 101-${lastLine} of 5000`);
  });
});

/**
 * La clé de mémoire d'un appel de tool : ce qui décide quelle lecture survit à
 * l'élagage. `offset` et `limit` n'en font PAS partie — c'est par là que l'amnésie
 * passait (83 lectures du même fichier, jamais deux à la même fenêtre).
 */
describe("toolMemoryKey", () => {
  it("ignore la fenêtre : un chemin, une lecture", () => {
    const a = toolMemoryKey("read_file", { path: "components/agent/feed.tsx", offset: 1 });
    const b = toolMemoryKey("read_file", { path: "components/agent/feed.tsx", offset: 705, limit: 60 });
    expect(a).toBe(b);
    expect(a).toBe("read_file:components/agent/feed.tsx");
  });

  it("distingue deux chemins, et deux recherches", () => {
    expect(toolMemoryKey("read_file", { path: "a.ts" })).not.toBe(
      toolMemoryKey("read_file", { path: "b.ts" }),
    );
    expect(toolMemoryKey("grep", { pattern: "useAgentRuns" })).not.toBe(
      toolMemoryKey("grep", { pattern: "useAgentRun" }),
    );
    // `list_dir` et `read_file` sur le même chemin ne disent pas la même chose.
    expect(toolMemoryKey("list_dir", { path: "lib" })).not.toBe(
      toolMemoryKey("read_file", { path: "lib" }),
    );
  });

  it("ne garde RIEN d'un tool à effet, ni d'une commande", () => {
    // Un `run_command` dépend de l'état du dépôt à l'instant où il a tourné :
    // le garder indéfiniment mentirait sur un état qui a bougé depuis.
    expect(toolMemoryKey("run_command", { command: "pnpm test" })).toBeNull();
    expect(toolMemoryKey("apply_edits", { changes: [] })).toBeNull();
    expect(toolMemoryKey("create_pr", { title: "x" })).toBeNull();
  });
});
