import { afterEach, expect, it, vi } from "vitest";
import { PageSearchProjectionCache } from "./pages-search-projection-cache";

afterEach(() => vi.useRealTimers());

it("shares concurrent projections and removes expired plaintext from memory", async () => {
  vi.useFakeTimers();
  const cache = new PageSearchProjectionCache(100, 2, 100);
  const project = vi.fn(async () => "Markdown");
  expect(await Promise.all([cache.get("cipher-a", project), cache.get("cipher-a", project)]))
    .toEqual(["Markdown", "Markdown"]);
  expect(project).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(101);
  await cache.get("cipher-a", project);
  expect(project).toHaveBeenCalledTimes(2);
});

it("bounds UTF-8 bytes and retries failed projections without retaining them", async () => {
  vi.useFakeTimers();
  const cache = new PageSearchProjectionCache(100, 2, 5);
  const project = vi.fn(async () => "北京");
  await cache.get("large", project);
  await cache.get("large", project);
  expect(project).toHaveBeenCalledTimes(2);
  const first = vi.fn(async () => "aaaa");
  await cache.get("first", first);
  await cache.get("second", async () => "bb");
  await cache.get("first", first);
  expect(first).toHaveBeenCalledTimes(2);
  await expect(cache.get("failure", async () => { throw Error("projection failed"); }))
    .rejects.toThrow("projection failed");
  expect(await cache.get("failure", async () => "ok")).toBe("ok");
});
