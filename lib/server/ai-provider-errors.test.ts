import { describe, expect, it } from "vitest";

import {
  ProviderRequestError,
  parseProviderErrorBody,
  providerErrorFromResponse,
} from "./ai-provider-errors";

describe("ProviderRequestError", () => {
  it("fails at once on a rejected request and retries transient failures", () => {
    const at = (status: number | null) => new ProviderRequestError({
      provider: "anthropic", model: "claude-opus-5-5", status, providerMessage: "x",
    }).retryable;
    expect([400, 401, 403, 404, 422].map(at)).toEqual([false, false, false, false, false]);
    expect([408, 409, 429, 500, 529, null].map(at)).toEqual([true, true, true, true, true, true]);
  });

  it("keeps the provider's words out of the reported message", () => {
    const error = new ProviderRequestError({
      provider: "anthropic",
      model: "claude-opus-5-5",
      status: 400,
      providerErrorType: "invalid_request_error",
      providerMessage: "Adaptive thinking is not available via the OpenAI compatibility endpoint.",
    });
    // PostHog records `message`: structural only.
    expect(error.message).toBe("anthropic 400 invalid_request_error for claude-opus-5-5");
    // The conversation shows the cause.
    expect(error.userMessage).toContain("Adaptive thinking is not available");
    expect(error.userMessage).toContain("(400)");
  });
});

describe("parseProviderErrorBody", () => {
  it("reads the OpenAI, OpenRouter and Gemini shapes", () => {
    expect(parseProviderErrorBody(JSON.stringify({ error: { message: "bad", type: "invalid_request_error" } })))
      .toEqual({ message: "bad", type: "invalid_request_error" });
    expect(parseProviderErrorBody(JSON.stringify({ error: { message: "nope", code: 400 } })))
      .toEqual({ message: "nope", type: null });
    expect(parseProviderErrorBody(JSON.stringify([{ error: { message: "quota", status: "RESOURCE_EXHAUSTED" } }])))
      .toEqual({ message: "quota", type: "RESOURCE_EXHAUSTED" });
    expect(parseProviderErrorBody("Bad Gateway")).toEqual({ message: "Bad Gateway", type: null });
  });

  it("builds the error without consuming the response", async () => {
    const response = new Response(JSON.stringify({ error: { message: "model not found", type: "not_found_error" } }), { status: 404 });
    const error = await providerErrorFromResponse("anthropic", "claude-x", response);
    expect(error).toMatchObject({ status: 404, providerErrorType: "not_found_error", providerMessage: "model not found" });
    expect(await response.text()).toContain("model not found");
  });
});
