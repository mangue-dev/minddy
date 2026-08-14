import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-184 — `resolveLinkPreview` est la seule chose qui fait SORTIR une requête
 * HTTP depuis une URL tapée par un utilisateur. Deux propriétés comptent, et
 * elles tirent dans des sens opposés :
 *
 *  1. **Refuser ce qui n'est pas public.** `localhost`, une IP privée, un
 *     protocole exotique : la garde anti-SSRF doit lever
 *     `FaviconError("invalidUrl")` AVANT tout appel réseau. Le test le vérifie
 *     par l'absence d'appel, pas seulement par l'erreur — une garde qui lève
 *     après avoir déjà tapé sur l'hôte n'aurait rien gardé.
 *  2. **Ne pas échouer sur une URL publique valide.** Un site éteint, sans
 *     favicon, sans <title>, ou qui rend un HTML démesuré reste un lien qu'on
 *     doit pouvoir enregistrer — avec son hostname pour titre.
 *
 * MIN-336 en ajoute une troisième : la requête part vers l'**adresse validée**,
 * pas vers le nom. Le mock est donc posé sur `pinnedRequest`, ce qui laisse
 * jouer tout le garde-fou (résolution, revalidation des redirections, plafond
 * d'octets) et permet d'asserter l'adresse épinglée.
 */

const lookup = vi.hoisted(() => vi.fn());
const pinnedRequest = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("server-only", () => ({}));
vi.mock("./pinned-request", () => ({ pinnedRequest }));

const { FaviconError, resolveLinkPreview } = await import("./favicon");

/** Une réponse comme en rend `pinnedRequest` : corps en flux, jetable. */
function response(
  body: string | Buffer,
  { status = 200, headers = {} as Record<string, string> } = {}
) {
  const stream = Readable.from([Buffer.from(body as never)]);
  return {
    status,
    headers: new Headers(headers),
    stream,
    destroy: () => stream.destroy(),
  };
}

function htmlResponse(html: string, contentType = "text/html") {
  return response(html, { headers: { "content-type": contentType } });
}

/** Chaque appel rend la réponse suivante — recréée à chaque fois, un flux ne se
    lit qu'une fois. */
function replies(...makers: (() => ReturnType<typeof response>)[]) {
  let call = 0;
  pinnedRequest.mockImplementation(async () =>
    (makers[Math.min(call++, makers.length - 1)] ?? makers[makers.length - 1])()
  );
}

beforeEach(() => {
  pinnedRequest.mockReset();
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
    ["une IPv4 privée déguisée en IPv6", "http://[::ffff:c0a8:1]/"],
    ["une IPv4 privée en 6to4", "http://[2002:a00:1::1]/"],
  ])("refuse %s sans jamais sortir", async (_label, url) => {
    await expect(resolveLinkPreview(url)).rejects.toBeInstanceOf(FaviconError);
    await expect(resolveLinkPreview(url)).rejects.toMatchObject({ key: "invalidUrl" });
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("refuse un hôte dont le DNS pointe vers une IP privée", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5" }]);
    await expect(resolveLinkPreview("https://interne.exemple.com")).rejects.toMatchObject(
      { key: "invalidUrl" }
    );
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("refuse un hôte qui répond une adresse publique ET une privée", async () => {
    // Le rebinding DNS commence ici : servir les deux, puis compter sur une
    // seconde résolution au moment de se connecter.
    lookup.mockResolvedValue([{ address: "93.184.216.34" }, { address: "169.254.169.254" }]);
    await expect(resolveLinkPreview("https://rebind.exemple.com")).rejects.toMatchObject(
      { key: "invalidUrl" }
    );
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("refuse un hôte dont le DNS ne résout pas", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(resolveLinkPreview("https://nexistepas.exemple")).rejects.toMatchObject(
      { key: "invalidUrl" }
    );
  });

  it("refuse une redirection vers une adresse privée", async () => {
    replies(() =>
      response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })
    );
    await expect(resolveLinkPreview("https://exemple.com")).rejects.toMatchObject({
      key: "invalidUrl",
    });
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
  });
});

describe("resolveLinkPreview — la connexion est épinglée", () => {
  it("se connecte à l'adresse résolue, pas au nom", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
    replies(() => htmlResponse("<title>Site</title>"), () => response("", { status: 404 }));
    await resolveLinkPreview("https://exemple.com");
    expect(pinnedRequest.mock.calls[0][1].address).toBe("93.184.216.34");
    expect(pinnedRequest.mock.calls[0][0].hostname).toBe("exemple.com");
  });

  it("revalide et ré-épingle chaque redirection", async () => {
    lookup.mockImplementation(async (host: string) =>
      host === "exemple.com" ? [{ address: "93.184.216.34" }] : [{ address: "1.2.3.4" }]
    );
    replies(
      () => response("", { status: 301, headers: { location: "https://ailleurs.exemple/" } }),
      () => htmlResponse("<title>Ailleurs</title>"),
      () => response("", { status: 404 })
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.title).toBe("Ailleurs");
    expect(preview.url).toBe("https://ailleurs.exemple/");
    expect(pinnedRequest.mock.calls[1][1].address).toBe("1.2.3.4");
  });
});

