import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox";

import { chatCompletionsUrl } from "@/lib/agent-providers";

/**
 * Agent microVM network policy (MIN-223). PURE and testable without
 * sandbox — like `command-guard.ts` and `repo-path.ts`, this is logic that
 * keep something that you can't get back after the fact.
 *
 * THE PRINCIPLE, AND IT IS UNUSUAL: **the microVM does not hold any secrets OF
 * MINDDY.** No LLM key, no Supabase key, no identity token. It's not a
 * code discipline, it is the platform:
 *
 * - the Vercel Sandbox firewall terminates the TLS of the VM and **installs itself**
 * the `authorization` header on the completion request (`transform`), after
 * the exit of the VM. The key never enters its memory space; the loop
 * sends a placeholder and receives a real completion (measured, cf.
 *   docs/orchestrateur-process-long.md §1) ;
 * - the control plan (events, ledger, checkpoint, tools) goes through
 * `forwardURL`: the firewall forwards the request to our route in y
 * adding an OIDC signed by the platform, whose claim `sandbox_name` is worth
 * `agent-<run.id>`. **A VM cannot therefore claim anything other than its own
 * run** — which a token carried in the VM would not have been able to guarantee.
 *
 * FORGE CREDENTIALS DO NOT ENTER THE VM (MIN-421). Git uses a credential-free
 * remote. The firewall injects HTTP Basic authentication only for the linked
 * repository's smart-HTTP path. The unrestricted catch-all below therefore
 * cannot carry a reusable GitHub or GitLab credential to another destination.
 * A long-running writer can ask the control plane to rotate this firewall rule,
 * but the response still contains only the credential-free remote URL.
 *
 * AND ALL OF THE ABOVE IS ONLY WORTH ONE MICROVM (MIN-355, MIN-357). This file
 * describes a policy imposed by the Vercel Sandbox firewall: a trick that plays
 * on the user's machine has none, and therefore has nothing of what the
 * platform guaranteed here. **The two halves of the invariant fall there, and it
 * it's better to write them down than let them become stale :**
 *
 * - the harness CARRY an identity token ([local-exec-token.ts](local-exec-token.ts)),
 * because no firewall signs for him. What replaces it is not
 * hiding but a reduction of power, written in `handleControlPlaneRequest`;
 * - and it CARRYS the key of the model, because no firewall will install it after its
 *   sortie. Elle descend d'un cran seulement — jusqu'au proxy LLM
 * ([vm/llm-proxy.ts](vm/llm-proxy.ts)), in memory, never in the job nor in
 * the opencode server environment — and it is always a MINTED key
 * HARD CEILING ([run-key.ts](run-key.ts)): it is the ceiling which limits the damage,
 * not the secret.
 *
 * TWO CHOICES THAT LOOK LIKE DETAILS AND ARE NOT.
 *
 * 1. `path: { exact }` on the completion route, **never** a `startsWith`.
 * It is this word that puts `/api/v1/key` — the PROVISIONING route of OpenRouter,
 * neighboring a segment — out of range: measured at 401 with the placeholder,
 * there that a prefix would have credited it and would have let the VM emit its
 * own keys. **The LLM proxy now has the same word** (`resolveProxyTarget`,
 * strict equality on `pathname`): on a machine, it is he who sets the
 * key, so it is he who holds what this line here holds.
 * 2. The catch-all `"*": []` remains: the rest of the Internet is OPEN, without
 * injection. We close the path to **secret**, not that of **data** —
 * exfiltration of repository contents is already possible today
 * (`run_command` + open network) and a strict whitelist would break
 * `npm install` on our users' deposits, the details of which are unknown
 * private registers or mirrors. Treat both as one problem,
 * it's not resolving any of them.
 *
 * WHAT REMAINS POSSIBLE, AND WHICH IS BOUNDED ELSEWHERE: a hostile model can
 * call the credited route outside the loop (a `curl` is enough). It's not
 * exfiltration is an expense, and it escapes the ledger. THE
 * guardrail is not another control in the VM — it is compromised by
 * hypothesis — this is the key per run to hard cap of `run-key.ts`, held by the
 * fournisseur.
 */

