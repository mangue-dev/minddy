import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fetchAiProvider } = vi.hoisted(() => ({ fetchAiProvider: vi.fn() }));
vi.mock("@/lib/server/ai-provider-request", () => ({ fetchAiProvider }));

const { transcribeAudio } = await import("./openrouter-transcribe");

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
});