describe("resolveLinkPreview — ce qui aboutit", () => {
  it("préfixe https:// quand le schéma manque", async () => {
    replies(() => htmlResponse("<title>Linear</title>"), () => response("", { status: 404 }));
    const preview = await resolveLinkPreview("linear.app");
    expect(preview.url).toBe("https://linear.app/");
    expect(preview.title).toBe("Linear");
  });

  it("préfixe aussi un hôte à port, qui n'est pas un schéma", async () => {
    // `exemple.com:8080` porte un `:` sans porter de schéma. Le confondre avec
    // un protocole exotique le faisait refuser côté serveur alors même que
    // l'app venait de l'accepter.
    replies(() => htmlResponse("<title>App</title>"), () => response("", { status: 404 }));
    const preview = await resolveLinkPreview("exemple.com:8080/docs");
    expect(preview.url).toBe("https://exemple.com:8080/docs");
    expect(preview.title).toBe("App");
  });

  it("prend og:title devant <title>", async () => {
    replies(
      () =>
        htmlResponse(
          '<title>Fallback</title><meta property="og:title" content="Le vrai titre">'
        ),
      () => response("", { status: 404 })
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.title).toBe("Le vrai titre");
  });

  it("décode les entités du titre", async () => {
    replies(() => htmlResponse("<title>Nous &amp; eux</title>"), () => response("", { status: 404 }));
    expect((await resolveLinkPreview("https://exemple.com")).title).toBe("Nous & eux");
  });

  it("retombe sur le hostname quand la page n'a pas de titre", async () => {
    replies(() => htmlResponse("<html><body>rien</body></html>"), () => response("", { status: 404 }));
    const preview = await resolveLinkPreview("https://www.exemple.com/page");
    expect(preview.title).toBe("exemple.com");
    expect(preview.icon).toBeNull();
  });

  it("rend un aperçu partiel quand le site ne répond pas", async () => {
    pinnedRequest.mockRejectedValue(new Error("ECONNREFUSED"));
    const preview = await resolveLinkPreview("https://eteint.exemple.com");
    expect(preview.title).toBe("eteint.exemple.com");
    expect(preview.icon).toBeNull();
    expect(preview.url).toBe("https://eteint.exemple.com/");
  });

  it("coupe un HTML démesuré au plafond, et lit quand même son <head>", async () => {
    // 2 Mo : au-dessus du plafond d'un mégaoctet. La lecture s'arrête au
    // plafond — le reste n'est jamais téléchargé — mais ce qui a été lu sert :
    // le `<head>` est en tête, et un site un peu gros (linear.app fait 1,2 Mo)
    // n'a pas à perdre son titre pour autant.
    const huge = `<title>Titre</title>${"x".repeat(2 * 1024 * 1024)}`;
    replies(() => htmlResponse(huge), () => response("", { status: 404 }));
    const preview = await resolveLinkPreview("https://enorme.exemple.com");
    expect(preview.title).toBe("Titre");
    expect(preview.icon).toBeNull();
  });

  it("refuse une icône dont le content-length annoncé dépasse le plafond", async () => {
    // Une image, elle, ne se tronque pas : à moitié lue, elle est cassée.
    replies(
      () => htmlResponse('<link rel="icon" href="/fav.png"><title>Site</title>'),
      () =>
        response(Buffer.from([1, 2, 3]), {
          headers: { "content-type": "image/png", "content-length": String(5 * 1024 * 1024) },
        })
    );
    const preview = await resolveLinkPreview("https://menteur.exemple.com");
    expect(preview.title).toBe("Site");
    expect(preview.icon).toBeNull();
  });

  it("ramène le favicon déclaré par la page", async () => {
    replies(
      () => htmlResponse('<title>Site</title><link rel="icon" href="/fav.png">'),
      () => response(Buffer.from([1, 2, 3]), { headers: { "content-type": "image/png" } })
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon?.contentType).toBe("image/png");
    expect(preview.icon?.bytes.byteLength).toBe(3);
    expect(preview.title).toBe("Site");
  });

  it("essaie /favicon.ico quand la page n'en déclare aucun", async () => {
    replies(
      () => htmlResponse("<title>Site</title>"),
      () => response(Buffer.from([9]), { headers: { "content-type": "image/x-icon" } })
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon?.contentType).toBe("image/x-icon");
    expect(pinnedRequest.mock.calls[1][0].toString()).toBe("https://exemple.com/favicon.ico");
  });

  it("ignore une icône dont le MIME n'en est pas une (SVG, HTML d'erreur)", async () => {
    replies(
      () => htmlResponse('<title>Site</title><link rel="icon" href="/fav.svg">'),
      () => htmlResponse("<html>404</html>")
    );
    const preview = await resolveLinkPreview("https://exemple.com");
    expect(preview.icon).toBeNull();
    expect(preview.title).toBe("Site");
  });
});
