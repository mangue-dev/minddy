import { describe, expect, it } from "vitest";
import {
  HttpResponseError,
  isBackendUnavailableError,
} from "./backend-availability";

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