/**
 * Prefix of control plane URLs, **same** in the VM and on the route.
 *
 * The firewall APPENDS the path requested by the VM to `forwardURL`. By posing
 * `forwardURL` = the bare origin, the URL that the VM calls and the URL that arrives at
 * are literally the same to us — the firewall only adds the OIDC. A
 * direct call to this URL from the VM is impossible: it matches the rule,
 * so it is forwarded, so it carries the OIDC. And a call from anywhere
 * Elsewhere arrives without OIDC and is refused by `defineSandboxProxy`.
 */
export const AGENT_VM_PATH_PREFIX = "/api/agent-vm";

/** What the loop puts in `authorization`: the firewall overwrites it. His only
 * function is to be recognizable in a log or network trace. */
export const AGENT_LLM_PLACEHOLDER_KEY = "minddy-placeholder";

/** Prefix of the microVM name of a run. The name IS the identity: it is he who
 * platform sign in the OIDC claim `sandbox_name`. */
const AGENT_SANDBOX_PREFIX = "agent-";

/** Deterministic name of the microVM of a run (persisted in `agent_runs.sandbox_id`). */
export function agentSandboxName(runId: string): string {
  return `${AGENT_SANDBOX_PREFIX}${runId}`;
}

/**
 * The run that a microVM CAN claim to be — derived from its name, therefore from the claim
 * OIDC signed by the platform, never from the body of the request.
 *
 * This is where all the security of the control plane lies: a VM does not write
 * on her run because we check that she has the right to do so, but because she **does not
 * can claim nothing else**. A token carried in the VM, or a `runId` in the
 * body, would have requested verification; There is nothing to check here.
 *
 * `null` on anything that is not `agent-<uuid>`: a probe sandbox, a
 * internal tool, an invented name. The uuid format is required — without it, a
 * `agent-../..` would make a Postgrest request on an arbitrary string.
 */
