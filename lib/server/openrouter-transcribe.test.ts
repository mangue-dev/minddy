import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fetchAiProvider } = vi.hoisted(() => ({ fetchAiProvider: vi.fn() }));
vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProvider }));

const { transcribeAudio, transcriptionLanguage } = await import("./openrouter-transcribe");

describe("transcription provider requests", () => {
  beforeEach(() => {
    fetchAiProvider.mockReset();
    fetchAiProvider.mockResolvedValue(Response.json({
      text: "A recorded request.",
      usage: { input_tokens: 7, output_tokens: 4 },
    }));
  });

  it.each(["gpt-transcribe", "gpt-transcribe-2026-07-28"])(
    "uses the language array accepted by OpenAI %s",
    async (model) => {
      const result = await transcribeAudio(model, "YXVkaW8=", "webm", "test-key", {
        providerId: "openai", baseUrl: "https://api.openai.com/v1", language: "fr",
      });
      const [provider, url, init] = fetchAiProvider.mock.calls[0]!;
      expect(provider).toBe("openai");
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      const body = init.body as FormData;
      expect(body.getAll("languages[]")).toEqual(["fr"]);
      expect(body.has("language")).toBe(false);
      expect(body.get("model")).toBe(model);
      expect(await (body.get("file") as Blob).text()).toBe("audio");
      expect(result).toMatchObject({ text: "A recorded request.", inputTokens: 7, outputTokens: 4 });
    },
  );

  it.each([
    ["openai", "gpt-4o-mini-transcribe"],
    ["generic", "gpt-transcribe"],
  ] as const)("keeps the legacy language hint for %s/%s", async (providerId, model) => {
    await transcribeAudio(model, "YXVkaW8=", "webm", "test-key", {
      providerId, language: "fr", temperature: 0,
    });
    const body = fetchAiProvider.mock.calls[0]![2].body as FormData;
    expect(body.get("language")).toBe("fr");
    expect(body.has("languages[]")).toBe(false);
    expect(body.get("temperature")).toBe("0");
  });

  it("keeps OpenRouter audio and language hints in its JSON contract", async () => {
    await transcribeAudio("openai/gpt-transcribe", "YXVkaW8=", "webm", "test-key", {
      language: "fr", temperature: 0,
    });
    expect(JSON.parse(fetchAiProvider.mock.calls[0]![2].body)).toMatchObject({
      input_audio: { data: "YXVkaW8=", format: "webm" }, language: "fr", temperature: 0,
    });
  });

  it("drops credits the model invents on silence before any caller sees the text", async () => {
    fetchAiProvider.mockResolvedValue(Response.json({
      text: "Le filtre ne marche plus. Sous-titrage Société Radio-Canada",
    }));
    const result = await transcribeAudio("openai/gpt-transcribe", "YXVkaW8=", "webm", "test-key");
    expect(result.text).toBe("Le filtre ne marche plus.");
  });
});

describe("transcriptionLanguage (MIN-979)", () => {
  it("sends the ISO-639-1 code the transcription APIs expect", () => {
    expect(transcriptionLanguage("pt-BR")).toBe("pt");
    expect(transcriptionLanguage("fr")).toBe("fr");
    expect(transcriptionLanguage("EN_us")).toBe("en");
    expect(transcriptionLanguage("auto")).toBeUndefined();
    expect(transcriptionLanguage(undefined)).toBeUndefined();
  });
});

describe("Gemini 3.5 Transcribe (MIN-979)", () => {
  beforeEach(() => {
    fetchAiProvider.mockReset();
    fetchAiProvider.mockResolvedValue(Response.json({
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Bonjour " }, { type: "text", text: "Numo" }] }],
      usage: {
        total_input_tokens: 250, total_output_tokens: 6,
        input_tokens_by_modality: [{ modality: "audio", tokens: 250 }],
      },
    }));
  });

  it("calls the native Interactions API with the language and vocabulary", async () => {
    const result = await transcribeAudio("gemini-3.5-transcribe", "YXVkaW8=", "m4a", "g-key", {
      providerId: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      language: "pt-BR", vocabulary: ["minddy", " Numo "],
    });
    const [provider, url, init] = fetchAiProvider.mock.calls[0]!;
    expect(provider).toBe("google");
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "g-key" });
    expect(JSON.parse(String(init.body))).toEqual({
      model: "models/gemini-3.5-transcribe",
      store: false,
      input: [{ type: "audio", mime_type: "audio/m4a", data: "YXVkaW8=" }],
      generation_config: { transcription_config: { language_codes: ["pt-BR"], custom_vocabulary: ["minddy", "Numo"] } },
    });
    expect(result).toEqual({ text: "Bonjour Numo", seconds: 10, cost: 0, inputTokens: 250, outputTokens: 6 });
  });

  it("leaves detection to the model without a language and refuses an unfinished interaction", async () => {
    fetchAiProvider.mockResolvedValueOnce(Response.json({ status: "failed" }));
    await expect(transcribeAudio("gemini-3.5-transcribe", "YXVkaW8=", "webm", "g-key", {
      providerId: "google", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    })).rejects.toThrow("interaction failed");
    const body = JSON.parse(String(fetchAiProvider.mock.calls[0]![2].body));
    expect(body).not.toHaveProperty("generation_config");
    expect(body.input[0].mime_type).toBe("audio/webm");
  });
});
