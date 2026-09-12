import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

const h = vi.hoisted(() => ({
  bundle: "console.log('harness');\n" as string | null,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (file: string, encoding?: unknown) => {
      if (typeof file === "string" && file.endsWith(".agent-vm/main.js")) {
        if (h.bundle === null) throw new Error("ENOENT: no such file or directory");
        return h.bundle;
      }
      return actual.readFile(file as never, encoding as never);
    }),
  };
});

async function bundleModule() {
  return await import("./harness-bundle");
}

beforeEach(async () => {
  h.bundle = "console.log('harness');\n";
  (await bundleModule()).forgetHarnessBundleCache();
});

afterEach(async () => {
  (await bundleModule()).forgetHarnessBundleCache();
});

describe("server sandbox harness bundle", () => {
  it("returns the bytes used by server sandbox launchers", async () => {
    expect(await (await bundleModule()).harnessBundleSource()).toBe(h.bundle);
  });

  it("keeps the manifest consistent with the server bundle", async () => {
    const manifest = await (await bundleModule()).harnessBundleManifest();
    expect(manifest).toEqual({
      protocolVersion: VM_PROTOCOL_VERSION,
      opencodeVersion: OPENCODE_VERSION,
      sha256: createHash("sha256").update(h.bundle!, "utf8").digest("hex"),
      bytes: Buffer.byteLength(h.bundle!, "utf8"),
    });
  });

  it("reads a production bundle once per process", async () => {
    const { readFile } = await import("node:fs/promises");
    const spy = vi.mocked(readFile);
    spy.mockClear();

    const bundle = await bundleModule();
    await bundle.harnessBundleSource();
    await bundle.harnessBundleSource();
    await bundle.harnessBundleManifest();

    expect(
      spy.mock.calls.filter(
        ([file]) => typeof file === "string" && file.endsWith(".agent-vm/main.js"),
      ),
    ).toHaveLength(1);
  });

  it("retries after a missing build artifact", async () => {
    const bundle = await bundleModule();
    h.bundle = null;
    await expect(bundle.harnessBundleSource()).rejects.toThrow("agent VM bundle missing");

    h.bundle = "console.log('available');\n";
    await expect(bundle.harnessBundleSource()).resolves.toBe(h.bundle);
  });
});