export function runIdFromSandboxName(name: string): string | null {
  if (!name.startsWith(AGENT_SANDBOX_PREFIX)) return null;
  const candidate = name.slice(AGENT_SANDBOX_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

/** The Vercel tenant who has the right to speak to the control plan: OUR team
 * and OUR project, the same people who create the microVMs for the runs. */
export interface ControlPlaneTenant {
  teamId: string;
  projectId: string;
}

/** What the platform signs on a forwarded request (`ProxyMeta`), reduced to
 *  ce dont l'admission a besoin. */
export interface SandboxCaller {
  teamId: string;
  projectId: string;
  sandboxName: string;
}

export type SandboxAdmission =
  | { ok: true; runId: string }
  | { ok: false; status: 403 | 503; error: string };

/**
 * The expected tenant, read in the environment. Same variables as creation
 * of microVM and that custom domains (MIN-36) — not one more to hold.
 *
 * And it's not just a configuration saving: it's the pair that
 * `sandboxCredentials()` (sandbox.ts) present to CREATE microVMs. We
 * therefore compares the appellant's tenant to the one who gave birth to him — a
 * false value would not let an intruder through, it would prevent the run
 * d'exister.
 *
 * `null` when one is missing, and the caller makes it a **503, not a pass**:
 * a control plan that does not know who it serves serves no one.
 */
export function resolveControlPlaneTenant(
  env: Record<string, string | undefined> = process.env,
): ControlPlaneTenant | null {
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  return teamId && projectId ? { teamId, projectId } : null;
}

/**
 * WHO HAS THE RIGHT TO SPEAK (MIN-331), and why the signature was not enough.
 *
 * `defineSandboxProxy` verifies that the token is an OIDC **from Vercel**: signature
 * against the JWKS of `oidc.vercel.com`, `aud` equal to the forwarded URL, window
 * validity. None of these three checks says **from which account** the
 * VM: the issuer is common to the entire platform, and the `aud` is the one that
 * the caller himself asked in the `forwardURL` of HIS network policy. A
 * attacker who deploys at home, points his `forwardURL` to our origin and
 * name your sandbox `agent-<uuid d'un vrai run>` passed all that — and left
 * with the run's forge token, its checkpoint and its tool surface.
 *
 * What decides is the tenant: `team_id` and `project_id` are set by
 * the platform, out of reach of the caller. We demand ours, then
 * only then do we read the name - because it is this name which designates the run.
 */
export function admitSandboxCaller(
  caller: SandboxCaller,
  tenant: ControlPlaneTenant | null,
): SandboxAdmission {
  if (!tenant) {
    return { ok: false, status: 503, error: "control plane tenant not configured" };
  }
  if (caller.teamId !== tenant.teamId || caller.projectId !== tenant.projectId) {
    return { ok: false, status: 403, error: "foreign sandbox" };
  }
  const runId = runIdFromSandboxName(caller.sandboxName);
  if (!runId) return { ok: false, status: 403, error: "not an agent sandbox" };
  return { ok: true, runId };
}

export interface AgentNetworkPolicyInput {
  /**
   * Base URL OpenAI-compatible du provider du run (sans `/chat/completions`),
   * such that `resolveAgentApiKey` resolves it — register for a known provider,
   * URL entered for generic BYOK.
   */
  baseUrl: string;
  /**
   * The REAL key: that of the run (hard ceiling) in platform mode, that of
   * the user in BYOK. It is only useful here, and it does not go lower
   * than the firewall.
   */
  llmKey: string;
  /**
   * Origin (scheme + host, without path) of the deployment which holds the plan
   * control. The VM must join THIS deployment: a run launched by a preview
   * don't talk to production.
   */
  appOrigin: string;
  /** Optional forge credential held by the firewall, never by the VM. */
  forge?: AgentForgeCredential;
}

export interface AgentForgeCredential {
  provider: "github" | "gitlab";
  repoFullName: string;
  token: string;
  /** GitLab may be configured on a self-managed public origin. */
  origin?: string;
}

/** Credential-free HTTPS remote persisted in `.git/config`. */
export function agentForgeRemoteUrl(input: Omit<AgentForgeCredential, "token">): string {
  const origin = input.provider === "github" ? "https://github.com" : (input.origin ?? "https://gitlab.com");
  return `${origin.replace(/\/+$/, "")}/${input.repoFullName}.git`;
}

function forgeRules(input: AgentForgeCredential): { host: string; rules: NetworkPolicyRule[] } {
  const remote = new URL(agentForgeRemoteUrl(input));
  const username = input.provider === "github" ? "x-access-token" : "oauth2";
  const authorization = `Basic ${Buffer.from(`${username}:${input.token}`).toString("base64")}`;
  return {
    host: remote.host,
    rules: [
      { method: "GET", suffix: "/info/refs" },
      { method: "POST", suffix: "/git-upload-pack" },
      { method: "POST", suffix: "/git-receive-pack" },
    ].map(({ method, suffix }) => ({
      match: { method: [method], path: { exact: `${remote.pathname}${suffix}` } },
      transform: [{ headers: { authorization } }],
    })),
  };
}

/** Host + path of an absolute URL. Raises on an unreadable URL — better
 * refuse to start the VM than start it without policy. */
function splitUrl(raw: string, label: string): { host: string; path: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`agent network policy: ${label} is not an absolute URL (${raw})`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`agent network policy: ${label} must be http(s) (${raw})`);
  }
  return { host: url.host, path: url.pathname };
}

