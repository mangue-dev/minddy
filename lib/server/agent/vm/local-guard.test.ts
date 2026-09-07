import { describe, expect, it } from "vitest";

import {
  LOCAL_CAPABILITY_REASON,
  type PermissionAsk,
  type PermissionVerdict,
} from "./opencode-permissions";
import { realPathOf, refineLocalVerdict } from "./local-guard";

const REPO = "/Users/dev/Projects/minddy";
const ALLOW: PermissionVerdict = { reply: "once" };
const ask = (input: Partial<PermissionAsk>): PermissionAsk => ({
  id: "permission-1",
  sessionId: "session-1",
  permission: "read",
  callId: "call-1",
  ...input,
});

function mappedRealpath(entries: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const target = entries[path];
    if (!target) throw new Error("missing");
    return target;
  };
}

describe("local filesystem permission refinement", () => {
  it("resolves the nearest existing ancestor for a missing target", async () => {
    const realpath = mappedRealpath({
      [REPO]: REPO,
      [`${REPO}/generated`]: `${REPO}/generated`,
    });
    await expect(
      realPathOf(`${REPO}/generated/new/file.ts`, realpath),
    ).resolves.toBe(`${REPO}/generated/new/file.ts`);
  });

  it("rejects a read through a repository symlink to a host path", async () => {
    const realpath = mappedRealpath({
      [REPO]: REPO,
      [`${REPO}/linked-secret`]: "/Users/dev/.ssh/id_ed25519",
    });
    await expect(
      refineLocalVerdict(
        ask({ permission: "read", filepath: `${REPO}/linked-secret` }),
        ALLOW,
        REPO,
        { realpath },
      ),
    ).resolves.toMatchObject({
      reply: "reject",
      reason: LOCAL_CAPABILITY_REASON,
    });
  });

  it("rejects a write below a symlinked directory", async () => {
    const realpath = mappedRealpath({
      [REPO]: REPO,
      [`${REPO}/linked-dir`]: "/tmp/outside",
    });
    await expect(
      refineLocalVerdict(
        ask({ permission: "edit", filepath: `${REPO}/linked-dir/new.ts` }),
        ALLOW,
        REPO,
        { realpath },
      ),
    ).resolves.toMatchObject({ reply: "reject" });
  });

  it("allows a read and write whose resolved paths remain in the repository", async () => {
    const realpath = mappedRealpath({
      [REPO]: REPO,
      [`${REPO}/lib`]: `${REPO}/lib`,
      [`${REPO}/lib/existing.ts`]: `${REPO}/lib/existing.ts`,
    });
    for (const request of [
      ask({ permission: "read", filepath: `${REPO}/lib/existing.ts` }),
      ask({ permission: "edit", filepath: `${REPO}/lib/new.ts` }),
    ]) {
      await expect(
        refineLocalVerdict(request, ALLOW, REPO, { realpath }),
      ).resolves.toEqual(ALLOW);
    }
  });

  it("never widens an earlier rejection", async () => {
    const rejected: PermissionVerdict = {
      reply: "reject",
      message: "denied",
    };
    const realpath = async (): Promise<string> => {
      throw new Error("filesystem should not be inspected");
    };
    await expect(
      refineLocalVerdict(
        ask({ permission: "read", filepath: `${REPO}/lib/x.ts` }),
        rejected,
        REPO,
        { realpath },
      ),
    ).resolves.toEqual(rejected);
  });
});
