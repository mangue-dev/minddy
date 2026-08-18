import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-341 — the anti-SSRF guard has existed since MIN-336; what was missing is
 * that user-driven HTTP outputs ALL pass through it.
 *
 * This file keeps the list of these outputs, and for each the same question:
 * `http://169.254.169.254/` — the cloud metadata service, the address which
 * returns IAM tokens to anyone who knows how to ask for it — is it refused BEFORE any network call
 *? The mock is placed on the DNS resolver and on `pinnedRequest`: the
 * plays in full, and the absence of a call is what we assert.
 *
 * One more property, specific to the webhook: what the caller learns from a
 * delivery is a state, never the recipient's HTTP code. A webhook that
 * renders "200" here and "502" there is a polite port scanner.
 */

const lookup = vi.hoisted(() => vi.fn());
const pinnedRequest = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/pinned-request", () => ({ pinnedRequest }));
vi.mock("./pinned-request", () => ({ pinnedRequest }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const METADATA = "http://169.254.169.254/latest/meta-data/";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:push@example.test");
  lookup.mockReset();
  pinnedRequest.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

// ── 1. Outbound integration webhook ──────────────────── ────────────────────

/** The integration as it is in base, which the tests rewrite. */
let integrationRow: Record<string, unknown> = {
  id: "int-1",
  kind: "issues",
  webhook_url: null,
};
const updatePatch = vi.fn();

/**
 * A request link that accepts any sequence of calls and ends up with
 * returning `{ data, error: null }`. Tables other than `integrations` ne
 * are here just for decoration: what we look at is what happens BEFORE them.
 */
function anyChain(data: unknown): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
        }
        return () => anyChain(data);
      },
    }
  );
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) =>
      table === "integrations" ? integrationsTable() : (anyChain({}) as never),
  }),
}));

function integrationsTable() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: integrationRow, error: null }) }),
        order: async () => ({ data: [integrationRow], error: null }),
      }),
    }),
    update: (patch: Record<string, unknown>) => {
      updatePatch(patch);
      const row = { ...integrationRow, ...patch };
      return {
        eq: () => ({
          eq: () => ({
            is: () => ({ select: async () => ({ data: [row], error: null }) }),
          }),
        }),
      };
    },
  };
}

const { listIntegrations, updateIntegrationWebhook } = await import("./integrations");

const webhookInput = (url: string | null) => ({
  webhook_url: url,
  webhook_events: ["issue.created"],
  webhook_scope: "integration",
});

describe("webhook d'intégration — la destination", () => {
  beforeEach(() => {
    integrationRow = { id: "int-1", kind: "issues", webhook_url: null };
    updatePatch.mockReset();
  });

  it.each([
    ["le métadonnées cloud", METADATA],
    ["la loopback", "http://127.0.0.1:5432/hook"],
    ["une IP privée", "http://10.0.0.5/hook"],
    ["une IPv4 privée déguisée en IPv6", "http://[::ffff:c0a8:1]/hook"],
    ["la loopback en octal", "http://0177.0.0.1/hook"],
    ["un protocole exotique", "file:///etc/passwd"],
  ])("refuse %s à l'enregistrement", async (_label, url) => {
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput(url),
      actor: "human",
    });
    expect(result).toMatchObject({ ok: false, errorKey: "webhookInvalidUrl" });
    expect(updatePatch).not.toHaveBeenCalled();
  });

  it("refuse un hôte dont le DNS pointe vers une adresse privée", async () => {
    lookup.mockResolvedValue([{ address: "169.254.169.254" }]);
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput("https://hook.exemple.com/x"),
      actor: "human",
    });
    expect(result).toMatchObject({ ok: false, errorKey: "webhookInvalidUrl" });
  });

  it("accepte une destination publique posée par un humain", async () => {
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput("https://hook.exemple.com/x"),
      actor: "human",
    });
    expect(result.ok).toBe(true);
    expect(updatePatch).toHaveBeenCalledWith(
      expect.objectContaining({ webhook_url: "https://hook.exemple.com/x" })
    );
  });
});

describe("webhook d'intégration — l'agent ne choisit pas la destination", () => {
  beforeEach(() => {
    updatePatch.mockReset();
  });

  it("refuse à l'agent de POSER une destination", async () => {
    // The ticket scenario: prompt injection in a description
    // would otherwise be enough to open a permanent exfiltration channel.
    integrationRow = { id: "int-1", kind: "issues", webhook_url: null };
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput("https://exfil.exemple.com/collect"),
      actor: "agent",
    });
    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "webhookHumanOnly" });
    expect(updatePatch).not.toHaveBeenCalled();
  });

  it("refuse à l'agent de DÉPLACER une destination existante", async () => {
    integrationRow = { id: "int-1", kind: "issues", webhook_url: "https://hook.exemple.com/x" };
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput("https://exfil.exemple.com/collect"),
      actor: "agent",
    });
    expect(result).toMatchObject({ ok: false, errorKey: "webhookHumanOnly" });
    expect(updatePatch).not.toHaveBeenCalled();
  });

  it("laisse l'agent régler les événements de la destination en place", async () => {
    integrationRow = { id: "int-1", kind: "issues", webhook_url: "https://hook.exemple.com/x" };
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: {
        webhook_url: "https://hook.exemple.com/x",
        webhook_events: ["issue.created", "issue.status_changed"],
        webhook_scope: "all",
      },
      actor: "agent",
    });
    expect(result.ok).toBe(true);
  });

  it("laisse l'agent ÉTEINDRE le webhook", async () => {
    integrationRow = { id: "int-1", kind: "issues", webhook_url: "https://hook.exemple.com/x" };
    const result = await updateIntegrationWebhook({
      projectId: "p1",
      integrationId: "int-1",
      input: webhookInput(null),
      actor: "agent",
    });
    expect(result.ok).toBe(true);
    expect(updatePatch).toHaveBeenCalledWith(expect.objectContaining({ webhook_url: null }));
  });
});

