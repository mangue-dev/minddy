import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIVE_AGENT_ENGINES, type LiveAgentEngine } from "@/lib/agent-engines";
import { redactDeep, SecretRedactor } from "./redact";

/** Every declared harness must protect provider output and persistent events. */

function read(file: string): string {
  return readFileSync(join(__dirname, file), "utf8");
}

/** Which must be true, for each engine, on the path to the model. */
const nativeChecks = [{ what: "native outputs are recursively redacted", file: "vm/native-supervisor.ts",
  contains: "redactDeep" }, { what: "provider credentials are registered before invocation", file: "vm/native-supervisor.ts",
  contains: "SecretRedactor" }];
const CHECKS: Record<LiveAgentEngine, Array<{ what: string; file: string; contains: string }>> = {
  codex: nativeChecks,
  claude_code: nativeChecks,
  opencode: [
    {
      what: "outbound provider bodies are redacted",
      file: "vm/llm-proxy.ts",
      contains: "if (opts.redact) body = opts.redact(body)",
    },
    {
      // The field alone, not the entire call: the call gained an option in MIN-357
      // (the key to the model on a local tour) and will win others. What we
      // guard here is that the register ARRIVES there, not the form of the day.
      what: "the supervisor shares its redactor with the proxy",
      file: "vm/supervisor.ts",
      contains: "redact: secrets.redact,",
    },
    {
      what: "persisted journals are redacted",
      file: "vm/supervisor.ts",
      contains: "redactDeep(raw, secrets.redact)",
    },
    {
      what: "event payloads are recursively redacted",
      file: "vm/supervisor.ts",
      contains: "return redactDeep(payload, secrets.redact)",
    },
  ],
};

describe("every engine redacts secrets before model access", () => {
  it("every declared engine has a redaction guard", () => {
    // The heart of the test: adding a motor without saying what protects it fails HERE,
    // with the name of the engine, rather than six months later in an audit.
    for (const engine of LIVE_AGENT_ENGINES) {
      expect(CHECKS[engine], `engine "${engine}" has no declared guard`).toBeTruthy();
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
describe("redaction handles nested payloads", () => {
  const TOKEN = "ghs_16C7e42F292c6912E7710c838347Ae178B4a";
  const secrets = new SecretRedactor();
  secrets.add(TOKEN);

  it("redacts three levels including arrays", () => {
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

  it("preserves non-text values", () => {
    const out = redactDeep({ n: 3, ok: true, nothing: null, when: undefined }, secrets.redact);
    expect(out).toEqual({ n: 3, ok: true, nothing: null, when: undefined });
  });
});

/**
 * MIN-421 — forge credentials are registered for server-side error redaction,
 * but only a credential-free URL or a run-scoped relay URL enters the VM job.
 * These lexical assertions cover the cloud bootstrap without requiring a real
 * Vercel sandbox.
 */
describe("forge credentials stop at the trusted sandbox boundary", () => {
  const source = read("execute.ts");

  it("registers the infrastructure-held token for redaction", () => {
    expect(source).toContain("secrets.addAuthUrl(vmTarget.authUrl)");
    expect(source).toContain("secrets.add(vmTarget.token)");
  });

  it("still registers the function credential", () => {
    expect(source).toContain("secrets.addAuthUrl(target.authUrl)");
    expect(source).toContain("secrets.add(target.token)");
  });

  it("never passes the authenticated forge URL to clone or the cloud VM job", () => {
    expect(source).toContain("return vmTarget.remoteUrl");
    expect(source).toContain("...(sandboxRepoUrl ? { authUrl: sandboxRepoUrl } : {})");
    expect(source).not.toContain("authUrl: vmTarget!.authUrl");
  });
});
