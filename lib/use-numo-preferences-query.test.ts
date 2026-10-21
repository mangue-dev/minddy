import { afterEach, expect, it, vi } from "vitest";
import { HttpResponseError, retryTemporaryReadFailure } from "./backend-availability";
import { saveNumoPreferencesApi } from "./use-numo-preferences-query";

afterEach(() => vi.unstubAllGlobals());

const patch = { provider: "openrouter" as const, default_model: null };

it("keeps the HTTP status of a non-JSON gateway failure (MIN-722)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Gateway timeout</html>", { status: 504 })));
  const error = await saveNumoPreferencesApi(patch).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpResponseError);
  expect(error).toMatchObject({ status: 504, message: "Could not save Numo preferences" });
  expect(retryTemporaryReadFailure(0, error)).toBe(true);
});

it("reports a refused session as definitive instead of retrying it", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Unauthorized", code: "sessionInvalid" }, { status: 401 })));
  const error = await saveNumoPreferencesApi(patch).catch((caught: unknown) => caught);
  expect(error).toMatchObject({ status: 401, code: "sessionInvalid", message: "Unauthorized" });
  expect(retryTemporaryReadFailure(0, error)).toBe(false);
});
