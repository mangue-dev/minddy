import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  serve: vi.fn(),
}));

vi.mock("@/lib/server/agent/control-plane", () => ({
  CONTROL_PLANE_MAX_BODY_BYTES: 4 * 1024 * 1024,
  handleControlPlaneRequest: h.serve,
}));

import { DELETE, GET, POST, PUT } from "@/app/api/agent-vm/[...path]/route";
import { resolveServerExecSecret, signServerExecToken } from "@/lib/server/agent/server-exec-token";

const ORIGIN = "https://control.example.test";
const RUN = "11111111-2222-4333-8444-555555555555";
let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  publicJwk = await exportJWK(keys.publicKey);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AGENT_CONTROL_ORIGIN", ORIGIN);
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL_TEAM_ID", "fixture-team");
  vi.stubEnv("VERCEL_PROJECT_ID", "fixture-project");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-server-control-secret");
  // Exercise the SDK's actual signature verification with a fixture JWKS endpoint.
  vi.stubGlobal("fetch", async (url: string | URL) => {
    expect(String(url)).toBe("https://oidc.vercel.com/fixture-team/.well-known/jwks");
    return Response.json({ keys: [publicJwk] });
  });
  h.serve.mockResolvedValue({ status: 404, body: { error: "unknown run" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedRequest(options: {
  audience?: string;
  incomingOrigin?: string;
  path?: string;
  method?: string;
  body?: string;
  teamId?: string;
  key?: CryptoKey;
} = {}): Promise<Request> {
  const token = await new SignJWT({
    team_id: options.teamId ?? "fixture-team",
    project_id: "fixture-project",
    sandbox_id: "fixture-sandbox",
    sandbox_name: `agent-v2-${RUN}`,
  }).setProtectedHeader({ alg: "RS256" })
    .setIssuer("https://oidc.vercel.com/fixture-team")
    .setAudience(options.audience ?? ORIGIN)
    .setIssuedAt().setExpirationTime("5m")
    .sign(options.key ?? privateKey);
  const path = options.path ?? "/api/agent-vm/interrupt";
  return new Request(`${options.incomingOrigin ?? "http://localhost:6463"}${path}`, {
    method: options.method ?? "GET",
    headers: {
      host: "attacker.example.test",
      "x-forwarded-host": "attacker.example.test",
      "x-forwarded-proto": "http",
      "vercel-forwarded-host": new URL(ORIGIN).host,
      "vercel-forwarded-scheme": "https",
      "vercel-forwarded-port": "443",
      "vercel-forwarded-path": path,
      "vercel-sandbox-oidc-token": token,
    },
    ...(options.body ? { body: options.body } : {}),
  });
}

it("verifies the configured HTTPS audience behind localhost despite tampered Host headers", async () => {
  const response = await GET(await signedRequest());
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "unknown run" });
  expect(h.serve).toHaveBeenCalledWith({
    runId: RUN, method: "GET", surface: "/interrupt", body: null,
    sandboxName: `agent-v2-${RUN}`,
  });
});

it.each(["https://attacker.example.test", "http://localhost:6463"])(
  "rejects a signed audience chosen through incoming headers or the internal URL: %s",
  async (audience) => {
    expect((await GET(await signedRequest({ audience }))).status).toBe(403);
    expect(h.serve).not.toHaveBeenCalled();
  },
);

it("rejects the original token when the configured control origin changes", async () => {
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "https://different-control.example.test");
  expect((await GET(await signedRequest())).status).toBe(403);
  expect(h.serve).not.toHaveBeenCalled();
});

it("still rejects an invalid signature with the correct configured audience", async () => {
  const keys = await generateKeyPair("RS256");
  expect((await GET(await signedRequest({ key: keys.privateKey }))).status).toBe(403);
  expect(h.serve).not.toHaveBeenCalled();
});

it("still rejects a foreign tenant after validating the OIDC signature and audience", async () => {
  const response = await GET(await signedRequest({ teamId: "foreign-team" }));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "foreign sandbox" });
  expect(h.serve).not.toHaveBeenCalled();
});

it("preserves the original deployed request URL when no explicit override is configured", async () => {
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "");
  expect((await GET(await signedRequest({ incomingOrigin: ORIGIN }))).status).toBe(404);
  expect(h.serve).toHaveBeenCalledOnce();
});

it("does not infer a trusted audience from forwarding headers without an explicit override", async () => {
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "");
  expect((await GET(await signedRequest())).status).toBe(403);
  expect(h.serve).not.toHaveBeenCalled();
});

it.each([POST, PUT, DELETE])("preserves signed request paths, query strings and bodies", async (handler) => {
  vi.stubEnv("AGENT_CONTROL_ORIGIN", `${ORIGIN}/`);
  const method = handler === POST ? "POST" : handler === PUT ? "PUT" : "DELETE";
  const response = await handler(await signedRequest({
    path: "/api/agent-vm/checkpoint?fixture=true", method, body: '{"fixture":true}',
  }));
  expect(response.status).toBe(404);
  expect(h.serve).toHaveBeenCalledWith({
    runId: RUN, method, surface: "/checkpoint", body: { fixture: true },
    sandboxName: `agent-v2-${RUN}`,
  });
});

it("preserves the existing server runner admission without an origin override", async () => {
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "");
  const token = signServerExecToken(RUN, resolveServerExecSecret()!);
  const response = await GET(new Request("http://localhost:6463/api/agent-vm/interrupt", {
    headers: { authorization: `Bearer ${token}` },
  }));
  expect(response.status).toBe(404);
  expect(h.serve).toHaveBeenCalledWith({
    runId: RUN, method: "GET", surface: "/interrupt", body: null, server: true,
  });
});

it("preserves a configured internal HTTP origin for the self-hosted server runner", async () => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "self-hosted");
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "http://minddy-web:3000");
  const token = signServerExecToken(RUN, resolveServerExecSecret()!);
  const response = await GET(new Request("http://localhost:6463/api/agent-vm/interrupt", {
    headers: { authorization: `Bearer ${token}` },
  }));
  expect(response.status).toBe(404);
  expect(h.serve).toHaveBeenCalledWith({
    runId: RUN, method: "GET", surface: "/interrupt", body: null, server: true,
  });
});

it.each(["not a URL", "file:///tmp/control", "https://user:password@control.example.test",
  `${ORIGIN}/configuration-path`, `${ORIGIN}?audience=other`, `${ORIGIN}#fragment`,
  "http://control.example.test", "https://localhost:6463", "https://127.0.0.1:6463"])(
  "fails closed for invalid explicit origin configuration: %s",
  async (origin) => {
    vi.stubEnv("AGENT_CONTROL_ORIGIN", origin);
    const response = await GET(await signedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "invalid control plane origin" });
    expect(h.serve).not.toHaveBeenCalled();
  },
);
