import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { OPENCODE_VERSION } from "./vm/opencode-version";
import { VM_PROTOCOL_VERSION } from "./vm/protocol";

/**
 * MIN-293 — LA LIVRAISON DU HARNESS SUR LA MACHINE DE L'UTILISATEUR.
 *
 * Deux choses sont tenues ici, et aucune ne se déduit d'un type :
 *
 *  1. **Le manifeste dit la vérité sur les octets servis.** L'empreinte est ce
 *     qui décide si le lanceur forke ou refuse ; un manifeste qui décrirait un
 *     autre fichier que celui de la route voisine ferait échouer TOUS les tours,
 *     ou — pire — passer un bundle qu'on n'a pas servi.
 *  2. **Les deux routes sont authentifiées.** Le bundle ne porte aucun secret
 *     (`vm-bundle-secrets.test.ts` le tient) mais il n'a rien à faire en accès
 *     anonyme, et une régression sur ce point est exactement le genre de chose
 *     qu'on ne remarque jamais : la route continue de marcher.
 *
 * Le test importe les VRAIES routes (`app/**` est hors du périmètre de
 * `vitest.config.ts`, mais un test de `lib/` peut aller les chercher — cf.
 * [local-surface-coverage.test.ts](local-surface-coverage.test.ts)). Seuls
 * l'authentification et la lecture du fichier sont moqués : ce sont les deux
 * seuls IO, et le reste est le vrai chemin.
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

/** Le cache est PAR INSTANCE DE FONCTION en production ; ici il faut le rendre. */
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
    // 503 : la machine doit pouvoir distinguer « ce déploiement ne peut pas
    // servir de harness » de « je ne suis pas connecté » et l'écrire au journal.
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
    // LE point du test : les deux routes parlent du même fichier. Si elles
    // divergeaient, le lanceur refuserait tous les tours sans qu'on sache pourquoi.
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
    // Le bundle arrive (déploiement suivant, ou `npm run build:agent-vm` en dev) :
    // la même instance doit pouvoir le servir, sans redémarrage.
    h.bundle = "console.log('plus tard');\n";
    expect((await (await manifestRoute())(request("/api/desktop/harness"))).status).toBe(200);
  });
});
