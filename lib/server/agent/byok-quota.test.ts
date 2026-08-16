import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-344 — une clé BYOK jamais validée faisait sauter tout plafond.
 *
 * `checkAgentQuota` ne regardait que l'EXISTENCE d'une ligne `user_ai_keys` :
 * coller n'importe quelle chaîne dans l'écran des réglages passait le compte en
 * usage illimité. Illimité y voulait dire deux choses, et la seconde n'était pas
 * la nôtre à donner — les tokens sont payés par la clé de l'utilisateur, la
 * microVM tourne sur le compte Vercel de minddy, à la minute.
 *
 * Deux règles, deux moitiés de ce fichier :
 *  • une clé que le fournisseur ne reconnaît pas est INERTE (`getUserByok` la
 *    ignore, donc `userHasByokKey` ne la voit pas et le compte reste plafonné) ;
 *  • même validée, elle ne lève JAMAIS le plafond du compute sandbox.
 */

const probeByokKey = vi.fn();
const updated: unknown[] = [];
let keyRow: Record<string, unknown> | null = null;

vi.mock("./byok-validate", () => ({
  probeByokKey: (...args: unknown[]) => probeByokKey(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      if (table !== "user_ai_keys") throw new Error(`table inattendue : ${table}`);
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: keyRow }) }),
            }),
          }),
        }),
        update: (patch: unknown) => ({
          eq: () => ({
            eq: async () => {
              updated.push(patch);
              return { error: null };
            },
          }),
        }),
      };
    },
  }),
}));
vi.mock("./byok-credentials", () => ({
  LOCAL_ENDPOINT_WITHOUT_API_KEY: "sans-cle-local",
  decryptUserAiKey: (value: string | null) => (!value || value === "corrompu" ? null : "sk-clair"),
  encryptUserAiKey: (value: string) => value,
  keyPrefix: (value: string) => value.slice(0, 6),
}));

const {
  getUserByok,
  resolveAgentApiKey,
  userHasByokKey,
  resetByokProbeCache,
} = await import("./model");

const USER = "5ad9b962-93e7-4a7c-a44b-f4925484ba93";

beforeEach(() => {
  process.env.MINDDY_MANAGED_AI = "1";
  process.env.OPENROUTER_API_KEY = "platform-key";
  keyRow = {
    provider: "openrouter",
    key_encrypted: "chiffré",
    base_url: null,
    validated_at: null,
  };
  updated.length = 0;
  probeByokKey.mockReset();
  probeByokKey.mockResolvedValue("invalid");
  resetByokProbeCache();
});

