import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/server/capabilities", () => ({ capability: () => ({ configured: true }) }));
import { listVercelProjectDomains, removeDomainFromVercel } from "./vercel-domains";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("MDY_FAKE_VERCEL_DOMAINS", "0");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj-test");
  vi.stubEnv("VERCEL_TEAM_ID", "team-test");
  vi.stubGlobal("fetch", vi.fn());
});

it("reads all project-domain pages with team scope and a bounded timeout", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ domains: [{ name: "one.example.com", createdAt: 1 }], pagination: { next: 10 } }))
    .mockResolvedValueOnce(Response.json({ domains: [{ name: "two.example.com", createdAt: 2 }], pagination: { next: null } }));
  expect(await listVercelProjectDomains()).toHaveLength(2);
  const url = new URL(String(vi.mocked(fetch).mock.calls[1][0]));
  expect(url.pathname).toBe("/v9/projects/prj-test/domains");
  expect(url.searchParams.get("until")).toBe("10");
  expect(url.searchParams.get("teamId")).toBe("team-test");
  expect(url.searchParams.get("production")).toBe("true");
  expect(vi.mocked(fetch).mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
});

it("refuses a partial inventory after a provider failure", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ domains: [{ name: "one.example.com" }], pagination: { next: 10 } }))
    .mockResolvedValueOnce(new Response("outage", { status: 503 }));
  await expect(listVercelProjectDomains()).rejects.toThrow("Unable to list");
});

it("rejects non-progressing pagination", async () => {
  vi.mocked(fetch).mockImplementation(async () => Response.json({ domains: [], pagination: { next: 10 } }));
  await expect(listVercelProjectDomains()).rejects.toThrow("Invalid Vercel domain pagination");
});

it("accepts an already detached provider resource", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
  expect(await removeDomainFromVercel("feedback.example.com")).toEqual({ ok: true });
});