/**
 * The policy to put on the microVM of a run.
 *
 * Three entries, and the reading order is that of their importance:
 * 1. the LLM provider — a single credited route, in POST, EXACT path;
 * 2. our own origin — the control plane, forwarded with OIDC;
 * 3. `"*"` — everything else, open and without injection.
 *
 * A request to a listed domain that does not match ANY rules still passes,
 * simply not transformed (measured: `GET /api/v1/key` springs at 401 side
 * OpenRouter, not refusing the firewall). Listing a domain does not restrict it
 * not — it adds rules to it.
 */
export function buildAgentNetworkPolicy(input: AgentNetworkPolicyInput): NetworkPolicy {
  const llm = splitUrl(chatCompletionsUrl(input.baseUrl), "provider base URL");
  const app = splitUrl(input.appOrigin, "app origin");
  if (app.path !== "/") {
    throw new Error(`agent network policy: app origin must have no path (${input.appOrigin})`);
  }
  if (!input.llmKey.trim()) {
    throw new Error("agent network policy: missing LLM key");
  }

  const llmRule: NetworkPolicyRule = {
    match: { method: ["POST"], path: { exact: llm.path } },
    transform: [{ headers: { authorization: `Bearer ${input.llmKey}` } }],
  };
  const controlRule: NetworkPolicyRule = {
    match: { path: { startsWith: `${AGENT_VM_PATH_PREFIX}/` } },
    forwardURL: input.appOrigin.replace(/\/+$/, ""),
  };

  // The provider and the control plane can share a host (generic BYOK
  // hosted with us, never seen but not prohibited): their rules add up
  // then on the same input, they do not overwrite each other.
  const allow: Record<string, NetworkPolicyRule[]> = { "*": [] };
  for (const [host, rule] of [
    [llm.host, llmRule],
    [app.host, controlRule],
  ] as const) {
    (allow[host] ??= []).push(rule);
  }
  if (input.forge) {
    if (!input.forge.token.trim()) {
      throw new Error("agent network policy: missing forge token");
    }
    const forge = forgeRules(input.forge);
    (allow[forge.host] ??= []).push(...forge.rules);
  }
  return { allow };
}

/**
 * Replace the linked repository's authentication rule while preserving the
 * LLM and control-plane rules already installed on a running sandbox.
 */
export function rotateAgentForgeCredential(
  policy: NetworkPolicy | undefined,
  input: AgentForgeCredential,
): NetworkPolicy {
  if (!policy || typeof policy === "string" || !policy.allow || Array.isArray(policy.allow)) {
    throw new Error("agent network policy: cannot rotate forge credential without an object policy");
  }
  if (!input.token.trim()) throw new Error("agent network policy: missing forge token");
  const forge = forgeRules(input);
  const isForgeRule = (rule: NetworkPolicyRule): boolean => {
    const path = rule.match?.path;
    const authorization = rule.transform?.find((transform) =>
      transform.headers?.authorization?.startsWith("Basic "),
    );
    const exactPath = path && "exact" in path && typeof path.exact === "string" ? path.exact : undefined;
    return Boolean(
      authorization &&
      exactPath &&
      ["/info/refs", "/git-upload-pack", "/git-receive-pack"].some((suffix) =>
        exactPath.endsWith(suffix),
      )
    );
  };
  const allow = Object.fromEntries(
    Object.entries(policy.allow).map(([host, rules]) => [
      host,
      rules.filter((rule) => !isForgeRule(rule)),
    ]),
  );
  return {
    ...policy,
    allow: {
      ...allow,
      [forge.host]: [...(allow[forge.host] ?? []), ...forge.rules],
    },
  };
}

/** URL that the loop, IN the VM, calls for a control plane surface
 * (`events`, `usage`, `checkpoint`…). The firewall adds the OIDC in passing. */
export function agentVmUrl(appOrigin: string, surface: string): string {
  const base = appOrigin.replace(/\/+$/, "");
  const path = surface.startsWith("/") ? surface : `/${surface}`;
  return `${base}${AGENT_VM_PATH_PREFIX}${path}`;
}
