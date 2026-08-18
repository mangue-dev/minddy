import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { signLocalExecToken, resolveLocalExecSecret } from "./local-exec-token";

/**
 * MIN-355 — THE SECOND WAY OF ADMISSION, exercised on the real gate.
 *
 * `defineSandboxProxy(handler, invalidRequestHandler?)` calls its SECOND
 * argument with the original request, body not consumed, when the headers
 * `vercel-forwarded-*` are missing. This is where a trick takes place that plays on the user's
 * machine — so a `catch` on the existing door, neither route
 * twin nor fork.
 *
 * The test imports the ROUTE and sends real requests to it: `app/**` is outside the
 * scope of `vitest.config.ts` (`include: ["lib/**"]`), but nothing prevents a
 * test of `lib/` from importing it — and a lexical test would not have said if the token
 * is really read, nor if the body arrives intact on the other side.
 *
 * Only the control plane module is mocked: this is what OUT (base, ledger,
 * tools). Inlet, surface bypass and body cap,
 * are the real path.
 */

const h = vi.hoisted(() => ({
  seen: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/agent/control-plane", () => ({
  // Small express: the 413 is then proven with a body of a few bytes.
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
    // The run comes from the CLAIM, never from the body — like on the microVM path.
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
    // This is the unknown that the framing had left open: if the proxy had
    // already read the flow, a checkpoint would never go through this route.
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
 * AND ONLY ONE DOOR. The following reads in the SOURCE because it is a
 * property of the file, not of its behavior: two copies of the body cap
 * would behave identically on the day they are written, and differently on the day
 * when only one is changed.
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
