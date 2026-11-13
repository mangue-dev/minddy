import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The mobile app's AI consent on the server (MIN-907, guideline 5.1.2(i)):
 * a request from the app sends nothing to a model provider until the person
 * allowed it, and the routes that start AI work say why.
 */

const request = vi.hoisted(() => ({
  scoped: true,
  userAgent: null as string | null,
  consent: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!request.scoped) throw new Error("outside a request scope");
    return new Headers(request.userAgent ? { "user-agent": request.userAgent } : {});
  },
  cookies: async () => ({
    get: (name: string) =>
      name === "minddy-ai-consent" && request.consent !== undefined ? { name, value: request.consent } : undefined,
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const accounts = vi.hoisted(() => ({ metadata: {} as Record<string, Record<string, unknown> | Error> }));
const getUserById = vi.fn(async (id: string) => {
  const entry = accounts.metadata[id];
  if (entry instanceof Error) return { data: { user: null }, error: entry };
  return { data: { user: { id, user_metadata: entry ?? {} } }, error: null };
});
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ auth: { admin: { getUserById } } }) }));

const safeFetchResponse = vi.fn(async () => new Response("ok"));
vi.mock("@/lib/server/safe-fetch", () => ({ safeFetch: vi.fn(), safeFetchResponse }));

const {
  AiConsentRequiredError,
  aiConsentRefusal,
  aiDeclinedInBackground,
  resetAccountAiConsentCache,
  runAsBackgroundAiWork,
} = await import("./ai-consent");
const { fetchAiProvider } = await import("./ai-provider-request");

const APP = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 minddy-mobile/0.30.1";

describe("AI consent on the server", () => {
  beforeEach(() => {
    request.scoped = true;
    request.userAgent = APP;
    request.consent = undefined;
    safeFetchResponse.mockClear();
  });

  it("sends nothing to a provider for the app before consent", async () => {
    await expect(fetchAiProvider("openrouter", "https://openrouter.ai/api/v1/chat/completions"))
      .rejects.toBeInstanceOf(AiConsentRequiredError);
    request.consent = "declined";
    await expect(fetchAiProvider("openrouter", "https://openrouter.ai/api/v1/chat/completions"))
      .rejects.toBeInstanceOf(AiConsentRequiredError);
    expect(safeFetchResponse).not.toHaveBeenCalled();
  });

  it("calls the provider once the app's person allowed AI", async () => {
    request.consent = "granted";
    await fetchAiProvider("openrouter", "https://openrouter.ai/api/v1/chat/completions");
    expect(safeFetchResponse).toHaveBeenCalledOnce();
  });

  it("leaves the web and background jobs alone", async () => {
    request.userAgent = "Mozilla/5.0 (Macintosh) Safari/605.1.15";
    await fetchAiProvider("openrouter", "https://openrouter.ai/api/v1/embeddings");
    request.scoped = false;
    await fetchAiProvider("openrouter", "https://openrouter.ai/api/v1/embeddings");
    expect(safeFetchResponse).toHaveBeenCalledTimes(2);
  });

  it("refuses an AI route with a code and a header the app recognizes", async () => {
    const refusal = await aiConsentRefusal();
    expect(refusal?.status).toBe(403);
    expect(refusal?.headers.get("x-minddy-ai-consent")).toBe("required");
    expect(await refusal?.json()).toMatchObject({ code: "ai_consent_required", error: "refused" });

    request.consent = "granted";
    expect(await aiConsentRefusal()).toBeNull();
  });
});

describe("AI consent in cron jobs", () => {
  beforeEach(() => {
    request.scoped = false;
    resetAccountAiConsentCache();
    getUserById.mockClear();
    accounts.metadata = {
      declined: { ai_consent: "declined" },
      granted: { ai_consent: "granted" },
      unasked: {},
      unreadable: new Error("auth unavailable"),
    };
  });

  it("skips AI only for an account that declined", async () => {
    const declined = await runAsBackgroundAiWork(async () => ({
      declined: await aiDeclinedInBackground("declined"),
      granted: await aiDeclinedInBackground("granted"),
      unasked: await aiDeclinedInBackground("unasked"),
      unreadable: await aiDeclinedInBackground("unreadable"),
      noAccount: await aiDeclinedInBackground(null),
    }));
    expect(declined).toEqual({ declined: true, granted: false, unasked: false, unreadable: false, noAccount: false });
  });

  it("never reads the account outside a cron job's AI work", async () => {
    expect(await aiDeclinedInBackground("declined")).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("reads an account once while its answer is cached", async () => {
    await runAsBackgroundAiWork(async () => {
      await aiDeclinedInBackground("declined");
      await aiDeclinedInBackground("declined");
    });
    expect(getUserById).toHaveBeenCalledOnce();
  });
});