describe("getUserByok — la validation gouverne", () => {
  it("ignore une clé que le fournisseur refuse", async () => {
    await expect(getUserByok(USER)).resolves.toBeNull();
    await expect(userHasByokKey(USER)).resolves.toBe(false);
  });

  it("sert sans probe une clé déjà validée", async () => {
    keyRow!.validated_at = "2026-08-01T00:00:00.000Z";
    await expect(getUserByok(USER)).resolves.toMatchObject({ provider: "openrouter" });
    expect(probeByokKey).not.toHaveBeenCalled();
  });

  it("rattrape une ligne d'avant MIN-344 : la clé répond → on pose la date", async () => {
    probeByokKey.mockResolvedValue("valid");
    await expect(getUserByok(USER)).resolves.toMatchObject({ apiKey: "sk-clair" });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toHaveProperty("validated_at");
  });

  it("ne re-sonde pas une clé morte à chaque lecture d'endpoint", async () => {
    await getUserByok(USER);
    await getUserByok(USER);
    expect(probeByokKey).toHaveBeenCalledTimes(1);
  });

  it("une panne du fournisseur ne crédite rien (verdict `unknown`)", async () => {
    probeByokKey.mockResolvedValue("unknown");
    await expect(getUserByok(USER)).resolves.toBeNull();
    expect(updated).toHaveLength(0);
  });

  it("ne sonde jamais un endpoint local et refuse de le résoudre pour le cloud", async () => {
    keyRow = {
      provider: "local_openai",
      key_encrypted: "chiffré",
      base_url: "http://127.0.0.1:1234/v1",
      validated_at: null,
    };

    await expect(getUserByok(USER)).resolves.toMatchObject({
      provider: "local_openai",
      baseUrl: "http://127.0.0.1:1234/v1",
    });
    expect(probeByokKey).not.toHaveBeenCalled();
    await expect(resolveAgentApiKey(USER)).rejects.toMatchObject({
      code: "localEndpointRequiresLocalRun",
    });
    await expect(resolveAgentApiKey(USER, "agent", { allowLocal: true })).resolves.toMatchObject({
      mode: "byok",
      provider: "local_openai",
    });
  });

  it("accepte un endpoint local sans clé, sans jamais retomber sur la plateforme", async () => {
    keyRow = {
      provider: "ollama",
      // Le marqueur garde l'enregistrement compatible avec les bases ayant
      // encore `key_encrypted NOT NULL`.
      key_encrypted: "sans-cle-local",
      base_url: "http://127.0.0.1:11434",
      validated_at: null,
    };

    await expect(getUserByok(USER)).resolves.toMatchObject({
      provider: "ollama",
      apiKey: "",
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    await expect(resolveAgentApiKey(USER, "agent", { allowLocal: true })).resolves.toMatchObject({
      mode: "byok",
      apiKey: "",
    });
    expect(probeByokKey).not.toHaveBeenCalled();
  });
});

// ── Le plafond de compute, lui, ne se lève jamais ────────────────────────────

const plan = { id: "pro", allowAgents: true, includedUsageUsd: 10 };
let usage = {
  usedUsd: 0,
  byFeature: {} as Record<string, number>,
  period: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
};

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => ({ plan }),
}));
vi.mock("@/lib/server/usage", () => ({
  getUserUsage: async () => usage,
}));

const { checkAgentQuota } = await import("./quota");

describe("checkAgentQuota — BYOK ne paye pas la microVM", () => {
  beforeEach(() => {
    keyRow = {
      provider: "openrouter",
      key_encrypted: "chiffré",
      base_url: null,
      validated_at: "2026-08-01T00:00:00.000Z",
    };
    usage = {
      usedUsd: 0,
      byFeature: {},
      period: { start: "2026-08-01T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" },
    };
  });

  it("laisse passer des tokens illimités", async () => {
    usage.usedUsd = 9_999;
    const quota = await checkAgentQuota(USER);
    expect(quota).toMatchObject({ allowed: true, unlimited: true, mode: "byok" });
  });

  it("ne lit ni plan ni ledger minddy pour le BYOK auto-hébergé", async () => {
    process.env.MINDDY_MANAGED_AI = "";
    usage.byFeature = { sandbox_compute: 99 };
    usage.usedUsd = 999;

    await expect(checkAgentQuota(USER)).resolves.toMatchObject({
      allowed: true,
      unlimited: true,
      mode: "byok",
    });
  });

  it("refuse quand les minutes de microVM ont mangé le budget du plan", async () => {
    usage.byFeature = { sandbox_compute: 8, routine_compute: 3 };
    usage.usedUsd = 11;
    const quota = await checkAgentQuota(USER);
    expect(quota.allowed).toBe(false);
    expect(quota.reason).toBe("usage_budget_exceeded");
  });

  it("compte les deux features de microVM ensemble — un run et une routine brûlent les mêmes minutes", async () => {
    usage.byFeature = { sandbox_compute: 6, routine_compute: 3 };
    const quota = await checkAgentQuota(USER);
    expect(quota.allowed).toBe(true);
    expect(quota.spent).toBe(9);
    expect(quota.remaining).toBe(1);
  });

  it("ignore les tokens dans ce décompte : ils sont payés par la clé de l'utilisateur", async () => {
    usage.byFeature = { agent_code: 500, sandbox_compute: 1 };
    usage.usedUsd = 501;
    await expect(checkAgentQuota(USER)).resolves.toMatchObject({ allowed: true });
  });

  it("une clé non validée retombe sur le plafond plateforme, tokens compris", async () => {
    keyRow!.validated_at = null;
    usage.usedUsd = 12;
    const quota = await checkAgentQuota(USER);
    expect(quota).toMatchObject({
      allowed: false,
      mode: "platform",
      reason: "usage_budget_exceeded",
    });
  });
});
