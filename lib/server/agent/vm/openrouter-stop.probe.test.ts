import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startLlmProxy } from "./llm-proxy";
import { loadEnv } from "./opencode-probe-rig";
import { fetchAiProvider } from "@/lib/server/ai-provider-request";

// Opt-in: spends one short generation through the production pinned transport.
describe.skipIf(process.env.MDY_OPENROUTER_STOP_PROBE !== "1")("live OpenRouter Stop", () => {
  it("records provider cancellation after disconnecting the real Minddy proxy", async () => {
    loadEnv();
    const key = process.env.OPENROUTER_API_KEY;
    expect(key).toBeTruthy();
    const model = process.env.MDY_OPENROUTER_STOP_MODEL ?? "z-ai/glm-5.3-flash";
    const proxy = await startLlmProxy({
      job: { baseUrl: "https://openrouter.ai/api/v1", provider: "openrouter", reasoningLevel: "off" },
      apiKey: async () => key!,
    });
    const controller = new AbortController();
    try {
      const response = await fetch(`${proxy.url}/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true, max_tokens: 4096,
          messages: [{ role: "user", content: "Count from 1 to 10000, one number per line, without skipping numbers." }] }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      let received = "";
      const decoder = new TextDecoder();
      while (!received.includes('"id"')) {
        const chunk = await reader.read();
        expect(chunk.done).toBe(false);
        received += decoder.decode(chunk.value, { stream: true });
      }
      const stoppedAt = Date.now();
      controller.abort();
      await proxy.settle(1500);
      const generations = proxy.drain();
      expect(generations).toHaveLength(1);
      const id = generations[0].id!;
      expect(id).toBeTruthy();
      const disconnectMs = Date.now() - stoppedAt;
      let data: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 20; attempt++) {
        const metadata = await fetchAiProvider("openrouter",
          `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
          });
        if (metadata.ok) { data = (await metadata.json()).data; break; }
        await metadata.body?.cancel();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      const evidence = { generationId: id, model, disconnectMs,
        provider: data?.provider_name, cancelled: data?.cancelled,
        finishReason: data?.finish_reason, nativeTokensCompletion: data?.native_tokens_completion,
        totalCost: data?.total_cost };
      if (process.env.MDY_STOP_PROBE_RESULT) {
        writeFileSync(process.env.MDY_STOP_PROBE_RESULT, JSON.stringify(evidence, null, 2));
      }
      console.log(JSON.stringify(evidence));
      expect(disconnectMs).toBeLessThan(1500);
      expect(data?.cancelled).toBe(true);
      expect(Number(data?.native_tokens_completion)).toBeLessThan(4096);
    } finally {
      controller.abort();
      await proxy.close();
    }
  }, 90000);
});
