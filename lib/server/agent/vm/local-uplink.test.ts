import { describe, expect, it } from "vitest";

import {
  filterLocalPayload,
  foreignPaths,
  homeOf,
  scrubPaths,
  withheldOutput,
} from "./local-uplink";

/**
 * MIN-361 — WHAT COMES FROM THE USER'S MACHINE.
 *
 * PURE logic, tested like [local-exec-scope.test.ts](../local-exec-scope.test.ts):
 * we call, we assert. What matters here, and which decides the form of the
 * rule, is that **both errors cost**:
 *
 * - holding too little causes someone's disk to move up into a production base, 30 days, in front of the project members;
 * - holding too much dumps the thread of its honest outputs — and a guard that makes the
 * product unusable does not stay in place.
 *
 * Hence half of this file, which tests what should NOT be retained.
 */

const REPO = "/Users/clement/Projets/minddy";

describe("homeOf", () => {
  it("déduit la maison du dépôt, sans lire l'environnement", () => {
    expect(homeOf(REPO)).toBe("/Users/clement");
    expect(homeOf("/home/clement/code/minddy")).toBe("/home/clement");
    // The repository IS the home: the limiting case of the repository cloned at the root.
    expect(homeOf("/Users/clement")).toBe("/Users/clement");
  });

  it("rend null quand le dépôt vit ailleurs", () => {
    // No failure, no guessed fallback: there is then simply no `~` to
    // override, and `foreignPaths` continues to work on the rest.
    expect(homeOf("/srv/code/minddy")).toBeNull();
    expect(homeOf("/vercel/sandbox/repo")).toBeNull();
  });
});

describe("foreignPaths", () => {
  it("voit ce que le shell est allé lire ailleurs", () => {
    expect(foreignPaths("cat ~/.ssh/config", REPO)).toEqual(["~/.ssh/config"]);
    expect(foreignPaths("/Users/clement/clients/acme/.env", REPO)).toEqual([
      "/Users/clement/clients/acme/.env",
    ]);
    // SOMEONE ELSE's personal file names someone just as much.
    expect(foreignPaths("/Users/autre/Documents/notes.md", REPO)).toEqual([
      "/Users/autre/Documents/notes.md",
    ]);
    // A mounting point: external disk, NAS, USB key.
    expect(foreignPaths("/Volumes/Sauvegardes/2026/impots.pdf", REPO)).toEqual([
      "/Volumes/Sauvegardes/2026/impots.pdf",
    ]);
  });

  it("ne voit rien dans le dépôt attribué", () => {
    expect(foreignPaths(`${REPO}/lib/server/agent/vm/supervisor.ts`, REPO)).toEqual([]);
    expect(foreignPaths(`error at ${REPO}/app/page.tsx:42:11`, REPO)).toEqual([]);
  });

  it("ne voit rien dans ce qui est identique sur tous les Mac", () => {
    // This is what makes the guard tenable: these paths are in half of the
    // stack traces, and they don't say anything about anyone.
    const trace =
      "at Object.<anonymous> (/opt/homebrew/lib/node_modules/npm/index.js:1:1)\n" +
      "  /usr/bin/node --version\n" +
      "  /System/Library/Frameworks\n" +
      "  ENOENT: /etc/nginx/nginx.conf";
    expect(foreignPaths(trace, REPO)).toEqual([]);
  });

  it("développe `~` avant de juger", () => {
    // Without development, a cloned repository in the house would see its own
    // files counted as foreign.
    expect(foreignPaths("~/Projets/minddy/lib/x.ts", REPO)).toEqual([]);
    expect(foreignPaths("~/Projets/autre/lib/x.ts", REPO)).toEqual(["~/Projets/autre/lib/x.ts"]);
  });

  it("dédoublonne — le compte est celui des chemins, pas des occurrences", () => {
    expect(foreignPaths("~/.aws/credentials et encore ~/.aws/credentials", REPO)).toEqual([
      "~/.aws/credentials",
    ]);
  });
});

describe("scrubPaths", () => {
  it("rend le dépôt relatif et la maison anonyme", () => {
    expect(scrubPaths(`${REPO}/lib/x.ts`, REPO)).toBe("./lib/x.ts");
    expect(scrubPaths("/Users/clement/Téléchargements/x.zip", REPO)).toBe("~/Téléchargements/x.zip");
  });

  it("réécrit AUSSI ce qui est dans le dépôt — c'est le fond de l'affaire", () => {
    // `/Users/<prénom nom>` is not in suspicious outputs, it is in
    // all: a rule that would only look at what leaves the repository on
    // would let it pass in full.
    const trace = `TypeError at ${REPO}/app/page.tsx:42\n  at ${REPO}/lib/x.ts:7`;
    expect(scrubPaths(trace, REPO)).toBe("TypeError at ./app/page.tsx:42\n  at ./lib/x.ts:7");
    expect(scrubPaths(trace, REPO)).not.toContain("clement");
  });

  it("laisse un chemin utilisable", () => {
    // What is rewritten is reread by the model in the next round: `./lib/x.ts`
    // from the repository and `~/…` for the shell remain valid paths.
    expect(scrubPaths(`cd ${REPO} && cat ${REPO}/package.json`, REPO)).toBe(
      "cd . && cat ./package.json",
    );
  });

  it("ne touche pas à ce qui n'est pas un chemin de machine", () => {
    expect(scrubPaths("npm run typecheck → 0 erreur", REPO)).toBe("npm run typecheck → 0 erreur");
    expect(scrubPaths("/usr/bin/node", REPO)).toBe("/usr/bin/node");
  });

  it("fonctionne sans maison connue", () => {
    expect(scrubPaths("/srv/code/minddy/lib/x.ts", "/srv/code/minddy")).toBe("./lib/x.ts");
  });
});

describe("filterLocalPayload", () => {
  it("descend dans les charges imbriquées, comme la substitution des secrets", () => {
    const { payload, foreign, foreignCount } = filterLocalPayload(
      {
        name: "run_command",
        state: {
          command: `cd ${REPO} && cat ~/.ssh/config`,
          parts: [{ text: `${REPO}/lib/x.ts` }, { text: "/Users/clement/.aws/credentials" }],
        },
      },
      REPO,
    );
    expect(payload).toEqual({
      name: "run_command",
      state: {
        command: "cd . && cat ~/.ssh/config",
        parts: [{ text: "./lib/x.ts" }, { text: "~/.aws/credentials" }],
      },
    });
    expect(foreign).toBe(true);
    expect(foreignCount).toBe(2);
  });

  it("ne signale rien sur une charge qui ne parle que du dépôt", () => {
    const { foreign, foreignCount } = filterLocalPayload(
      { name: "read_file", path: `${REPO}/lib/x.ts`, preview: "export const x = 1;" },
      REPO,
    );
    expect(foreign).toBe(false);
    expect(foreignCount).toBe(0);
  });

  it("laisse passer ce qui n'est pas du texte", () => {
    const { payload } = filterLocalPayload(
      { n: 3, ok: true, nothing: null, when: undefined },
      REPO,
    );
    expect(payload).toEqual({ n: 3, ok: true, nothing: null, when: undefined });
  });
});

describe("withheldOutput", () => {
  it("dit ce qui manque, et pourquoi — au modèle autant qu'à l'humain", () => {
    const text = withheldOutput(4312, 2);
    expect(text).toContain("4312");
    expect(text).toContain("2 path(s)");
    // The model SAW the output when the tool turned: without this sentence, it
    // reread a gap and repeat the gesture.
    expect(text).toContain("you saw the output when the tool ran");
  });
});
