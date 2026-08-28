import { describe, expect, it } from "vitest";
import { APIError } from "@vercel/sandbox";
import {
  isRetryableStatus,
  isContextLengthError,
  parseRetryAfterMs,
  backoffMs,
  planBootstrapRetry,
  StreamError,
} from "./retry";

describe("isRetryableStatus", () => {
  it("429 et 5xx sont reprenables", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });
  it("4xx (hors 429) et 2xx ne le sont pas", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("isContextLengthError", () => {
  it("matche les tournures de dépassement de contexte (insensible à la casse)", () => {
    expect(isContextLengthError("This model's maximum context length is 8192 tokens")).toBe(true);
    expect(isContextLengthError("MAXIMUM CONTEXT reached")).toBe(true);
    expect(isContextLengthError("The context window has been exceeded")).toBe(true);
    expect(isContextLengthError("Error code: context_length_exceeded")).toBe(true);
    expect(isContextLengthError("There are too many tokens in the request")).toBe(true);
    expect(isContextLengthError("Please reduce the length of your messages")).toBe(true);
    expect(isContextLengthError("The input is too long for this model")).toBe(true);
    expect(isContextLengthError("Your prompt is too long")).toBe(true);
    expect(isContextLengthError("Requested 5000 but the maximum is 4096 tokens")).toBe(true);
  });
  it("ne matche pas les autres erreurs 400/génériques", () => {
    expect(isContextLengthError("Invalid API key")).toBe(false);
    expect(isContextLengthError("model not found")).toBe(false);
    expect(isContextLengthError("rate limit exceeded")).toBe(false);
    expect(isContextLengthError("too many requests")).toBe(false);
    expect(isContextLengthError("internal server error")).toBe(false);
    expect(isContextLengthError("")).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  const now = 1_000_000;
  it("interprète les secondes", () => {
    expect(parseRetryAfterMs("5", now)).toBe(5000);
    expect(parseRetryAfterMs("0", now)).toBe(0);
  });
  it("interprète une date HTTP (delta vs now)", () => {
    const future = new Date(now + 3000).toUTCString();
    expect(parseRetryAfterMs(future, now)).toBe(3000);
  });
  it("null / vide / invalide → null", () => {
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs("", now)).toBeNull();
    expect(parseRetryAfterMs("soon", now)).toBeNull();
  });
});

describe("backoffMs", () => {
  it("croît exponentiellement puis plafonne", () => {
    expect(backoffMs(0, 0.5)).toBe(500); // 500 * 1.0
    expect(backoffMs(1, 0.5)).toBe(1000);
    expect(backoffMs(2, 0.5)).toBe(2000);
    expect(backoffMs(10, 0.5)).toBe(8000); // capped
  });
  it("applique un jitter ±10%", () => {
    expect(backoffMs(0, 0)).toBe(450); // 500 * 0.9
    expect(backoffMs(0, 1)).toBe(550); // 500 * 1.1
  });
});

describe("planBootstrapRetry", () => {
  it("requeues a Sandbox 500 with bounded drain-scale delays", () => {
    const error = new APIError(
      new Response('{"error":{"message":"An unexpected internal error occurred"}}', {
        status: 500,
      }),
    );

    expect(planBootstrapRetry(error, 1)).toEqual({ requeue: true, delayMs: 30_000 });
    expect(planBootstrapRetry(error, 2)).toEqual({ requeue: true, delayMs: 120_000 });
    expect(planBootstrapRetry(error, 3)).toEqual({ requeue: true, delayMs: 300_000 });
    expect(planBootstrapRetry(error, 4)).toEqual({ requeue: true, delayMs: 600_000 });
    expect(planBootstrapRetry(error, 5)).toEqual({ requeue: false });
  });

  it("also retries rate limits and common status-bearing errors", () => {
    expect(planBootstrapRetry({ status: 429 }, 1)).toEqual({
      requeue: true,
      delayMs: 30_000,
    });
    expect(planBootstrapRetry({ statusCode: 503 }, 1)).toEqual({
      requeue: true,
      delayMs: 30_000,
    });
  });

  it("keeps configuration 4xx and unclassified failures terminal", () => {
    expect(planBootstrapRetry({ response: { status: 400 } }, 1)).toBeNull();
    expect(planBootstrapRetry(new Error("Invalid CIDR"), 1)).toBeNull();
  });
});

describe("StreamError", () => {
  it("porte retryable/status/retryAfterMs", () => {
    const e = new StreamError("boom", { retryable: true, status: 429, retryAfterMs: 2000 });
    expect(e).toBeInstanceOf(Error);
    expect(e.retryable).toBe(true);
    expect(e.status).toBe(429);
    expect(e.retryAfterMs).toBe(2000);
  });
});
