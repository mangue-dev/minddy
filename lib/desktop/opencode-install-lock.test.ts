import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { withOpencodeInstallLock } from "./opencode-install-lock";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("OpenCode installation lock", () => {
  it("serializes installers that share a filesystem directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "minddy-opencode-lock-"));
    dirs.push(root);
    const installDir = join(root, "opencode");
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];

    const install = (name: string) =>
      withOpencodeInstallLock(installDir, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`${name}:start`);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        order.push(`${name}:end`);
        active -= 1;
      });

    await Promise.all([install("first"), install("second")]);
    expect(maxActive).toBe(1);
    expect(order).toHaveLength(4);
    expect(order[0].split(":")[0]).toBe(order[1].split(":")[0]);
    expect(order[0]).toMatch(/:start$/);
    expect(order[1]).toMatch(/:end$/);
    expect(order[2]).toMatch(/:start$/);
    expect(order[3]).toMatch(/:end$/);
  });
});
