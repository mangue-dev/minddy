import { describe, expect, it } from "vitest";
import {
  formatTypeErrors,
  parseTypeErrors,
  TYPE_ERRORS_MAX_CHARS,
} from "./diagnostics";

/**
 * MIN-110 — le type-check de fin de tour. La partie sandbox (lancer `tsc` dans la
 * microVM) n'est pas testable ici ; ce qui l'est, et qui décide de ce que le modèle
 * lit vraiment, c'est le PARSING de la sortie de tsc, l'ordre (les fichiers du tour
 * d'abord) et le cap. Les sorties ci-dessous sont copiées de vraies exécutions dans
 * la microVM.
 */

const REAL = `lib/plan.ts(253,7): error TS2322: Type 'string' is not assignable to type 'number'.
components/agent/agent-event-feed.tsx(88,3): error TS2554: Expected 2 arguments, but got 1.`;

describe("parseTypeErrors", () => {
  it("lit la forme de `tsc --pretty false`", () => {
    const entries = parseTypeErrors(REAL);
    expect(entries.map((e) => e.file)).toEqual([
      "lib/plan.ts",
      "components/agent/agent-event-feed.tsx",
    ]);
    expect(entries[0].text).toContain("TS2322");
  });

  it("rattache les élaborations indentées à leur erreur", () => {
    const raw = `lib/a.ts(1,1): error TS2345: Argument of type 'A' is not assignable to parameter of type 'B'.
  Types of property 'id' are incompatible.
    Type 'string' is not assignable to type 'number'.
lib/b.ts(2,2): error TS2304: Cannot find name 'foo'.`;
    const entries = parseTypeErrors(raw);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toContain("Types of property 'id' are incompatible.");
    expect(entries[1].text).toBe(`lib/b.ts(2,2): error TS2304: Cannot find name 'foo'.`);
  });

  it("jette les erreurs de configuration sans fichier — elles ne concernent pas le modèle", () => {
    const raw = `error TS5083: Cannot read file '/vercel/sandbox/repo/tsconfig.json'.`;
    expect(parseTypeErrors(raw)).toEqual([]);
  });

  it("ignore le bruit qui n'est pas une erreur", () => {
    expect(parseTypeErrors("")).toEqual([]);
    expect(parseTypeErrors("npm notice New minor version of npm available!")).toEqual([]);
  });
});

describe("formatTypeErrors", () => {
  it("se tait quand il n'y a rien à dire", () => {
    expect(formatTypeErrors("", ["lib/plan.ts"])).toBeNull();
    expect(formatTypeErrors("error TS5083: Cannot read file 'tsconfig.json'.", [])).toBeNull();
  });

  it("sert l'en-tête d'OpenCode et la consigne anti-boucle", () => {
    const block = formatTypeErrors(REAL, ["lib/plan.ts"]);
    expect(block).toContain("Type errors detected after your changes, please fix:");
    expect(block).toContain("TS2322");
    expect(block).toContain("do not fix it");
  });

  it("met les fichiers du tour EN TÊTE, le reste du dépôt derrière", () => {
    const block = formatTypeErrors(REAL, ["components/agent/agent-event-feed.tsx"]) ?? "";
    const mine = block.indexOf("agent-event-feed.tsx");
    const other = block.indexOf("lib/plan.ts");
    expect(mine).toBeGreaterThan(-1);
    expect(mine).toBeLessThan(other);
  });

  it("compare les chemins à une forme unique (`./lib/a.ts` = `lib/a.ts`)", () => {
    const raw = `lib/z.ts(1,1): error TS1: nope.
lib/a.ts(1,1): error TS2: nope.`;
    const block = formatTypeErrors(raw, ["./lib/a.ts"]) ?? "";
    expect(block.indexOf("lib/a.ts")).toBeLessThan(block.indexOf("lib/z.ts"));
  });

  it("cape le bloc et dit combien d'erreurs il cache", () => {
    const many = Array.from(
      { length: 200 },
      (_, i) => `lib/f${i}.ts(1,1): error TS2322: Type 'string' is not assignable to type 'number'.`,
    ).join("\n");
    const block = formatTypeErrors(many, []) ?? "";
    // Le cap porte sur les erreurs ; en-tête et consigne s'ajoutent par-dessus.
    expect(block.length).toBeLessThan(TYPE_ERRORS_MAX_CHARS + 400);
    expect(block).toMatch(/… and \d+ more errors\./);
    // Aucune ligne d'erreur coupée au milieu : un chemin tronqué envoie le modèle
    // éditer un fichier qui n'existe pas.
    for (const line of block.split("\n")) {
      if (line.includes("error TS")) expect(line).toMatch(/\.$/);
    }
  });

  it("sert quand même une erreur unique plus grosse que le cap, tronquée", () => {
    const huge = `lib/a.ts(1,1): error TS2345: ${"x".repeat(TYPE_ERRORS_MAX_CHARS * 2)}`;
    const block = formatTypeErrors(huge, ["lib/a.ts"]) ?? "";
    expect(block).toContain("lib/a.ts(1,1)");
    expect(block.length).toBeLessThan(TYPE_ERRORS_MAX_CHARS + 400);
  });

  it("un seul reste caché → singulier", () => {
    const raw = Array.from(
      { length: 40 },
      (_, i) => `lib/f${i}.ts(1,1): error TS2322: ${"y".repeat(45)}.`,
    ).join("\n");
    const block = formatTypeErrors(raw, []) ?? "";
    const hidden = /… and (\d+) more error(s?)\./.exec(block);
    expect(hidden).not.toBeNull();
    if (hidden && hidden[1] === "1") expect(hidden[2]).toBe("");
  });
});
