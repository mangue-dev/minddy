import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateCustomDomainCache,
  lookupCustomDomain,
  lookupTokenProject,
} from "./custom-domain-lookup";

/**
 * LE LOOKUP QUI DÉCIDE CE QU'UN DOMAINE CLIENT A LE DROIT DE SERVIR (MIN-337).
 *
 * Deux garanties qu'aucun type ne porte :
 *   - un domaine dont la propriété n'est PAS vérifiée n'est pas routé — la ligne
 *     existait dès la saisie du domaine, et rien ne vérifiait qu'on le possédait ;
 *   - le lookup rend le PROJET du domaine, sans quoi le proxy ne peut pas
 *     distinguer un token maison d'un token étranger.
 *
 * Le cache est aussi testé pour lui-même : c'est un état global de module, et
 * la seule chose qui le remplit est la réponse à une requête portant le host
 * demandé — un `Host:` fabriqué ne peut pas peupler l'entrée d'un autre.
 */

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://db.example.com",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
};

const fetchMock = vi.fn();

function respond(rows: unknown[]) {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => rows });
}

function urls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  Object.assign(process.env, ENV);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  invalidateCustomDomainCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupCustomDomain", () => {
  it("only ever asks for verified domains", async () => {
    respond([]);
    await lookupCustomDomain("feedback.acme.com");
    expect(urls()[0]).toContain("status=eq.verified");
    expect(urls()[0]).toContain("domain=eq.feedback.acme.com");
  });

  it("returns the board token and the project that owns it", async () => {
    respond([
      {
        feedback_boards: { token: "tok-acme", project_id: "project-a" },
        view_shares: null,
      },
    ]);
    expect(await lookupCustomDomain("feedback.acme.com")).toEqual({
      kind: "feedback",
      token: "tok-acme",
      projectId: "project-a",
    });
  });

  it("resolves a shared view's project through its view, and a page's through its page", async () => {
    respond([
      {
        feedback_boards: null,
        view_shares: { token: "tok-view", views: { project_id: "project-v" }, pages: null },
      },
    ]);
    expect(await lookupCustomDomain("roadmap.acme.com")).toEqual({
      kind: "share",
      token: "tok-view",
      projectId: "project-v",
    });

    respond([
      {
        feedback_boards: null,
        view_shares: { token: "tok-page", views: null, pages: { project_id: "project-p" } },
      },
    ]);
    expect(await lookupCustomDomain("docs.acme.com")).toEqual({
      kind: "share",
      token: "tok-page",
      projectId: "project-p",
    });
  });

  it("caches per host, and never lets one host's answer stand in for another's", async () => {
    respond([
      { feedback_boards: { token: "tok-acme", project_id: "project-a" }, view_shares: null },
    ]);
    respond([]);

    const first = await lookupCustomDomain("feedback.acme.com");
    // Deuxième visite du MÊME host : servie par le cache, pas de requête de plus.
    expect(await lookupCustomDomain("feedback.acme.com")).toEqual(first);
    // Un host fabriqué ne lit pas l'entrée du voisin : il paie sa propre requête,
    // et n'obtient que ce que la base répond POUR LUI.
    expect(await lookupCustomDomain("feedback.acme.com.evil.test")).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls()[1]).toContain("domain=eq.feedback.acme.com.evil.test");
  });

  it("stays null (never throws) when PostgREST is down or unconfigured", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await lookupCustomDomain("feedback.acme.com")).toBeNull();

    invalidateCustomDomainCache();
    fetchMock.mockRejectedValueOnce(new Error("fetch failed"));
    expect(await lookupCustomDomain("feedback.acme.com")).toBeNull();
  });
});

describe("lookupTokenProject", () => {
  it("reads a board token straight off feedback_boards", async () => {
    respond([{ project_id: "project-a" }]);
    expect(await lookupTokenProject("feedback", "tok-acme")).toBe("project-a");
    expect(urls()[0]).toContain("feedback_boards?token=eq.tok-acme");
  });

  it("reads share and page tokens off view_shares, which holds both", async () => {
    respond([{ views: { project_id: "project-v" }, pages: null }]);
    expect(await lookupTokenProject("share", "tok-view")).toBe("project-v");
    expect(urls()[0]).toContain("view_shares?token=eq.tok-view");

    respond([{ views: null, pages: { project_id: "project-p" } }]);
    expect(await lookupTokenProject("page", "tok-page")).toBe("project-p");
  });

  it("returns null on an unknown token", async () => {
    respond([]);
    expect(await lookupTokenProject("feedback", "nope")).toBeNull();
  });

  it("caches by table, so a page and a view share one lookup path", async () => {
    respond([{ views: { project_id: "project-v" }, pages: null }]);
    expect(await lookupTokenProject("share", "tok-view")).toBe("project-v");
    expect(await lookupTokenProject("page", "tok-view")).toBe("project-v");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("escapes a token before putting it in the query string", async () => {
    respond([]);
    await lookupTokenProject("feedback", "a&b=c");
    expect(urls()[0]).toContain("token=eq.a%26b%3Dc");
  });
});
