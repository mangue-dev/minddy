import { describe, expect, it } from "vitest";
import {
  HttpResponseError,
  isBackendUnavailableError,
  retryTemporaryReadFailure,
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

describe("retryTemporaryReadFailure", () => {
  it("retries a temporary failure once", () => {
    for (const error of [new HttpResponseError("Bad gateway", 503), new TypeError("Failed to fetch"), new Error("Request timed out")]) {
      expect(retryTemporaryReadFailure(0, error)).toBe(true);
      expect(retryTemporaryReadFailure(1, error)).toBe(false);
    }
  });

  it.each([401, 403, 404])("does not replay a %s", (status) => {
    expect(retryTemporaryReadFailure(0, new HttpResponseError("Denied", status))).toBe(false);
  });
});
