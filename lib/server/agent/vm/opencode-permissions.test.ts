import { describe, expect, it } from "vitest";

import { FORBIDDEN_COMMAND_REASON } from "../command-guard";
import {
  decidePermission,
  editTargets,
  LOCAL_CAPABILITY_REASON,
  SECRET_FILE_READ_REASON,
  UNKNOWN_PERMISSION_REASON,
  type PermissionAsk,
} from "./opencode-permissions";

const REPO = "/Users/dev/Projects/minddy";
const ask = (input: Partial<PermissionAsk>): PermissionAsk => ({
  id: "permission-1",
  sessionId: "session-1",
  permission: "read",
  callId: "call-1",
  ...input,
});
const decide = (input: Partial<PermissionAsk>, local = false) =>
  decidePermission(ask(input), REPO, undefined, { local });

describe("OpenCode permission decisions", () => {
  it("applies the command guard to cloud shell requests", () => {
    expect(decide({ permission: "bash", command: "npm test" })).toEqual({
      reply: "once",
    });
    expect(
      decide({ permission: "bash", command: "git reset --hard" }),
    ).toMatchObject({ reply: "reject", reason: FORBIDDEN_COMMAND_REASON });
    expect(decide({ permission: "bash", command: "" }).reply).toBe("reject");
  });

  it("removes shell and direct URL access from local runs", () => {
    for (const request of [
      { permission: "bash", command: "echo safe" },
      { permission: "webfetch", url: "https://example.com" },
      { permission: "external_directory", filepath: "/tmp" },
    ]) {
      expect(decide(request, true)).toMatchObject({
        reply: "reject",
        reason: LOCAL_CAPABILITY_REASON,
      });
    }
  });

  it("contains every write and protects Git internals", () => {
    expect(decide({ permission: "edit", filepath: `${REPO}/lib/x.ts` })).toEqual(
      { reply: "once" },
    );
    for (const filepath of [
      "/etc/passwd",
      "../../outside.ts",
      `${REPO}/.git/config`,
      `${REPO}/packages/ui/.GIT/hooks/pre-commit`,
    ]) {
      expect(decide({ permission: "edit", filepath }).reply).toBe("reject");
    }
  });

  it("rejects a multi-file patch when any target is unsafe", () => {
    const files: NonNullable<PermissionAsk["files"]> = [
      { path: `${REPO}/lib/x.ts`, status: "modified" },
      { path: `${REPO}/.git/config`, status: "modified" },
    ];
    expect(
      decide({ permission: "edit", filepath: files.map((f) => f.path).join(", "), files })
        .reply,
    ).toBe("reject");
    expect(editTargets(ask({ permission: "edit", files }))).toEqual(files);
  });

  it("contains local reads and rejects secret-bearing files", () => {
    expect(decide({ permission: "read", filepath: "lib/x.ts" }, true)).toEqual({
      reply: "once",
    });
    expect(
      decide({ permission: "read", filepath: "/etc/passwd" }, true),
    ).toMatchObject({ reply: "reject", reason: LOCAL_CAPABILITY_REASON });
    expect(
      decide({ permission: "read", filepath: `${REPO}/.env.local` }, true),
    ).toMatchObject({ reply: "reject", reason: SECRET_FILE_READ_REASON });
    expect(
      decide({ permission: "read", filepath: `${REPO}/.env.example` }, true),
    ).toEqual({ reply: "once" });
  });

  it("fails closed for unknown local permissions", () => {
    expect(decide({ permission: "future_host_tool" }, true)).toMatchObject({
      reply: "reject",
      reason: UNKNOWN_PERMISSION_REASON,
    });
    expect(decide({ permission: "future_cloud_tool" })).toEqual({ reply: "once" });
  });

  it("bounds delegation against the offered catalog and concurrency cap", () => {
    const context = {
      names: new Set(["explore", "general"]),
      running: 1,
      pending: 0,
      maxParallel: 2,
    };
    expect(
      decidePermission(
        ask({ permission: "task", subagentType: "general" }),
        REPO,
        context,
      ),
    ).toEqual({ reply: "once" });
    expect(
      decidePermission(
        ask({ permission: "task", subagentType: "missing" }),
        REPO,
        context,
      ).reply,
    ).toBe("reject");
    expect(
      decidePermission(
        ask({ permission: "task", subagentType: "general" }),
        REPO,
        { ...context, pending: 1 },
      ).reply,
    ).toBe("reject");
  });
});
