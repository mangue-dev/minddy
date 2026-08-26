import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  childRegistryPath,
  forgetHarnessChild,
  killTargets,
  noteHarnessChild,
  parseChildRegistry,
  readHarnessChildren,
} from "./child-registry";

/**
 * MIN-293 — THE RECORD OF WHAT SURVIVES THE HARNESS.
 *
 * The case it handles is the one where no one speaks anymore: a harness
 * killed abruptly (⌘Q, host crash, `SIGKILL`) leaves behind an OpenCode
 * server holding a port, so the next round fails on a refused `listen` far
 * away from the real cause.
 *
 * The important tests therefore cover damaged files (the normal case here)
 * and kill authorization: a `process.kill` on the wrong number kills another
 * process in the user's session, which cannot be repaired.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "minddy-children-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("parseChildRegistry", () => {
  it("reads back a valid entry", () => {
    expect(
      parseChildRegistry({
        children: [
          { pid: 4242, birth: "b4242", kind: "opencode", label: "serve" },
        ],
      }),
    ).toEqual([
      { pid: 4242, birth: "b4242", kind: "opencode", label: "serve" },
    ]);
  });

  it("rejects zero, one, and negative PIDs before cleanup", () => {
    // `0` signals the caller's entire group, `1` is launchd, and a negative
    // PID signals an entire group. None can come from a legitimate `spawn`.
    for (const pid of [0, 1, -1, -4242, 1.5, "4242"]) {
      expect(
        parseChildRegistry({
          children: [{ pid, birth: "invalid", kind: "opencode" }],
        }),
      ).toEqual([]);
    }
  });

  it("ignores an unknown kind so a future version cannot authorize cleanup", () => {
    expect(
      parseChildRegistry({
        children: [{ pid: 42, birth: "b42", kind: "sidecar" }],
      }),
    ).toEqual([]);
  });

  it("deduplicates by PID", () => {
    expect(
      parseChildRegistry({
        children: [
          { pid: 42, birth: "b42", kind: "opencode" },
          { pid: 42, birth: "b42", kind: "background" },
        ],
      }),
    ).toHaveLength(1);
  });

  it("returns an empty list for malformed and legacy entries", () => {
    expect(parseChildRegistry(null)).toEqual([]);
    expect(parseChildRegistry("{truncated")).toEqual([]);
    expect(parseChildRegistry({ children: "42" })).toEqual([]);
    expect(
      parseChildRegistry({ children: [{ pid: 42, kind: "opencode" }] }),
    ).toEqual([]);
    expect(parseChildRegistry({})).toEqual([]);
  });
});

describe("registry file", () => {
  it("registers, reads, and forgets children", () => {
    noteHarnessChild(dir, {
      pid: 111,
      birth: "b111",
      kind: "opencode",
      label: "serve --port 51234",
    });
    noteHarnessChild(dir, {
      pid: 222,
      birth: "b222",
      kind: "background",
      label: "npm run dev",
    });
    expect(readHarnessChildren(dir).map((c) => c.pid)).toEqual([111, 222]);

    forgetHarnessChild(dir, 111);
    expect(readHarnessChildren(dir).map((c) => c.pid)).toEqual([222]);
  });

  it("replaces an entry for the same PID", () => {
    noteHarnessChild(dir, { pid: 111, birth: "old", kind: "opencode" });
    noteHarnessChild(dir, {
      pid: 111,
      birth: "new",
      kind: "opencode",
      label: "restarted",
    });
    expect(readHarnessChildren(dir)).toEqual([
      { pid: 111, birth: "new", kind: "opencode", label: "restarted" },
    ]);
  });

  it("creates the directory before registering", () => {
    const deep = join(dir, "not", "there", "yet");
    noteHarnessChild(deep, { pid: 333, birth: "b333", kind: "opencode" });
    expect(readHarnessChildren(deep)).toHaveLength(1);
  });

  it("returns an empty list for a truncated file without throwing", () => {
    writeFileSync(childRegistryPath(dir), '{"children": [{"pid": 1', "utf8");
    expect(() => readHarnessChildren(dir)).not.toThrow();
    expect(readHarnessChildren(dir)).toEqual([]);
  });

  it("returns an empty list when nothing was registered", () => {
    expect(readHarnessChildren(dir)).toEqual([]);
  });
});

describe("killTargets", () => {
  const children = [
    { pid: 500, birth: "b500", kind: "opencode" as const, label: "serve" },
    {
      pid: 600,
      birth: "b600",
      kind: "background" as const,
      label: "npm run dev",
    },
  ];
  const birthOf = (pid: number) => `b${pid}`;

  it("signals a background group and the OpenCode server PID", () => {
    // A background job uses `setsid` and leads its own session. Killing only
    // the leader would leave the `npm run dev` process holding port 3000.
    expect(killTargets(children, { pid: 1 }, birthOf)).toEqual([
      { signalTo: -600, kind: "background", label: "npm run dev" },
      { signalTo: 500, kind: "opencode", label: "serve" },
    ]);
  });

  it("orders background jobs before the OpenCode server", () => {
    const order = killTargets(children, { pid: 1 }, birthOf).map((t) => t.kind);
    expect(order).toEqual(["background", "opencode"]);
  });

  it("never signals itself or its parent", () => {
    // A corrupt registry containing the main process PID must not terminate
    // the app while it believes it is cleaning up.
    const targets = killTargets(children, { pid: 500, ppid: 600 }, birthOf);
    expect(targets).toEqual([]);
  });

  it("rejects a PID whose birth identity no longer matches", () => {
    expect(killTargets(children, { pid: 1 }, () => "recycled")).toEqual([]);
  });

  it("returns an empty list for an empty registry", () => {
    expect(killTargets([], { pid: 42 })).toEqual([]);
  });
});
