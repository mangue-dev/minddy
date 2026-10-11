import { describe, expect, it } from "vitest";
import { isIP } from "node:net";
import type { NetworkPolicyRule } from "@vercel/sandbox";

import {
  AGENT_DENIED_EGRESS_SUBNETS,
  AGENT_LLM_PLACEHOLDER_KEY,
  AGENT_VM_PATH_PREFIX,
  admitSandboxCaller,
  agentForgeRemoteUrl,
  agentSandboxName,
  agentVmUrl,
  buildAgentNetworkPolicy,
  buildNativeAgentNetworkPolicy,
  resolveControlPlaneTenant,
  rotateAgentForgeCredential,
  runIdFromSandboxName,
} from "./network-policy";

/**
 * Preserve the measured MIN-223 boundary. A `startsWith` here would also
 * authorize `/api/v1/key`, allowing the microVM to provision its own keys.
 */

const OPENROUTER = "https://openrouter.ai/api/v1";
const ORIGIN = "https://www.minddy.app";

function policy(over?: Partial<Parameters<typeof buildAgentNetworkPolicy>[0]>) {
  const built = buildAgentNetworkPolicy({
    baseUrl: OPENROUTER,
    llmKey: "sk-or-v1-secret",
    appOrigin: ORIGIN,
    ...over,
  });
  if (typeof built === "string") throw new Error("expected an object policy");
  return built;
}

function rulesFor(host: string): NetworkPolicyRule[] {
  const allow = policy().allow;
  if (!allow || Array.isArray(allow)) throw new Error("expected a record-form allow list");
  return allow[host] ?? [];
}

describe("buildAgentNetworkPolicy — credited route", () => {
  it("targets the exact completion path, never a prefix", () => {
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.match?.path).toEqual({ exact: "/api/v1/chat/completions" });
    // The word that counts: a `startsWith` would credit /api/v1/key.
    expect(JSON.stringify(rule.match?.path)).not.toContain("startsWith");
  });

  it("credits only POST on the completion path", () => {
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.match?.method).toEqual(["POST"]);
  });

  it("places the real key only in the transform", () => {
    const built = policy();
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.transform).toEqual([{ headers: { authorization: "Bearer sk-or-v1-secret" } }]);
    // The key only appears ONCE in the entire policy: in this transform.
    const occurrences = JSON.stringify(built).split("sk-or-v1-secret").length - 1;
    expect(occurrences).toBe(1);
  });

  it("follows the provider base URL, including custom providers", () => {
    const built = buildAgentNetworkPolicy({
      baseUrl: "https://llm.example.test/openai/v1/",
      llmKey: "k",
      appOrigin: ORIGIN,
    });
    if (typeof built === "string" || !built.allow || Array.isArray(built.allow)) {
      throw new Error("expected a record-form allow list");
    }
    expect(built.allow["llm.example.test"]?.[0]?.match?.path).toEqual({
      exact: "/openai/v1/chat/completions",
    });
    expect(built.allow["openrouter.ai"]).toBeUndefined();
  });
});

describe("buildAgentNetworkPolicy — control plane", () => {
  it("forwards the control plane prefix to the bare origin", () => {
    const [rule] = rulesFor("www.minddy.app");
    expect(rule.forwardURL).toBe(ORIGIN);
    expect(rule.match?.path).toEqual({ startsWith: `${AGENT_VM_PATH_PREFIX}/` });
  });

  it("uses OIDC identity without a control plane transform", () => {
    const [rule] = rulesFor("www.minddy.app");
    expect(rule.transform).toBeUndefined();
  });

  it("targets the deployment that launches the run", () => {
    const built = buildAgentNetworkPolicy({
      baseUrl: OPENROUTER,
      llmKey: "k",
      appOrigin: "https://minddy-abc123.vercel.app",
    });
    if (typeof built === "string" || !built.allow || Array.isArray(built.allow)) {
      throw new Error("expected a record-form allow list");
    }
    expect(built.allow["minddy-abc123.vercel.app"]?.[0]?.forwardURL).toBe(
      "https://minddy-abc123.vercel.app",
    );
  });

  it("uses the same route URL from the VM and network policy", () => {
    expect(agentVmUrl(ORIGIN, "events")).toBe("https://www.minddy.app/api/agent-vm/events");
    expect(agentVmUrl(`${ORIGIN}/`, "/checkpoint")).toBe(
      "https://www.minddy.app/api/agent-vm/checkpoint",
    );
    // …and this URL matches the rule that makes it forward.
    const path = new URL(agentVmUrl(ORIGIN, "events")).pathname;
    const [rule] = rulesFor("www.minddy.app");
    // Asserted before being read: without `match.path`, the following line started
    // TypeError on `undefined`, and the test said “cannot read startsWith”
    // instead of “the rule has lost its way”.
    const matchPath = rule.match?.path;
    expect(matchPath, "la règle doit porter un `match.path`").toBeDefined();
    const prefix = (matchPath as { startsWith: string }).startsWith;
    expect(path.startsWith(prefix)).toBe(true);
  });
});

