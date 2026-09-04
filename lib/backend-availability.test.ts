import { describe, expect, it } from "vitest";
import {
  HttpResponseError,
  isBackendUnavailableError,
  sanitizeBackendRetryPath,
} from "./backend-availability";

describe("sanitizeBackendRetryPath", () => {
  it("preserves the landing page and an already-decoded nested OAuth query", () => {
    const oauthPath =
      "/oauth/authorize?redirect_uri=https%3A%2F%2Fclient.example%2Fcallback%3Fnext%3Da%2526b&state=opaque";

    expect(sanitizeBackendRetryPath("/")).toBe("/");
    expect(sanitizeBackendRetryPath(oauthPath)).toBe(oauthPath);
  });

  it("rejects external and recursive retry targets", () => {
    expect(sanitizeBackendRetryPath("https://evil.example")).toBe("/home");
    expect(sanitizeBackendRetryPath("//evil.example")).toBe("/home");
    expect(sanitizeBackendRetryPath("/server-unavailable?retry=%2Fhome")).toBe(
      "/home",
    );
  });
});

describe("isBackendUnavailableError", () => {
  it("recognizes retryable Supabase and upstream failures", () => {
    expect(
      isBackendUnavailableError({ name: "AuthRetryableFetchError", status: 522 }),
    ).toBe(true);
    expect(isBackendUnavailableError(new HttpResponseError("Unavailable", 503))).toBe(
      true,
    );
    expect(
      isBackendUnavailableError({ cause: new TypeError("fetch failed") }),
    ).toBe(true);
  });

  it("does not turn expected authentication failures into an outage", () => {
    expect(isBackendUnavailableError({ name: "AuthApiError", status: 401 })).toBe(
      false,
    );
    expect(isBackendUnavailableError(new Error("Invalid refresh token"))).toBe(false);
  });
});
