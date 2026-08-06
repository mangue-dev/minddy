import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-184 — `resolveLinkPreview` est la seule chose qui fait SORTIR une requête
 * HTTP depuis une URL tapée par un utilisateur. Deux propriétés comptent, et
 * elles tirent dans des sens opposés :
 *
 *  1. **Refuser ce qui n'est pas public.** `localhost`, une IP privée, un
 *     protocole exotique : la garde anti-SSRF de favicon.ts doit lever
 *     `FaviconError("invalidUrl")` AVANT tout fetch. Le test le vérifie par
 *     l'absence d'appel réseau, pas seulement par l'erreur — une garde qui lève
 *     après avoir déjà tapé sur l'hôte n'aurait rien gardé.
 *  2. **Ne pas échouer sur une URL publique valide.** Un site éteint, sans
 *     favicon, sans <title>, ou qui rend un HTML démesuré reste un lien qu'on
 *     doit pouvoir enregistrer — avec son hostname pour titre.
 *
 * Aucun accès réseau réel : `fetch` et la résolution DNS sont stubbés.
 */

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("server-only", () => ({}));

const { FaviconError, resolveLinkPreview } = await import("./favicon");

const fetchMock = vi.fn();

/** Réponse HTML minimale, corps lisible en flux (readCapped lit un reader). */
function htmlResponse(html: string, contentType = "text/html"): Response {
  return new Response(html, { status: 200, headers: { "content-type": contentType } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  lookup.mockReset();
  // Par défaut, tout hôte résout vers une IP publique.
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveLinkPreview — ce qui est refusé", () => {
  it.each([
    ["localhost", "http://localhost:3000/admin"],
    ["une IP privée", "http://192.168.1.10/"],
    ["la loopback", "http://127.0.0.1:5432/"],
    ["un .local", "http://nas.local/"],
    ["un protocole non http(s)", "javascript:alert(1)"],
    ["une data URL", "data:text/html,<h1>x</h1>"],
    ["un file://", "file:///etc/passwd"],
  ])("refuse %s sans jamais fetcher", async (_label, url) => {
    await expect(resolveLinkPreview(url)).rejects.toBeInstanceOf(FaviconError);
    await expect(resolveLinkPreview(url)).rejects.toMatchObject({
      key: "invalidUrl",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse un hôte dont le DNS pointe vers une IP privée", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5" }]);
    await expect(resolveLinkPreview("https://interne.exemple.com")).rejects.toMatchObject(
      { key: "invalidUrl" }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse un hôte dont le DNS ne résout pas", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(resolveLinkPreview("https://nexistepas.exemple")).rejects.toMatchObject(
      { key: "invalidUrl" }
    );
  });
});

describe("resolveLinkPreview — ce qui aboutit", () => {
  it("préfixe https:// quand le schéma manque", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<title>Linear</title>"));
    const preview = await resolveLinkPreview("linear.app");
    expect(preview.url).toBe("https://linear.app/");
    expect(preview.title).toBe("Linear");
  });

  it("préfixe aussi un hôte à port, qui n'est pas un schéma", async () => {
    // `exemple.com:8080` porte un `:` sans porter de schéma. Le confondre avec
    // un protocole exotique le faisait refuser côté serveur alors même que
    // l'app venait de l'accepter.
    fetchMock.mockResolvedValue(htmlResponse("<title>App</title>"));
    const preview = await resolveLinkPreview("exemple.com:8080/docs");
    expect(preview.url).toBe("https://exemple.com:8080/docs");
    expect(preview.title).toBe("App");
  });

  it("prend og:title devant <title>", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        '<title>Fallback</title><meta property="og:title" content="Le vrai titre">'
      )
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.title).toBe("Le vrai titre");
  });

  it("décode les entités du titre", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<title>Nous &amp; eux</title>"));
    expect((await resolveLinkPreview("https://exemple.com")).title).toBe("Nous & eux");
  });

  it("retombe sur le hostname quand la page n'a pas de titre", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<html><body>rien</body></html>"));
    const preview = await resolveLinkPreview("https://www.exemple.com/page");
    expect(preview.title).toBe("exemple.com");
    expect(preview.icon).toBeNull();
  });

  it("rend un aperçu partiel quand le site ne répond pas", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const preview = await resolveLinkPreview("https://eteint.exemple.com");
    expect(preview.title).toBe("eteint.exemple.com");
    expect(preview.icon).toBeNull();
    expect(preview.url).toBe("https://eteint.exemple.com/");
  });

  it("coupe un HTML démesuré au plafond plutôt que de l'avaler", async () => {
    // 2 Mo : au-dessus du plafond d'un mégaoctet de readCapped. Le titre est en
    // tête, mais la lecture est coupée — l'aperçu retombe sur le hostname au
    // lieu de charger le corps entier en mémoire.
    const huge = `<title>Titre</title>${"x".repeat(2 * 1024 * 1024)}`;
    fetchMock.mockResolvedValue(
      new Response(huge, { status: 200, headers: { "content-type": "text/html" } })
    );
    const preview = await resolveLinkPreview("https://enorme.exemple.com");
    expect(preview.title).toBe("enorme.exemple.com");
    expect(preview.icon).toBeNull();
  });

  it("ramène le favicon déclaré par la page", async () => {
    fetchMock
      .mockResolvedValueOnce(
        htmlResponse('<title>Site</title><link rel="icon" href="/fav.png">')
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon?.contentType).toBe("image/png");
    expect(preview.icon?.bytes.byteLength).toBe(3);
    expect(preview.title).toBe("Site");
  });

  it("essaie /favicon.ico quand la page n'en déclare aucun", async () => {
    fetchMock
      .mockResolvedValueOnce(htmlResponse("<title>Site</title>"))
      .mockResolvedValueOnce(
        new Response(Buffer.from([9]), {
          status: 200,
          headers: { "content-type": "image/x-icon" },
        })
      );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon?.contentType).toBe("image/x-icon");
    expect(fetchMock.mock.calls[1][0].toString()).toBe("https://exemple.com/favicon.ico");
  });

  it("ignore une icône dont le MIME n'en est pas une (SVG, HTML d'erreur)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        htmlResponse('<title>Site</title><link rel="icon" href="/fav.svg">')
      )
      .mockResolvedValue(
        new Response("<html>404</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon).toBeNull();
    expect(preview.title).toBe("Site");
  });
});
