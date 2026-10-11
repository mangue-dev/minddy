import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ claim: vi.fn(), execute: vi.fn(), cleanup: vi.fn(), probe: vi.fn(),
  scope: null as string | null, encrypted: false }));
vi.mock("./runs", () => ({ claimRun: h.claim, appendEvent: vi.fn(), notifyAgentRun: vi.fn(), stampRun: vi.fn() }));
vi.mock("./execute", () => ({ executeAgentRun: h.execute }));
vi.mock("./sandbox", () => ({ isLoopCommandAlive: h.probe, stopSandboxByName: vi.fn() }));
vi.mock("./sandbox-allocation", () => ({ retryRevokedSandboxAllocations: h.cleanup }));
vi.mock("./deployment", () => ({ currentDeploymentScope: () => h.scope }));
vi.mock("./run-deployment-content", () => ({ deploymentLookupPrefix: async () => "encrypted-scope:" }));
vi.mock("@/lib/server/encryption/local-key-wrapper", () => ({ hasDataRootKey: () => h.encrypted }));
import { startQueuedAgentRun } from "./drain";

type Row = { id: string; status?: string; local_exec?: boolean; not_before?: string; deployment_url?: string | null };
function service(rows: Row[]) {
  return { from: (table: string) => {
    expect(table).toBe("agent_runs");
    let selected = rows.map((row) => ({ status: "queued", local_exec: false,
      not_before: "2026-01-01", deployment_url: null, ...row }));
    const query = {
      select: () => query, order: () => query,
      eq: (key: keyof Row, value: unknown) => { selected = selected.filter((row) => row[key] === value); return query; },
      not: (key: keyof Row, _operator: string, value: unknown) => { selected = selected.filter((row) => row[key] !== value); return query; },
      is: (key: keyof Row, value: unknown) => { selected = selected.filter((row) => row[key] === value); return query; },
      lte: (key: keyof Row, value: string) => { selected = selected.filter((row) => String(row[key]) <= value); return query; },
      like: (key: keyof Row, pattern: string) => { selected = selected.filter((row) => String(row[key]).startsWith(pattern.slice(0, -1))); return query; },
      limit: async () => ({ data: selected, error: null }),
    };
    return query;
  } } as unknown as SupabaseClient;
}
beforeEach(() => { vi.clearAllMocks(); h.scope = null; h.encrypted = false;
  h.claim.mockImplementation(async (id) => ({ id, status: "running" })); });

it("starts the requested worker ahead of unrelated queue entries without waiting for maintenance", async () => {
  h.cleanup.mockImplementation(() => new Promise(() => {}));
  await startQueuedAgentRun(service([{ id: "older" }, { id: "requested" }]), "requested");
  expect(h.claim).toHaveBeenCalledExactlyOnceWith("requested");
  expect(h.execute).toHaveBeenCalledWith({ id: "requested", status: "running" }, { deadlineMs: 270_000 });
  expect(h.cleanup).not.toHaveBeenCalled(); expect(h.probe).not.toHaveBeenCalled();
});

it.each([{ local_exec: true }, { status: "running" }, { not_before: "2999-01-01" }, { deployment_url: "another-preview" }])(
  "does not bypass queue eligibility or execution scope: %j", async (row) => {
    await startQueuedAgentRun(service([{ id: "requested", ...row }]), "requested");
    expect(h.claim).not.toHaveBeenCalled(); expect(h.execute).not.toHaveBeenCalled();
  },
);

it("accepts the encrypted deployment scope without claiming other previews", async () => {
  h.scope = "this-preview"; h.encrypted = true;
  await startQueuedAgentRun(service([{ id: "requested", deployment_url: "encrypted-scope:ciphertext" }]), "requested");
  expect(h.claim).toHaveBeenCalledExactlyOnceWith("requested");
});

it("does not execute when another launcher wins the atomic claim", async () => {
  h.claim.mockResolvedValue(null);
  await startQueuedAgentRun(service([{ id: "requested" }]), "requested");
  expect(h.execute).not.toHaveBeenCalled();
});
