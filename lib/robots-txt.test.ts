import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/robots.txt/route";
import { SITE_URL } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

/** The directives Googlebot reads; anything else is reported as ignored. */
const GOOGLE_DIRECTIVES = /^(User-agent|Allow|Disallow|Sitemap):/;

describe("robots.txt", () => {
  it("only uses directives Googlebot reads in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const lines = (await GET().text()).split("\n").filter(line => line && !line.startsWith("#"));
    expect(lines.filter(line => !GOOGLE_DIRECTIVES.test(line))).toEqual([]);
    expect(lines).toContain("User-agent: Googlebot");
    expect(lines).toContain("Disallow: /api/");
    expect(lines).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("states the content signals as a comment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await GET().text()).toMatch(/^# Content signals: search=yes, ai-input=yes, ai-train=yes$/m);
  });

  it("blocks every crawler outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(await GET().text()).toBe("User-agent: *\nDisallow: /\n");
  });
});
