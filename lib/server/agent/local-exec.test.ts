import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-355 — ISSUING A TOKEN MEANS REVOKING THE PREVIOUS.
 *
 * A self-bearing token cannot be remembered: it expires. The only revocation
 * possible is therefore a counter on the run line, and the gesture which increments it
 * is the show itself. This is what makes “one machine per run” a
 * property of the column rather than a rule that someone should keep.
 */

const h = vi.hoisted(() => ({
  /** The line, reduced to what the lease looks at. `null` = run not found. */
  row: { local: true, gen: 0 } as { local: boolean; gen: number } | null,
  authorized: true,
  /** WHERE THE CONTEXT OF THE RUN COMES FROM (MIN-360) — what the second curtain reads back. */
  scope: {
    project_id: "project-1",
    repo_link_id: "link-1",
    connection_id: "connection-1",
    repo_provider: "github",
    repo_external_id: "9001",
    triggered_by: "button",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    issue_id: null,
    local_issue_context_confirmed: false,
    created_by: "user-1",
    local_exec_device_id: "0123456789abcdef0123456789abcdef",
  } as {
    project_id: string;
    repo_link_id: string | null;
    connection_id: string | null;
    repo_provider: "github" | "gitlab" | null;
    repo_external_id: string | null;
    triggered_by: string | null;
    routine_id: string | null;
    chain_id: string | null;
    pull_request_id: string | null;
    issue_id: string | null;
    local_issue_context_confirmed: boolean;
    created_by?: string | null;
    local_exec_device_id?: string | null;
  } | null,
}));

vi.mock("./runs", () => ({
  bumpLocalExecGen: vi.fn(async () => {
    if (!h.row?.local) return null;
    h.row.gen += 1;
    return h.row.gen;
  }),
  runLocalExecScopeRow: vi.fn(async () => h.scope),
  runAuthorityIsCurrent: vi.fn(async () => h.authorized),
}));

import { admitLocalRun, issueLocalExecToken } from "./local-exec";
import {
  resolveLocalExecSecret,
  verifyLocalExecToken,
} from "./local-exec-token";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "user-1";
const DEVICE_ID = "0123456789abcdef0123456789abcdef";
const issue = () =>
  issueLocalExecToken({ runId: RUN_ID, userId: USER_ID, deviceId: DEVICE_ID });

beforeEach(() => {
  h.row = { local: true, gen: 0 };
  h.authorized = true;
  h.scope = {
    project_id: "project-1",
    repo_link_id: "link-1",
    connection_id: "connection-1",
    repo_provider: "github",
    repo_external_id: "9001",
    triggered_by: "button",
    routine_id: null,
    chain_id: null,
    pull_request_id: null,
    issue_id: null,
    local_issue_context_confirmed: false,
    created_by: USER_ID,
    local_exec_device_id: DEVICE_ID,
  };
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-key-de-test";
});

describe("le bail d'exécution locale", () => {
  it("rend un jeton que le plan de contrôle sait vérifier", async () => {
    const issued = await issue();
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const verified = verifyLocalExecToken(
      issued.token,
      resolveLocalExecSecret()!,
    );
    expect(verified).toMatchObject({
      ok: true,
      runId: RUN_ID,
      gen: issued.gen,
    });
  });

  it("périme le jeton précédent en émettant le suivant", async () => {
    const first = await issue();
    const second = await issue();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // The generation of the first is no longer that of the line: the control plane
    // will refuse it on the next call, without having had anything to call back.
    expect(second.gen).toBe(first.gen + 1);
    expect(h.row?.gen).toBe(second.gen);
  });

  it("issues a lease independently of anchor and trigger", async () => {
    for (const scope of [
      { pull_request_id: "pr-1" },
      { routine_id: "r-1" },
      { chain_id: "c-1" },
      { triggered_by: "mention" },
    ]) {
      h.scope = {
        ...h.scope!,
        triggered_by: "button",
        routine_id: null,
        chain_id: null,
        pull_request_id: null,
        ...scope,
      };
      await expect(issue()).resolves.toMatchObject({ ok: true });
    }
  });

  it("keeps compatibility with a confirmed pull-request review", async () => {
    h.scope = {
      ...h.scope!,
      pull_request_id: "pr-1",
      local_issue_context_confirmed: true,
    };

    await expect(issue()).resolves.toMatchObject({ ok: true, gen: 1 });
  });

  it("refuse de donner un bail à un run de microVM", async () => {
    // This would be the hot environment toggle that frozen mode prohibits —
    // each environment rereads ITS memory, and works on ITS repository.
    h.row = { local: false, gen: 0 };
    expect(await issue()).toEqual({ ok: false, error: "not_local" });
  });

  it("ne délivre rien quand le déploiement ne sait pas signer", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(await issue()).toEqual({ ok: false, error: "not_configured" });
      // And the generation has not moved: we do not revoke the existing machine
      // for a token that we couldn't make.
      expect(h.row?.gen).toBe(0);
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });

  it("binds lease issuance to the run creator and claiming desktop", async () => {
    await expect(
      issueLocalExecToken({
        runId: RUN_ID,
        userId: "user-2",
        deviceId: DEVICE_ID,
      }),
    ).resolves.toEqual({ ok: false, error: "wrong_member" });
    await expect(
      issueLocalExecToken({
        runId: RUN_ID,
        userId: USER_ID,
        deviceId: "f".repeat(32),
      }),
    ).resolves.toEqual({ ok: false, error: "wrong_machine" });
    expect(h.row?.gen).toBe(0);
  });

  it("refuses a lease after membership or repository authority is revoked", async () => {
    h.authorized = false;
    await expect(issue()).resolves.toEqual({
      ok: false,
      error: "authority_revoked",
    });
    expect(h.row?.gen).toBe(1);
  });
});

/**
 * MIN-357 — WHAT DOES NOT HAVE A CEILING REMAINS IN THE CLOUD.
 *
 * Local BYOK is interactive; unmonitored contexts are excluded more
 * early by `localRunScope`. The platform maintains its mint requirement.
 */
describe("qui a le droit de jouer sur la machine de l'utilisateur", () => {
  const withProvisioning = <T>(value: string | undefined, run: () => T): T => {
    const saved = process.env.OPENROUTER_PROVISIONING_KEY;
    if (value === undefined) delete process.env.OPENROUTER_PROVISIONING_KEY;
    else process.env.OPENROUTER_PROVISIONING_KEY = value;
    try {
      return run();
    } finally {
      if (saved === undefined) delete process.env.OPENROUTER_PROVISIONING_KEY;
      else process.env.OPENROUTER_PROVISIONING_KEY = saved;
    }
  };

  it("laisse partir un run plateforme sur un déploiement qui sait plafonner", () => {
    withProvisioning("sk-or-prov-de-test", () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({ ok: true });
    });
  });

  it("laisse partir un BYOK sans exiger le mint ni un plafond", () => {
    expect(admitLocalRun({ keyMode: "byok" })).toEqual({ ok: true });
  });

  it("garde les runs plateforme dans le cloud quand rien ne sait minter", () => {
    // Without mint, the caller would fall back on the platform key — UNCAPED, and
    // shared with Numo, transcription, embeddings and catalog.
    withProvisioning(undefined, () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({
        ok: false,
        reason: "no_mint",
      });
    });
    // A variable set to EMPTY counts as absent — this is already the rule of
    // `runKeyMintingEnabled`, and two readings which would differ on this
    // would give a local run without a key.
    withProvisioning("   ", () => {
      expect(admitLocalRun({ keyMode: "platform" })).toEqual({
        ok: false,
        reason: "no_mint",
      });
    });
  });
});