describe("buildAgentNetworkPolicy — public egress with private-network denial", () => {
  it("allows arbitrary public destinations without attaching a transform", () => {
    const allow = policy().allow;
    if (!allow || Array.isArray(allow)) throw new Error("expected a record-form allow list");
    expect(allow["*"]).toEqual([]);
    expect(allow["attacker.example"]).toBeUndefined();
  });

  it("denies private and link-local destinations even after DNS resolution", () => {
    const subnets = policy().subnets;
    expect(subnets?.deny).toEqual(AGENT_DENIED_EGRESS_SUBNETS);
    expect(subnets?.allow).toBeUndefined();
  });

  it("sends only the IPv4 CIDR form accepted by Vercel Sandbox", () => {
    for (const cidr of AGENT_DENIED_EGRESS_SUBNETS) {
      const [address, prefix, extra] = cidr.split("/");
      expect(extra).toBeUndefined();
      expect(isIP(address)).toBe(4);
      expect(Number(prefix)).toBeGreaterThanOrEqual(0);
      expect(Number(prefix)).toBeLessThanOrEqual(32);
    }
    expect(AGENT_DENIED_EGRESS_SUBNETS).not.toContain("240.0.0.0/4");
  });

  it("is never an allow-all or deny-all string policy", () => {
    expect(typeof policy()).toBe("object");
  });
});