describe("webhook d'intégration — l'état de livraison ne porte pas le code HTTP", () => {
  it.each([
    ["200", "ok"],
    ["204", "ok"],
    ["ok", "ok"],
    ["401", "failed"],
    ["404", "failed"],
    ["502", "failed"],
    ["unreachable", "failed"],
  ])("rend %s comme %s", async (stored, expected) => {
    integrationRow = {
      id: "int-1",
      kind: "issues",
      webhook_url: "https://hook.exemple.com/x",
      webhook_last_status: stored,
    };
    const rows = await listIntegrations("p1");
    expect(rows?.[0].webhook_last_status).toBe(expected);
  });

  it("garde null quand rien n'a encore été livré", async () => {
    integrationRow = {
      id: "int-1",
      kind: "issues",
      webhook_url: "https://hook.exemple.com/x",
      webhook_last_status: null,
    };
    const rows = await listIntegrations("p1");
    expect(rows?.[0].webhook_last_status).toBeNull();
  });
});

// ── 2. Base URL BYOK « generic » ────────────────────────────────────────────

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "u1" },
    // The push route written by the authenticated client (its RLS IS the control of
    // property): the decor returns empty lists.
    supabase: { from: () => anyChain([]) },
  }),
}));
vi.mock("@/lib/server/agent/byok-credentials", () => ({
  LOCAL_ENDPOINT_WITHOUT_API_KEY: "sans-cle-local",
  encryptUserAiKey: () => "chiffré",
  keyPrefix: () => "sk-…",
}));

const { POST: postAiKey } = await import("@/app/api/account/ai-keys/route");

function jsonRequest(body: unknown) {
  return new Request("https://minddy.app/api", {
    method: "POST",
    body: JSON.stringify(body),
  }) as never;
}

describe("base URL BYOK « generic »", () => {
  it.each([
    ["le métadonnées cloud", METADATA],
    ["la loopback", "http://127.0.0.1:11434/v1"],
    ["localhost", "http://localhost:11434/v1"],
    ["la loopback en décimal", "http://2130706433/v1"],
  ])("refuse %s", async (_label, base_url) => {
    const response = await postAiKey(
      jsonRequest({ key: "sk-test", provider: "generic", base_url })
    );
    expect(response.status).toBe(400);
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  // Witness: without him, a 400 returned for a completely different reason (provider
  // unknown, body misread) would make the above cases appear as refusals.
  it("accepte un endpoint public", async () => {
    const response = await postAiKey(
      jsonRequest({
        key: "sk-test",
        provider: "generic",
        base_url: "https://llm.exemple.com/v1",
      })
    );
    expect(response.status).toBe(200);
  });

  it("enregistre Ollama sans clé ni sonde depuis le cloud", async () => {
    const response = await postAiKey(
      jsonRequest({ provider: "ollama", base_url: "http://127.0.0.1:11434" })
    );
    expect(response.status).toBe(200);
    expect(pinnedRequest).not.toHaveBeenCalled();
  });
});

// ── 3. Endpoint Web Push ────────────────────────────────────────────────────

const { POST: postPushSubscription } = await import(
  "@/app/api/account/push-subscriptions/route"
);

describe("endpoint Web Push", () => {
  it.each([
    ["le métadonnées cloud", "https://169.254.169.254/push/x"],
    ["une IP privée", "https://10.0.0.5/push/x"],
    ["la loopback en hexadécimal", "https://0x7f000001/push/x"],
  ])("refuse %s", async (_label, endpoint) => {
    const response = await postPushSubscription(
      jsonRequest({ endpoint, keys: { p256dh: "abc", auth: "def" } })
    );
    expect(response.status).toBe(400);
  });

  it("accepte l'endpoint d'un vrai service de push", async () => {
    const response = await postPushSubscription(
      jsonRequest({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys: { p256dh: "abc", auth: "def" },
      })
    );
    expect(response.status).not.toBe(400);
  });
});

// ── 4. Project icon ─────────────────────────── ───────────────────────────

const { FaviconError, resolveFavicon } = await import("./favicon");

describe("icône de projet", () => {
  it("refuse le métadonnées cloud sans jamais sortir", async () => {
    await expect(resolveFavicon(METADATA)).rejects.toBeInstanceOf(FaviconError);
    expect(pinnedRequest).not.toHaveBeenCalled();
  });
});
