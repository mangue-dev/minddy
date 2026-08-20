import { describe, expect, it } from "vitest";

import { cloudLayout, layoutForRoot } from "../harness-layout";
import { parseVmJob, vmBundlePath, vmJobPath, VM_PROTOCOL_VERSION } from "./protocol";

/**
 * MIN-354 — THE CONTRACT BETWEEN THE FUNCTION AND THE HARNESS, AND ITS NUMBER.
 *
 * What this file keeps did not exist before: until now the harness was
 * WRITTEN by the deployment which launched it, each turn, therefore the job and the
 * bundle could not be of different ages. They can do so as soon as the
 * bundle is downloaded and then CACHED on a machine.
 *
 * A bundle from yesterday that reads a job from today does not throw: JSON.parse succeeds,
 * the known fields are read, the others ignored — and the turn starts with the
 * old paths. On this lot precisely: it would write to `/vercel/sandbox`
 * on a Mac, that is to say nowhere. Explicit refusal is the only form that
 * transforms this silence into something we see.
 */

const job = (over: Record<string, unknown> = {}) => ({
  protocolVersion: VM_PROTOCOL_VERSION,
  layout: cloudLayout(),
  runId: "r-1",
  workBranch: "minddy/agent-1",
  repoMode: "clone",
  committer: { name: "minddy agent", email: "agent@minddy.app" },
  appOrigin: "https://minddy.example",
  ...over,
});

describe("parseVmJob", () => {
  it("laisse passer un job de la bonne version", () => {
    expect(parseVmJob(job()).runId).toBe("r-1");
  });

  it("REFUSE une version qu'il ne connaît pas, et dit laquelle il parle", () => {
    // The real case: a cached harness, older than the function that launches it.
    expect(() => parseVmJob(job({ protocolVersion: VM_PROTOCOL_VERSION + 1 }))).toThrow(
      new RegExp(`unsupported protocol version.+${VM_PROTOCOL_VERSION}`, "s"),
    );
  });

  it("REFUSE un job sans version — c'est la forme d'avant le contrat", () => {
    expect(() => parseVmJob(job({ protocolVersion: undefined }))).toThrow(/protocol version/i);
  });

  it("refuse un job sans layout plutôt que de retomber sur `/vercel`", () => {
    // A silent fallback would be exactly the tolerance that the version exists
    // to delete: the trick would turn, somewhere other than where we believe.
    expect(() => parseVmJob(job({ layout: undefined }))).toThrow(/layout/i);
  });

  it("refuse un layout que les garde-fous ne sauraient pas tenir", () => {
    const broken = { ...cloudLayout(), repoDir: "repo" };
    expect(() => parseVmJob(job({ layout: broken }))).toThrow(/absolute/i);
  });

  it("requires a relay URL for a server-hosted job", () => {
    expect(() => parseVmJob(job({ executionEnvironment: "server", controlToken: "token" }))).toThrow(
      /LLM relay URL/i,
    );
  });

  /**
 * MIN-358 — the deposit mode has NO default, and it is asymmetrical on purpose:
 * `current` is the one you don't want to play by accident, and it is
 * precisely the one that a job of an unexpected form would leave out.
 */
  it("refuse un job qui ne dit pas dans quel dépôt il écrit", () => {
    expect(() => parseVmJob(job({ repoMode: undefined }))).toThrow(/repoMode/i);
    expect(() => parseVmJob(job({ repoMode: "worktree" as never }))).toThrow(/repoMode/i);
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(() => parseVmJob(null)).toThrow(/object/i);
    expect(() => parseVmJob("{}")).toThrow();
  });
});

describe("les chemins du harness", () => {
  it("suivent le layout du run", () => {
    const layout = layoutForRoot("/work/r-7", "/opt/oc");
    expect(vmBundlePath(layout)).toBe("/work/r-7/harness/main.js");
    expect(vmJobPath(layout)).toBe("/work/r-7/harness/job.json");
  });

  it("valent, dans le cloud, ce qu'ils ont toujours valu", () => {
    expect(vmBundlePath(cloudLayout())).toBe("/vercel/sandbox/harness/main.js");
    expect(vmJobPath(cloudLayout())).toBe("/vercel/sandbox/harness/job.json");
  });
});
