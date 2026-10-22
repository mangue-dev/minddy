import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dictation cleanup preference (MIN-773), at the route that applies it:
 * off — from the account or from the client's live value — the recognized
 * words come back as they are and no cleanup model is called (or billed).
 */

const userMetadata = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const polish = vi.hoisted(() => vi.fn());
const transcribe = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "user-1", user_metadata: userMetadata.value },
  }),
}));
vi.mock("@/lib/server/session-rate-limit", () => ({
  checkSessionRateLimit: () => ({ allowed: true, retryAfter: 0 }),
}));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValues: async () => ({}) }));
vi.mock("@/lib/server/model-config", () => ({
  modelConfigKeys: (key: string) => [key],
  withModelSuffixFallback: (model: string, run: (m: string) => unknown) => run(model),
}));
vi.mock("@/lib/server/ai-runtime", () => ({
  resolveAiRuntime: async () => ({ mode: "byok", model: "whisper", provider: "openrouter", apiKey: "k" }),
}));
vi.mock("@/lib/server/openrouter-transcribe", () => ({
  resolveAudioFormat: () => "webm",
  transcribeAudio: transcribe,
}));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: async () => {},
  newRunId: () => "run-1",
}));
vi.mock("@/lib/server/usage", () => ({ ensureUsageBudget: async () => {} }));
vi.mock("@/lib/server/provider-operation-guard", () => ({
  reserveProviderOperation: async () => ({ state: "reserved" }),
  releaseProviderOperation: async () => {},
}));
vi.mock("@/lib/server/dictation-polish", () => ({ polishDictationTranscript: polish }));

const { POST } = await import("@/app/api/transcribe/route");

function request(fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("audio", new Blob(["voice"], { type: "audio/webm" }), "dictate.webm");
  form.append("context", "task_notebook");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
}

async function transcribe_(fields?: Record<string, string>) {
  const response = await POST(request(fields) as never);
  return (await response.json()) as { text: string; polished?: boolean };
}

beforeEach(() => {
  userMetadata.value = {};
  polish.mockReset();
  polish.mockResolvedValue("Revoir les filtres.");
  transcribe.mockReset();
  transcribe.mockResolvedValue({ text: " alors euh revoir les filtres ", seconds: 3 });
});

describe("POST /api/transcribe — cleanup preference", () => {
  it("cleans the transcript by default", async () => {
    expect(await transcribe_()).toMatchObject({ text: "Revoir les filtres.", polished: true });
    expect(polish).toHaveBeenCalledOnce();
  });

  it("returns the raw words, without a cleanup call, when the account turned it off", async () => {
    userMetadata.value = { dictation_cleanup: false };
    const body = await transcribe_();
    expect(body.text).toBe("alors euh revoir les filtres");
    expect(body).not.toHaveProperty("polished");
    expect(polish).not.toHaveBeenCalled();
  });

  it("honours the client's live value before the session claims catch up", async () => {
    expect((await transcribe_({ cleanup: "off" })).text).toBe("alors euh revoir les filtres");
    expect(polish).not.toHaveBeenCalled();
  });
});

describe("POST /api/transcribe — vocabulary", () => {
  it("replaces what is heard, cleanup off, from the stored list", async () => {
    userMetadata.value = {
      dictation_cleanup: false,
      dictation_vocabulary: [{ term: "Filtres™", heardAs: "filtres" }],
    };
    expect((await transcribe_()).text).toBe("alors euh revoir les Filtres™");
  });

  it("gives the spellings to the cleanup and the model, then replaces in the cleaned text", async () => {
    polish.mockResolvedValue("Revoir les filtres de Mindy.");
    transcribe.mockResolvedValue({ text: "revoir les filtres de mindy", seconds: 3 });
    const body = await transcribe_({
      vocabulary: JSON.stringify([{ term: "Minddy", heardAs: "mindy" }, { term: "Numo" }]),
    });
    expect(body.text).toBe("Revoir les filtres de Minddy.");
    expect(polish.mock.calls[0][0].vocabulary).toEqual(["Minddy", "Numo"]);
    expect(transcribe.mock.calls[0][4].prompt).toBe("Minddy, Numo");
  });

  it("prefers the client's live list over the session's stored one", async () => {
    userMetadata.value = { dictation_cleanup: false, dictation_vocabulary: [{ term: "Old", heardAs: "filtres" }] };
    const body = await transcribe_({ vocabulary: JSON.stringify([{ term: "New", heardAs: "filtres" }]) });
    expect(body.text).toBe("alors euh revoir les New");
  });
});
