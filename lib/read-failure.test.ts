import { expect, it } from "vitest";
import { ApiError } from "./agent-api";
import { HttpResponseError } from "./backend-availability";
import { readFailureKind, readFailureRetryAt } from "./read-failure";

const api = (status: number, code?: string, retryAt?: number) => Object.assign(new ApiError("Failed", code), { status, retryAt });

it("classifies failed reads by status, API code and Retry-After", () => {
  expect(readFailureKind(new HttpResponseError("Unauthorized", 401))).toBe("signedOut");
  expect(readFailureKind(new HttpResponseError("MFA", 403, "mfa_required"))).toBe("secondFactor");
  expect(readFailureKind(api(403, "permissionDenied"))).toBe("forbidden");
  expect(readFailureKind(api(404))).toBe("notFound");
  expect(readFailureKind(api(429))).toBe("rateLimited");
  expect(readFailureKind(api(403, "forgeUnavailable", 1_000))).toBe("rateLimited");
  for (const error of [api(502), new TypeError("Failed to fetch"), new Error("Empty response"), undefined])
    expect(readFailureKind(error)).toBe("unavailable");
  expect(readFailureRetryAt(api(429, undefined, 5_000))).toBe(5_000);
  expect(readFailureRetryAt(api(429))).toBe(0);
});