describe("forge authentication stays in trusted network policy", () => {
  it("injects a GitHub token only on the linked repository smart-HTTP path", () => {
    const built = policy({
      forge: {
        provider: "github",
        repoFullName: "acme/private-app",
        token: "ghs_repository_scoped",
      },
    });
    const allow = built.allow;
    if (!allow || Array.isArray(allow)) throw new Error("expected a record-form allow list");
    const rules = allow["github.com"] ?? [];
    expect(rules.map((rule) => rule.match)).toEqual([
      { method: ["GET"], path: { exact: "/acme/private-app.git/info/refs" } },
      { method: ["POST"], path: { exact: "/acme/private-app.git/git-upload-pack" } },
      { method: ["POST"], path: { exact: "/acme/private-app.git/git-receive-pack" } },
    ]);
    for (const rule of rules) {
      expect(rule.transform).toEqual([
        {
          headers: {
            authorization: `Basic ${Buffer.from("x-access-token:ghs_repository_scoped").toString("base64")}`,
          },
        },
      ]);
    }
    expect(JSON.stringify(rules)).not.toContain("other-repo");
  });

  it("uses GitLab OAuth only in the GitLab repository rule and keeps the remote clean", () => {
    const remote = agentForgeRemoteUrl({
      provider: "gitlab",
      repoFullName: "group/private-app",
      origin: "https://gitlab.com",
    });
    expect(remote).toBe("https://gitlab.com/group/private-app.git");
    expect(remote).not.toContain("oauth2");

    const built = policy({
      forge: {
        provider: "gitlab",
        repoFullName: "group/private-app",
        token: "gl_account_token",
        origin: "https://gitlab.com",
      },
    });
    const allow = built.allow;
    if (!allow || Array.isArray(allow)) throw new Error("expected a record-form allow list");
    const rules = allow["gitlab.com"] ?? [];
    expect(rules.map((rule) => rule.match?.path)).toEqual([
      { exact: "/group/private-app.git/info/refs" },
      { exact: "/group/private-app.git/git-upload-pack" },
      { exact: "/group/private-app.git/git-receive-pack" },
    ]);
    for (const rule of rules) {
      expect(rule.transform).toEqual([
        {
          headers: {
            authorization: `Basic ${Buffer.from("oauth2:gl_account_token").toString("base64")}`,
          },
        },
      ]);
    }
  });

  it("rotates the forge rule without exposing or replacing the LLM rule", () => {
    const initial = policy({
      forge: { provider: "github", repoFullName: "acme/private-app", token: "old-token" },
    });
    const rotated = rotateAgentForgeCredential(initial, {
      provider: "github",
      repoFullName: "acme/private-app",
      token: "new-token",
    });
    const serialized = JSON.stringify(rotated);
    expect(serialized).not.toContain("old-token");
    expect(serialized).toContain(Buffer.from("x-access-token:new-token").toString("base64"));
    expect(serialized).toContain("sk-or-v1-secret");
    if (typeof rotated === "string" || !rotated.allow || Array.isArray(rotated.allow)) {
      throw new Error("expected a record-form allow list");
    }
    expect(rotated.allow["*"]).toEqual([]);
  });

  it("removes the old repository rule when a link moves", () => {
    const initial = policy({
      forge: { provider: "github", repoFullName: "acme/old-app", token: "old-token" },
    });
    const rotated = rotateAgentForgeCredential(initial, {
      provider: "gitlab",
      repoFullName: "new-group/new-app",
      token: "gitlab-new-token",
      origin: "https://gitlab.com",
    });
    if (typeof rotated === "string" || !rotated.allow || Array.isArray(rotated.allow)) {
      throw new Error("expected a record-form allow list");
    }
    const allow = rotated.allow;
    expect(allow["github.com"]).toBeUndefined();
    expect(JSON.stringify(rotated)).not.toContain("/acme/old-app.git/");
    expect(allow["gitlab.com"]).toHaveLength(3);
  });

  it("cannot route injected credentials to an attacker-controlled host", () => {
    const built = policy({
      forge: {
        provider: "github",
        repoFullName: "acme/private-app",
        token: "repository-scoped-secret",
      },
    });
    if (!built.allow || Array.isArray(built.allow)) {
      throw new Error("expected a record-form allow list");
    }
    expect(built.allow["attacker.example"]).toBeUndefined();
    expect(JSON.stringify(built.allow["github.com"])).toContain(
      Buffer.from("x-access-token:repository-scoped-secret").toString("base64"),
    );
    expect(JSON.stringify(built)).not.toContain("repository-scoped-secret");
  });
});

describe("buildAgentNetworkPolicy — fail closed", () => {
  it("rejects a relative base URL", () => {
    expect(() => policy({ baseUrl: "/v1" })).toThrow(/absolute URL/);
  });

  it("rejects an origin with a path", () => {
    expect(() => policy({ appOrigin: "https://www.minddy.app/api" })).toThrow(/no path/);
  });

  it("rejects an empty LLM key", () => {
    expect(() => policy({ llmKey: "  " })).toThrow(/missing LLM key/);
  });
});

describe("VM identity from the sandbox name", () => {
  const RUN = "11111111-2222-4333-8444-555555555555";

  it("recovers the run ID from the assigned sandbox name", () => {
    expect(agentSandboxName(RUN)).toBe(`agent-v2-${RUN}`);
    expect(runIdFromSandboxName(agentSandboxName(RUN))).toBe(RUN);
    expect(runIdFromSandboxName(`${agentSandboxName(RUN)}-012345abcdef`)).toBe(RUN);
  });

  it("rejects probes, invented names and legacy sandboxes", () => {
    for (const name of ["probe-min223", "agent", "agent-", `agent-${RUN}`, "sandbox-x", ""]) {
      expect(runIdFromSandboxName(name)).toBeNull();
    }
  });

  it("requires a UUID so a crafted name cannot become a run ID", () => {
    // A path fragment or wildcard must never become a run identifier.
    for (const suffix of ["../../x", "*", "' or 1=1 --", "not-a-uuid"]) {
      expect(runIdFromSandboxName(`agent-v2-${suffix}`)).toBeNull();
    }
  });
});

