import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIVE_AGENT_ENGINES, type LiveAgentEngine } from "@/lib/agent-engines";
import { redactDeep, SecretRedactor } from "./redact";

/**
 * MIN-328 — THE SUBSTITUTION OF SECRETS, ENGINE BY ENGINE.
 *
 * The invariant of MIN-239 is in one sentence: **the forge token does not reach
 * never the model, and never enter into what we persist**. It was true
 * when there was only one harness — the homemade buckle made each
 * message `role:"tool"` and substituted it in passing. A second engine arrived,
 * it has become THE engine, and it executes its tools without going through us again:
 * the invariant remained written as a comment while the path it described
 * was no longer borrowed by anyone. Nobody saw it, because a secret that
 * passe ne casse rien.
 *
 * Hence this test, and its form: it iterates on `LIVE_AGENT_ENGINES`, the engines which
 * can still play a trick. AN MORE engine without entry into the table
 * below drops the sequel — it's exactly like that
 * that it has passed, and it is the only place in the depot that would notice it.
 *
 * Lexical rather than runtime, like [engine-wiring.test.ts](engine-wiring.test.ts):
 * These paths require a microVM, an opencode server, and a provider. THE
 * BEHAVIOR is proven elsewhere, on the real code — `llm-proxy.test.ts`
 * (the outgoing body), `supervisor.test.ts` (the pushed log), and this file
 * for depth substitution.
 */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

/** Which must be true, for each engine, on the path to the model. */
const CHECKS: Record<LiveAgentEngine, Array<{ what: string; file: string; contains: string }>> = {
  opencode: [
    {
      what: "le corps sortant vers le fournisseur est substitué",
      file: "vm/llm-proxy.ts",
      contains: "if (opts.redact) body = opts.redact(body)",
    },
    {
      // The field alone, not the entire call: the call gained an option in MIN-357
      // (the key to the model on a local tour) and will win others. What we
      // guard here is that the register ARRIVES there, not the form of the day.
      what: "le superviseur donne bien son registre au proxy",
      file: "vm/supervisor.ts",
      contains: "redact: secrets.redact,",
    },
    {
      what: "le journal poussé en base est substitué",
      file: "vm/supervisor.ts",
      contains: "redactDeep(raw, secrets.redact)",
    },
    {
      what: "le fil d'events l'est en profondeur",
      file: "vm/supervisor.ts",
      contains: "return redactDeep(payload, secrets.redact)",
    },
  ],
};

describe("chaque moteur substitue les secrets avant le modèle", () => {
  it("aucun moteur déclaré n'est laissé sans garde", () => {
    // The heart of the test: adding a motor without saying what protects it fails HERE,
    // with the name of the engine, rather than six months later in an audit.
    for (const engine of LIVE_AGENT_ENGINES) {
      expect(CHECKS[engine], `le moteur "${engine}" n'a aucune garde déclarée`).toBeTruthy();
      expect(CHECKS[engine].length).toBeGreaterThan(0);
    }
  });

  for (const engine of LIVE_AGENT_ENGINES) {
    for (const check of CHECKS[engine] ?? []) {
      it(`${engine} — ${check.what}`, () => {
        expect(read(check.file)).toContain(check.contains);
      });
    }
  }
});

/**
 * MIN-328 — “IN DEPTH” WAS A COMMENT, NOT CODE.
 *
 * `redactPayload` announced a deep substitution and only processed the
 * first level. Opencode payloads are nested by construction
 * (`{ part: { state: { output } } }`, share tables): the secret passed,
 * and persisted in `agent_run_events`, rereadable by any member of the project.
 */
describe("la substitution descend dans les payloads imbriqués", () => {
  const TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
  const secrets = new SecretRedactor();
  secrets.add(TOKEN);

  it("substitue à trois niveaux, tableaux compris", () => {
    const out = redactDeep(
      {
        name: "bash",
        preview: `remote: ${TOKEN}`,
        state: {
          output: `url = https://x-access-token:${TOKEN}@github.com/org/repo.git`,
          parts: [{ text: `token ${TOKEN}` }, { text: "rien à cacher" }],
        },
      },
      secrets.redact,
    );
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(out)).toContain("[redacted]");
    // The FORM is intact: the thread and the newspaper are reread as before.
    expect(out).toMatchObject({
      name: "bash",
      state: { parts: [{ text: "token [redacted]" }, { text: "rien à cacher" }] },
    });
  });

  it("laisse passer ce qui n'est pas du texte", () => {
    const out = redactDeep({ n: 3, ok: true, nothing: null, when: undefined }, secrets.redact);
    expect(out).toEqual({ n: 3, ok: true, nothing: null, when: undefined });
  });
});

/**
 * MIN-327 — TWO TOKENS IN THE SAME ROUND, SO TWO TO SUBSTITUTE.
 *
 * Since the microVM token is no longer that of the function (`vmTarget`
 * against `target` in `execute.ts`), the secret register must bear the
 * TWO: it is that of the VM which is in `.git/config` and which `git remote -v`
 * sort, it is that of the function which appears in an error message of the
 * wrought. Saving just one would make the substitution true on half of the
 * paths — the exact failure mode of MIN-328, where a passing secret doesn't break
 * nothing and is nowhere to be seen.
 *
 * Lexical, like the rest of the file: the actual path requests a microVM.
 */
describe("le registre porte le token de la VM comme celui de la fonction", () => {
  const source = read("execute.ts");

  it("enregistre le token que la microVM détient", () => {
    expect(source).toContain("secrets.addAuthUrl(vmTarget.authUrl)");
    expect(source).toContain("secrets.add(vmTarget.token)");
  });

  it("enregistre toujours celui de la fonction", () => {
    expect(source).toContain("secrets.addAuthUrl(target.authUrl)");
    expect(source).toContain("secrets.add(target.token)");
  });

  it("ne laisse aucune URL de clone descendre dans la VM sans venir de `vmTarget`", () => {
    // The three gestures that write a token-authenticated URL INTO the microVM:
    // the clone of an ordinary run, that of a replay, and the loop job.
    // `target.authUrl` would be the original bug — a function token in a
    // `.git/config` that the model can read.
    for (const geste of [
      "await cloneRepo(sandboxHost(fresh, cloudLayout()), {\n          authUrl: vmTarget.authUrl,",
      "authUrl: vmTarget.authUrl,\n            baseBranch,",
    ]) {
      expect(source).toContain(geste);
    }
  });
});
