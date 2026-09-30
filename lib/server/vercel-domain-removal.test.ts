import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/server/capabilities", () => ({ capability: () => ({ configured: true }) }));
import { removeDomainFromVercel } from "./vercel-domains";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("MDY_FAKE_VERCEL_DOMAINS", "0");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj-test");
  vi.stubEnv("VERCEL_TEAM_ID", "team-test");
  vi.stubGlobal("fetch", vi.fn());
});

it("detaches the requested hostname with team scope and a bounded timeout", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
  expect(await removeDomainFromVercel("feedback.example.com")).toEqual({ ok: true });
  const [request, options] = vi.mocked(fetch).mock.calls[0];
  const url = new URL(String(request));
  expect(url.pathname).toBe("/v9/projects/prj-test/domains/feedback.example.com");
  expect(url.searchParams.get("teamId")).toBe("team-test");
  expect(options?.method).toBe("DELETE");
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});

it("accepts an already detached provider resource", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
  expect(await removeDomainFromVercel("feedback.example.com")).toEqual({ ok: true });
});

it("reports a provider outage so the durable cleanup can retry", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 503 }));
  expect(await removeDomainFromVercel("feedback.example.com")).toEqual({ ok: false });
});