describe("control plane admission — tenant before sandbox name (MIN-331)", () => {
  const RUN = "11111111-2222-4333-8444-555555555555";
  const TENANT = { teamId: "team_us", projectId: "prj_us" };
  const OURS = { ...TENANT, sandboxName: agentSandboxName(RUN) };

  it("admits our microVM and returns its run", () => {
    expect(admitSandboxCaller(OURS, TENANT)).toEqual({ ok: true, runId: RUN });
  });

  it("rejects a sandbox from another Vercel account even with a valid name", () => {
    // The MIN-331 attack: a valid OIDC, a `aud` that the attacker placed
    // itself in its `forwardURL`, and the name of a real run from us.
    for (const foreign of [
      { ...OURS, teamId: "team_attacker" },
      { ...OURS, projectId: "prj_attacker" },
      { teamId: "team_attacker", projectId: "prj_attacker", sandboxName: OURS.sandboxName },
    ]) {
      expect(admitSandboxCaller(foreign, TENANT)).toEqual({
        ok: false,
        status: 403,
        error: "foreign sandbox",
      });
    }
  });

  it("rejects our sandbox when it is not assigned to a run", () => {
    expect(admitSandboxCaller({ ...TENANT, sandboxName: "probe-min223" }, TENANT)).toEqual({
      ok: false,
      status: 403,
      error: "not an agent sandbox",
    });
  });

  it("fails closed when the expected tenant is missing", () => {
    expect(admitSandboxCaller(OURS, null)).toEqual({
      ok: false,
      status: 503,
      error: "control plane tenant not configured",
    });
  });

  it("reads the tenant from both required environment variables", () => {
    expect(
      resolveControlPlaneTenant({ VERCEL_TEAM_ID: " team_us ", VERCEL_PROJECT_ID: "prj_us" }),
    ).toEqual(TENANT);
    expect(resolveControlPlaneTenant({ VERCEL_TEAM_ID: "team_us" })).toBeNull();
    expect(resolveControlPlaneTenant({ VERCEL_PROJECT_ID: "prj_us" })).toBeNull();
    expect(resolveControlPlaneTenant({ VERCEL_TEAM_ID: "", VERCEL_PROJECT_ID: "prj_us" })).toBeNull();
  });
});

describe("the placeholder", () => {
  it("is recognizable and is not a secret", () => {
    expect(AGENT_LLM_PLACEHOLDER_KEY).toBe("minddy-placeholder");
    expect(AGENT_LLM_PLACEHOLDER_KEY).not.toMatch(/^sk-/);
  });
});


describe("native worker network funding", () => {
  it("supplies only control-plane and scoped forge authority without an inference key", () => {
    const native = buildNativeAgentNetworkPolicy({ appOrigin: ORIGIN,
      forge: { provider: "github", repoFullName: "owner/repo", token: "fixture-forge-key" } });
    if (typeof native === "string" || !native.allow || Array.isArray(native.allow)) throw new Error("object policy required");
    expect(native.allow["*"]).toEqual([]);
    expect(native.allow["www.minddy.app"]).toEqual([{ match: { path: { startsWith: `${AGENT_VM_PATH_PREFIX}/` } }, forwardURL: ORIGIN }]);
    expect(native.allow["github.com"]).toHaveLength(3);
    expect(JSON.stringify(native)).not.toContain("Bearer");
    expect(JSON.stringify(native)).not.toContain("chat/completions");
    expect(native.subnets?.deny).toEqual(AGENT_DENIED_EGRESS_SUBNETS);
    const rotated = rotateAgentForgeCredential(native, { provider: "github", repoFullName: "owner/repo", token: "rotated-fixture" });
    expect(JSON.stringify(rotated)).not.toContain("fixture-forge-key");
    expect(JSON.stringify(rotated)).not.toContain("Bearer");
  });
});
