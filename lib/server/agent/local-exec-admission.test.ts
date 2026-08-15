import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { signLocalExecToken, resolveLocalExecSecret } from "./local-exec-token";

/**
 * MIN-355 — LA DEUXIÈME VOIE D'ADMISSION, exercée sur la vraie porte.
 *
 * `defineSandboxProxy(handler, invalidRequestHandler?)` appelle son SECOND
 * argument avec la requête originale, corps non consommé, quand les en-têtes
 * `vercel-forwarded-*` manquent. C'est là que passe un tour qui joue sur la
 * machine de l'utilisateur — donc un `catch` sur la porte existante, ni route
 * jumelle ni fork.
 *
 * Le test importe la ROUTE et lui envoie de vraies requêtes : `app/**` est hors du
 * périmètre de `vitest.config.ts` (`include: ["lib/**"]`), mais rien n'empêche un
 * test de `lib/` de l'importer — et un test lexical n'aurait pas dit si le jeton
 * est vraiment lu, ni si le corps arrive intact de l'autre côté.
 *
 * Seul le module de plan de contrôle est moqué : c'est ce qui SORT (base, ledger,
 * tools). L'admission, la dérivation de la surface et le plafond de corps, eux,
 * sont le vrai chemin.
 */

const h = vi.hoisted(() => ({
  seen: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/agent/control-plane", () => ({
  // Petit exprès : le 413 se prouve alors avec un corps de quelques octets.
  CONTROL_PLANE_MAX_BODY_BYTES: 120,
  handleControlPlaneRequest: vi.fn(async (opts: Record<string, unknown>) => {
    h.seen.push(opts);
    return { status: 200, body: { ok: true } };
  }),
}));

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-role-key-de-test";

import { POST, GET } from "@/app/api/agent-vm/[...path]/route";

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const ORIGIN = "https://minddy.test";

function bearer(gen = 2, runId = RUN_ID): string {
  const secret = resolveLocalExecSecret();
  if (!secret) throw new Error("le test a besoin d'un secret dérivable");
  return `Bearer ${signLocalExecToken({ runId, gen }, secret)}`;
}

function post(surface: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/agent-vm${surface}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.seen.length = 0;
});

describe("la voie locale du plan de contrôle", () => {
  it("admet un porteur de jeton et sert la surface qu'il demande", async () => {
    const res = await POST(
      post("/events", { type: "assistant_message" }, { authorization: bearer(2) }),
    );
    expect(res.status).toBe(200);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]).toMatchObject({
      runId: RUN_ID,
      method: "POST",
      surface: "/events",
      body: { type: "assistant_message" },
      local: { gen: 2 },
    });
    // Le run vient du CLAIM, jamais du corps — comme sur la voie de la microVM.
    expect(h.seen[0].sandboxName).toBeUndefined();
  });

  it("refuse en 403 une requête sans jeton, sans toucher au plan de contrôle", async () => {
    const res = await POST(post("/events", { type: "assistant_message" }));
    expect(res.status).toBe(403);
    expect(h.seen).toEqual([]);
  });

  it("refuse un jeton signé avec une autre clé", async () => {
    const forged = signLocalExecToken({ runId: RUN_ID, gen: 0 }, "pas-notre-cle");
    const res = await POST(
      post("/events", {}, { authorization: `Bearer ${forged}` }),
    );
    expect(res.status).toBe(403);
    expect(h.seen).toEqual([]);
  });

  it("rend le corps INTACT — le second argument le reçoit non consommé", async () => {
    // C'est l'inconnue que le cadrage avait laissée ouverte : si le proxy avait
    // déjà lu le flux, un checkpoint ne passerait jamais par cette voie.
    const checkpoint = { messages: [], note: "x".repeat(8) };
    await POST(post("/checkpoint", { checkpoint }, { authorization: bearer() }));
    expect(h.seen[0]?.body).toEqual({ checkpoint });
  });

  it("garde le 413 EXPLICITE, celui de la microVM, sur la voie locale aussi", async () => {
    const res = await POST(
      post("/checkpoint", { checkpoint: "x".repeat(200) }, { authorization: bearer() }),
    );
    expect(res.status).toBe(413);
    expect(h.seen).toEqual([]);
  });

  it("refuse un corps illisible en 400, et un chemin hors du plan en 404", async () => {
    const bad = new Request(`${ORIGIN}/api/agent-vm/events`, {
      method: "POST",
      headers: { authorization: bearer() },
      body: "{pas du json",
    });
    expect((await POST(bad)).status).toBe(400);

    const off = new Request(`${ORIGIN}/api/autre-chose`, {
      method: "GET",
      headers: { authorization: bearer() },
    });
    expect((await GET(off)).status).toBe(404);
    expect(h.seen).toEqual([]);
  });

  it("laisse un GET passer sans corps", async () => {
    const res = await GET(
      new Request(`${ORIGIN}/api/agent-vm/budget`, {
        headers: { authorization: bearer(5) },
      }),
    );
    expect(res.status).toBe(200);
    expect(h.seen[0]).toMatchObject({ method: "GET", surface: "/budget", body: null });
  });
});

/**
 * ET UNE SEULE PORTE. Ce qui suit se lit dans la SOURCE parce que c'est une
 * propriété du fichier, pas de son comportement : deux copies du plafond de corps
 * se comporteraient identiquement le jour où on les écrit, et différemment le jour
 * où on n'en change qu'une.
 */
describe("le 413, le parsing et l'appel du module ne sont écrits qu'une fois", () => {
  const source = readFileSync(
    join(__dirname, "../../../app/api/agent-vm/[...path]/route.ts"),
    "utf8",
  );
  const count = (needle: string) => source.split(needle).length - 1;

  it("un seul `handleControlPlaneRequest`, un seul plafond, un seul parsing", () => {
    expect(count("handleControlPlaneRequest({")).toBe(1);
    expect(count("raw.length > CONTROL_PLANE_MAX_BODY_BYTES")).toBe(1);
    expect(count("JSON.parse(raw)")).toBe(1);
  });

  it("les deux admissions vivent sur la MÊME `defineSandboxProxy`", () => {
    expect(count("defineSandboxProxy(")).toBe(1);
    expect(source).toContain("admitSandboxCaller(");
    expect(source).toContain("admitLocalCaller(");
  });
});
