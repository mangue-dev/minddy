import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

/**
 * MIN-293 — HARNESS DELIVERY TO THE USER'S MACHINE.
 *
 * Two things are required here, and neither is inferred from a type:
 *
 * 1. **The manifest tells the truth about the bytes served.** The fingerprint is this
 * which decides whether the launcher forks or refuses; a manifest that would describe a
 * file other than that of the neighboring route would cause ALL rounds to fail,
 * or — worse — pass a bundle that was not used.
 * 2. **Both routes are authenticated.** The bundle carries no secret
 * (`vm-bundle-secrets.test.ts` the holds) but it has nothing to do with anonymous access, and a regression on this point is exactly the sort of thing
 * that you never notice: the route continues to walk.
 *
 * The test imports the REAL routes (`app/**` is outside the scope de
 * `vitest.config.ts`, but a test of `lib/` can fetch them — cf.
 * [local-surface-coverage.test.ts](local-surface-coverage.test.ts)). Only
 * authentication and file reading are mocked: these are both
 * only IO, and the rest is the real path.
 */

const h = vi.hoisted(() => ({
  authed: true,
  bundle: "console.log('harness');\n" as string | null,
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () =>
    h.authed
      ? { ok: true as const, user: { id: "user-1" } }
      : { ok: false as const, response: Response.json({ error: "Unauthorized" }, { status: 401 }) },
  ),
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

async function manifestRoute() {
  return (await import("@/app/api/desktop/harness/route")).GET;
}
async function bundleRoute() {
  return (await import("@/app/api/desktop/harness/bundle/route")).GET;
}

function request(path: string): NextRequest {
  return new NextRequest(`https://minddy.test${path}`);
}

/** The cache is PER INSTANCE FUNCTION in production; here it must be returned. */
async function forgetCache(): Promise<void> {
  const mod = await import("./harness-bundle");
  mod.forgetHarnessBundleCache();
}

beforeEach(async () => {
  h.authed = true;
  h.bundle = "console.log('harness');\n";
  await forgetCache();
});

afterEach(async () => {
  await forgetCache();
});

describe("GET /api/desktop/harness", () => {
  it("rend l'empreinte, la taille et les deux versions du contrat", async () => {
    const response = await (await manifestRoute())(request("/api/desktop/harness"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      protocolVersion: VM_PROTOCOL_VERSION,
      opencodeVersion: OPENCODE_VERSION,
      sha256: createHash("sha256").update(h.bundle!, "utf8").digest("hex"),
      bytes: Buffer.byteLength(h.bundle!, "utf8"),
    });
  });

  it("ne se met JAMAIS en cache — une empreinte périmée ferait refuser le fork", async () => {
    const response = await (await manifestRoute())(request("/api/desktop/harness"));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuse un appelant sans session", async () => {
    h.authed = false;
    expect((await (await manifestRoute())(request("/api/desktop/harness"))).status).toBe(401);
  });

  it("rend 503 quand ce déploiement n'a pas de bundle — pas un 500 anonyme", async () => {
    h.bundle = null;
    const response = await (await manifestRoute())(request("/api/desktop/harness"));
    // 503: the machine must be able to distinguish “this deployment cannot
    // serve as harness” of “I’m not connected” and write it to the log.
    expect(response.status).toBe(503);
  });
});

describe("GET /api/desktop/harness/bundle", () => {
  it("sert les octets, avec l'empreinte que le manifeste annonce", async () => {
    const manifest = await (await manifestRoute())(request("/api/desktop/harness")).then((r) =>
      r.json(),
    );
    const response = await (await bundleRoute())(request("/api/desktop/harness/bundle"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(h.bundle);
    // THE point of the test: the two routes talk about the same file. If they
    // diverge, the thrower would refuse all rounds without anyone knowing why.
    expect(response.headers.get("x-minddy-harness-sha256")).toBe(manifest.sha256);
  });

  it("ne se présente jamais comme un script exécutable par un navigateur", async () => {
    const response = await (await bundleRoute())(request("/api/desktop/harness/bundle"));
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  it("refuse un appelant sans session", async () => {
    h.authed = false;
    expect(
      (await (await bundleRoute())(request("/api/desktop/harness/bundle"))).status,
    ).toBe(401);
  });

  it("rend 503 quand le bundle manque", async () => {
    h.bundle = null;
    expect(
      (await (await bundleRoute())(request("/api/desktop/harness/bundle"))).status,
    ).toBe(503);
  });
});

describe("le cache du bundle", () => {
  it("ne relit pas le fichier à chaque appel", async () => {
    const { readFile } = await import("node:fs/promises");
    const spy = vi.mocked(readFile);
    spy.mockClear();

    const get = await manifestRoute();
    await get(request("/api/desktop/harness"));
    await get(request("/api/desktop/harness"));
    await (await bundleRoute())(request("/api/desktop/harness/bundle"));

    const reads = spy.mock.calls.filter(
      ([file]) => typeof file === "string" && file.endsWith(".agent-vm/main.js"),
    );
    expect(reads).toHaveLength(1);
  });

  it("REPART à zéro après un échec — sinon un build en retard resterait cassé", async () => {
    h.bundle = null;
    expect((await (await manifestRoute())(request("/api/desktop/harness"))).status).toBe(503);
    // The bundle arrives (following deployment, or `npm run build:agent-vm` in dev):
    // the same instance must be able to serve it, without restarting.
    h.bundle = "console.log('plus tard');\n";
    expect((await (await manifestRoute())(request("/api/desktop/harness"))).status).toBe(200);
  });
});
