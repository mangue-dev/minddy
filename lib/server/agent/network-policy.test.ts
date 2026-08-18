import { describe, expect, it } from "vitest";
import type { NetworkPolicyRule } from "@vercel/sandbox";

import {
  AGENT_LLM_PLACEHOLDER_KEY,
  AGENT_VM_PATH_PREFIX,
  admitSandboxCaller,
  agentSandboxName,
  agentVmUrl,
  buildAgentNetworkPolicy,
  resolveControlPlaneTenant,
  runIdFromSandboxName,
} from "./network-policy";

/**
 * What this test keeps is not an object shape — it is the measured boundary
 * of 2026-08-07 (see docs/orchestrateur-process-long.md §1). A `startsWith` placed
 * here "to make it simpler" would re-credit `/api/v1/key`, the OpenRouter provisioning route, and the microVM could issue its own keys.
 * Nothing in the product would say so; this file, if.
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

describe("buildAgentNetworkPolicy — la route créditée", () => {
  it("cible le chemin EXACT de complétion, jamais un préfixe", () => {
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.match?.path).toEqual({ exact: "/api/v1/chat/completions" });
    // The word that counts: a `startsWith` would credit /api/v1/key.
    expect(JSON.stringify(rule.match?.path)).not.toContain("startsWith");
  });

  it("ne crédite que POST — un GET sur le même chemin ne porte rien", () => {
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.match?.method).toEqual(["POST"]);
  });

  it("pose la vraie clé dans le transform, et nulle part ailleurs", () => {
    const built = policy();
    const [rule] = rulesFor("openrouter.ai");
    expect(rule.transform).toEqual([{ headers: { authorization: "Bearer sk-or-v1-secret" } }]);
    // The key only appears ONCE in the entire policy: in this transform.
    const occurrences = JSON.stringify(built).split("sk-or-v1-secret").length - 1;
    expect(occurrences).toBe(1);
  });

  it("suit la base URL du provider (BYOK générique compris)", () => {
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

describe("buildAgentNetworkPolicy — le plan de contrôle", () => {
  it("forwarde le préfixe du plan de contrôle vers l'origine nue", () => {
    const [rule] = rulesFor("www.minddy.app");
    expect(rule.forwardURL).toBe(ORIGIN);
    expect(rule.match?.path).toEqual({ startsWith: `${AGENT_VM_PATH_PREFIX}/` });
  });

  it("ne pose AUCUN transform sur le plan de contrôle — l'identité vient de l'OIDC", () => {
    const [rule] = rulesFor("www.minddy.app");
    expect(rule.transform).toBeUndefined();
  });

  it("vise le déploiement qui lance le run, pas la prod", () => {
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

  it("l'URL appelée depuis la VM et l'URL de la route sont la même", () => {
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

describe("buildAgentNetworkPolicy — le reste d'Internet", () => {
  it("garde le catch-all ouvert et SANS injection", () => {
    const allow = policy().allow;
    if (!allow || Array.isArray(allow)) throw new Error("expected a record-form allow list");
    // `npm install` on a user's deposit must pass: we close the
    // path to secrets, not that of data (framing §1).
    expect(allow["*"]).toEqual([]);
  });

  it("n'est jamais une politique de chaîne (allow-all / deny-all)", () => {
    expect(typeof policy()).toBe("object");
  });
});

describe("buildAgentNetworkPolicy — refus de démarrer plutôt que démarrer nu", () => {
  it("refuse une base URL relative", () => {
    expect(() => policy({ baseUrl: "/v1" })).toThrow(/absolute URL/);
  });

  it("refuse une origine portant un chemin (le forwardURL doit rester nu)", () => {
    expect(() => policy({ appOrigin: "https://www.minddy.app/api" })).toThrow(/no path/);
  });

  it("refuse une clé vide — mieux vaut pas de VM qu'une VM sans crédit", () => {
    expect(() => policy({ llmKey: "  " })).toThrow(/missing LLM key/);
  });
});

describe("l'identité de la VM — le nom du sandbox EST le claim", () => {
  const RUN = "11111111-2222-4333-8444-555555555555";

  it("fait l'aller-retour avec le nom que pose `getOrCreateAgentSandbox`", () => {
    expect(agentSandboxName(RUN)).toBe(`agent-${RUN}`);
    expect(runIdFromSandboxName(agentSandboxName(RUN))).toBe(RUN);
  });

  it("refuse tout ce qui n'est pas un run — une sonde, un outil, un nom inventé", () => {
    for (const name of ["probe-min223", "agent", "agent-", "sandbox-x", ""]) {
      expect(runIdFromSandboxName(name)).toBeNull();
    }
  });

  it("exige un uuid — sinon un nom bricolé partirait en requête", () => {
    // `agent-../..` ou `agent-*` ne doit jamais devenir un identifiant de run.
    for (const suffix of ["../../x", "*", "' or 1=1 --", "not-a-uuid"]) {
      expect(runIdFromSandboxName(`agent-${suffix}`)).toBeNull();
    }
  });
});

describe("l'admission du plan de contrôle — le locataire avant le nom (MIN-331)", () => {
  const RUN = "11111111-2222-4333-8444-555555555555";
  const TENANT = { teamId: "team_us", projectId: "prj_us" };
  const OURS = { ...TENANT, sandboxName: agentSandboxName(RUN) };

  it("laisse passer NOTRE microVM, et en rend le run", () => {
    expect(admitSandboxCaller(OURS, TENANT)).toEqual({ ok: true, runId: RUN });
  });

  it("refuse une sandbox d'un autre compte Vercel, même parfaitement nommée", () => {
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

  it("refuse une sandbox à nous qui n'est pas celle d'un run", () => {
    expect(admitSandboxCaller({ ...TENANT, sandboxName: "probe-min223" }, TENANT)).toEqual({
      ok: false,
      status: 403,
      error: "not an agent sandbox",
    });
  });

  it("ferme la porte quand le locataire attendu manque — 503, pas un passe-droit", () => {
    expect(admitSandboxCaller(OURS, null)).toEqual({
      ok: false,
      status: 503,
      error: "control plane tenant not configured",
    });
  });

  it("lit le locataire dans l'environnement, et exige les DEUX variables", () => {
    expect(
      resolveControlPlaneTenant({ VERCEL_TEAM_ID: " team_us ", VERCEL_PROJECT_ID: "prj_us" }),
    ).toEqual(TENANT);
    expect(resolveControlPlaneTenant({ VERCEL_TEAM_ID: "team_us" })).toBeNull();
    expect(resolveControlPlaneTenant({ VERCEL_PROJECT_ID: "prj_us" })).toBeNull();
    expect(resolveControlPlaneTenant({ VERCEL_TEAM_ID: "", VERCEL_PROJECT_ID: "prj_us" })).toBeNull();
  });
});

describe("le placeholder", () => {
  it("est reconnaissable et n'est pas un secret", () => {
    expect(AGENT_LLM_PLACEHOLDER_KEY).toBe("minddy-placeholder");
    expect(AGENT_LLM_PLACEHOLDER_KEY).not.toMatch(/^sk-/);
  });
});
