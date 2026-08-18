import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DomainTarget, PublicTokenKind } from "@/lib/custom-domain-lookup";

/**
 * WHAT A CLIENT DOMAIN IS USED FOR, AND UNDER WHAT HEADERS (MIN-337).
 *
 * Two faults, both invisible when reading a single file:
 *
 * - `/f/`, `/share/` and `/p/` are passing on a custom domain (the board has
 * needs its own subpaths). The token being an identifier
 * GLOBAL, `feedback.acme.com/f/<token d'un concurrent>` made the board of the
 * competitor — valid HTTPS, under the Acme brand.
 * - the `/` of a custom domain serves a personalized page per cookie, and
 * fell under the CDN cache header placed on `/` for the landing: the CDN
 * could serve to one visitor another's page.
 *
 * The lookup is the only module mocked: it is the network boundary. Everything else
 * — the real proxy, its prefixes, its rewrites — runs.
 */

const DOMAIN_PROJECT = "project-acme";
const OWN_TOKEN = "tok-acme";

const lookupCustomDomain = vi.fn<(host: string) => Promise<DomainTarget | null>>();
const lookupTokenProject = vi.fn<(kind: PublicTokenKind, token: string) => Promise<string | null>>();

vi.mock("@/lib/custom-domain-lookup", () => ({
  lookupCustomDomain: (host: string) => lookupCustomDomain(host),
  lookupTokenProject: (kind: PublicTokenKind, token: string) => lookupTokenProject(kind, token),
}));

const { proxy } = await import("@/proxy");

const HOST = "feedback.acme.com";

function request(pathname: string, host = HOST): NextRequest {
  return new NextRequest(`https://${host}${pathname}`, { headers: { host } });
}

beforeEach(() => {
  lookupCustomDomain.mockReset();
  lookupTokenProject.mockReset();
  lookupCustomDomain.mockResolvedValue({
    kind: "feedback",
    token: OWN_TOKEN,
    projectId: DOMAIN_PROJECT,
  });
  lookupTokenProject.mockResolvedValue(DOMAIN_PROJECT);
});

describe("foreign tenants on a customer's domain", () => {
  it.each([
    ["/f/tok-other", "feedback" as const],
    ["/share/tok-other", "share" as const],
    ["/p/tok-other", "page" as const],
  ])("404s %s when the token belongs to another project", async (pathname, kind) => {
    lookupTokenProject.mockResolvedValue("project-other");

    const response = await proxy(request(pathname));

    expect(response.status).toBe(404);
    expect(lookupTokenProject).toHaveBeenCalledWith(kind, "tok-other");
    // No rewriting: the request never reaches the neighbor's page.
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("404s a token nobody owns, exactly like a foreign one", async () => {
    lookupTokenProject.mockResolvedValue(null);
    expect((await proxy(request("/f/nope"))).status).toBe(404);
  });

  it("404s a token-less prefix (/f/, /p/) rather than letting it through", async () => {
    expect((await proxy(request("/f/"))).status).toBe(404);
    expect(lookupTokenProject).not.toHaveBeenCalled();
  });

  it("lets the domain's OWN board through, sub-paths included", async () => {
    const response = await proxy(request(`/f/${OWN_TOKEN}/p/42?sort=top`));
    expect(response.status).toBe(200);
    expect(lookupTokenProject).toHaveBeenCalledWith("feedback", OWN_TOKEN);
  });

  it("lets through a shared view of the SAME project (cross-navigation)", async () => {
    lookupTokenProject.mockResolvedValue(DOMAIN_PROJECT);
    expect((await proxy(request("/share/tok-sibling"))).status).toBe(200);
  });

  it("asks nothing of the token lookup on paths that carry none", async () => {
    for (const pathname of ["/favicon.ico", "/icon", "/manifest.json", "/_next/whatever"]) {
      expect((await proxy(request(pathname))).status).toBe(200);
    }
    expect(lookupTokenProject).not.toHaveBeenCalled();
  });

  it("serves nothing at all on a host with no verified mapping", async () => {
    lookupCustomDomain.mockResolvedValue(null);
    for (const pathname of ["/", `/f/${OWN_TOKEN}`, "/favicon.ico"]) {
      expect((await proxy(request(pathname))).status).toBe(404);
    }
  });
});

describe("no shared cache on a customer's domain", () => {
  it.each(["/", `/f/${OWN_TOKEN}`, "/robots.txt", "/sitemap.xml", "/favicon.ico", "/nope"])(
    "marks %s private and un-cacheable by the CDN",
    async (pathname) => {
      const response = await proxy(request(pathname));
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    },
  );

  it("keeps the root rewrite (and its noindex) while doing so", async () => {
    const response = await proxy(request("/"));
    expect(response.headers.get("x-middleware-rewrite")).toContain(`/f/${OWN_TOKEN}`);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});
