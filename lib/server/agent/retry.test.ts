import { describe, expect, it } from "vitest";
import { isRetryableStatus, parseRetryAfterMs, backoffMs, StreamError } from "./retry";

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
    expect(backoffMs(10, 0.5)).toBe(8000); // plafonné
  });
  it("applique un jitter ±10%", () => {
    expect(backoffMs(0, 0)).toBe(450); // 500 * 0.9
    expect(backoffMs(0, 1)).toBe(550); // 500 * 1.1
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
