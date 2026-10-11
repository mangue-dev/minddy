import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeDeliveryGate } from "./delivery-gate";
import { cloudLayout } from "./harness-layout";
import { newPlanWriteSink } from "./plan-closure";
import type { RepoHost } from "./repo-host";

const h = vi.hoisted(() => ({ types: vi.fn(), tests: vi.fn() }));
vi.mock("./diagnostics", async (original) => ({
  ...await original<typeof import("./diagnostics")>(),
  typeErrorsForTurn: h.types, testFailuresForTurn: h.tests,
}));
vi.mock("./repo-host", async (original) => ({
  ...await original<typeof import("./repo-host")>(),
  turnDiffStat: async () => ({ files: ["fixture.ts"], lines: 1, untracked: 0 }),
  turnDiff: async () => ({ diff: "", porcelain: "" }),
}));
vi.mock("./self-review", async (original) => ({
  ...await original<typeof import("./self-review")>(),
  formatSelfReview: () => null,
}));

const ROOMY = 600_000;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
function fixture(exec: RepoHost["exec"], emit: Parameters<typeof makeDeliveryGate>[0]["emit"] = async () => {}) {
  const editedPaths = new Set(["first.ts"]);
  const host: RepoHost = { layout: cloudLayout(), processIsolation: "sandbox", exec,
    readFile: async () => null, writeFile: async () => {}, mkdir: async () => {} };
  const gate = makeDeliveryGate({ host, emit, editedPaths, repoTouched: true,
    planWrites: newPlanWriteSink(), filesFromSha: "base", logPrefix: "[test]" });
  return { gate, editedPaths };
}
const success = { exitCode: 0, stdout: "", stderr: "" };
beforeEach(() => {
  vi.resetAllMocks();
  h.types.mockResolvedValue(null);
  h.tests.mockResolvedValue({ block: null, scope: "related" });
});
afterEach(() => { vi.restoreAllMocks(); });

it("serializes overlapping validations and retains each invocation's deadline and warning", async () => {
  let wall = 0;
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  const entered = deferred(); const finish = deferred();
  const calls: Array<{ command: string; timeoutMs: number | undefined }> = [];
  const { gate, editedPaths } = fixture(async (command, options) => {
    calls.push({ command, timeoutMs: options?.timeoutMs });
    if (command === "first-types") {
      entered.resolve(); await finish.promise; wall = 50_000;
    } else if (command === "first-tests") wall = 100_000;
    else if (command === "second-types") wall += options!.timeoutMs!;
    return success;
  });
  h.types.mockImplementationOnce(async (host: RepoHost) => { await host.exec("first-types", { timeoutMs: 120_000 }); return null; });
  h.types.mockImplementationOnce(async (host: RepoHost) => { await host.exec("second-types", { timeoutMs: 240_000 }); return null; });
  h.tests.mockImplementationOnce(async (host: RepoHost) => { await host.exec("first-tests", { timeoutMs: 240_000 }); return { block: null, scope: "related" }; });
  const first = gate.checkChanges(ROOMY);
  await entered.promise;
  wall = 10_000; editedPaths.add("second.ts");
  const second = gate.checkChanges(ROOMY);
  try {
    // Let a concurrent invocation enter its check if the gate fails to serialize.
    await Promise.resolve(); await Promise.resolve();
    expect(h.types).toHaveBeenCalledTimes(1);
    expect(h.tests).not.toHaveBeenCalled();
  } finally {
    finish.resolve();
    await Promise.allSettled([first, second]);
  }
  expect(await first).toBeNull();
  expect(await second).toContain("unverified");
  expect(calls).toEqual([
    { command: "first-types", timeoutMs: 120_000 },
    { command: "first-tests", timeoutMs: 100_000 },
    { command: "second-types", timeoutMs: 60_000 },
  ]);
});

it("reports queued validation as unverified without starting checks after its own budget expires", async () => {
  let wall = 0;
  vi.spyOn(Date, "now").mockImplementation(() => wall);
  const entered = deferred(); const finish = deferred();
  const { gate, editedPaths } = fixture(async () => {
    entered.resolve(); await finish.promise; wall = 50_000; return success;
  });
  h.types.mockImplementationOnce(async (host: RepoHost) => { await host.exec("types"); return null; });
  const first = gate.checkChanges(ROOMY);
  await entered.promise;
  editedPaths.add("queued.ts");
  const second = gate.checkChanges(ROOMY, 20_000);
  finish.resolve();
  expect(await first).toBeNull();
  expect(await second).toContain("unverified");
  expect(h.types).toHaveBeenCalledTimes(1);
  expect(h.tests).toHaveBeenCalledTimes(1);
  expect(editedPaths.has("queued.ts")).toBe(true);
});

it("releases the validation queue after an unexpected status emission failure", async () => {
  const entered = deferred(); const finish = deferred();
  let fail = true;
  const { gate, editedPaths } = fixture(async () => {
    entered.resolve(); await finish.promise; return success;
  }, async () => { if (fail) { fail = false; throw new Error("status unavailable"); } });
  h.types.mockImplementationOnce(async (host: RepoHost) => { await host.exec("types"); return null; });
  const first = gate.checkChanges(ROOMY).catch((error) => error);
  await entered.promise;
  editedPaths.add("queued.ts");
  const second = gate.checkChanges(ROOMY).catch((error) => error);
  finish.resolve();
  expect(await first).toMatchObject({ message: "status unavailable" });
  expect(await second).toBeNull();
  expect(h.types).toHaveBeenCalledTimes(2);
  expect(h.tests).toHaveBeenCalledTimes(1);
});
